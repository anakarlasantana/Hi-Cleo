import type { MessageJobData } from './queue.types.js';
import type { MessageProcessorPort } from './queue.port.js';
import type { Logger } from '../../shared/logger/logger.js';
import { CURRENT_TERMS_VERSION } from '../terms/constants.js';
import { env } from '../../shared/config/env.js';

export type MessageProcessor = MessageProcessorPort;

export function createMessageProcessor(container: any, logger: Logger): MessageProcessorPort {
  const log = logger.child({ module: 'processor' });

  return async (data: MessageJobData) => {
    const startTime = Date.now();
    const { phone, text, instance, isSecretaryInstance, pushName, media, messageKey } = data;

    try {
      if (isSecretaryInstance) {
        await handleSecretaryMessage(container, phone, text, media, messageKey);
      } else {
        await handleUserWhatsAppMessage(container, instance, phone, text, pushName, media, messageKey);
      }

      const durationMs = Date.now() - startTime;
      log.info({ phone: phone.slice(0, 4) + '****', instance, durationMs }, 'mensagem processada com sucesso');
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      log.error({ err: error, phone: phone.slice(0, 4) + '****', instance, durationMs }, 'erro no processamento');

      // Se todos os providers de IA falharam, envia mensagem de fallback ao usuário
      if (error?.message === 'AI_ALL_PROVIDERS_FAILED') {
        try {
          await container.messaging.sendText({
            instance,
            to: phone,
            text: '⚠️ Estou com dificuldade pra processar agora. Vou te responder em breve!\n\nCaso esteja demorando, entre em contato com o suporte.',
          });
        } catch {
          // Se nem o envio funcionar, apenas loga
        }
      }

      throw error; // Re-throw para BullMQ acionar retry
    }
  };
}

async function handleSecretaryMessage(container: any, phone: string, text: string, media?: any, messageKey?: string): Promise<void> {
  const { messaging, activationService, onboardingService, assistenteService, userRepo, termsConsentService, messageRepo, leadService } = container;

  const activationMatch = text.match(/ATIVAR-[A-Z0-9]{4}/i);
  if (activationMatch) {
    const code = activationMatch[0].toUpperCase();
    const valid = await activationService.validateCode(code);

    if (!valid) {
      await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: 'Código inválido ou expirado. Verifique o código e tente novamente.' });
      return;
    }

    const user = await activationService.activateUser(code, phone, text);
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: `Bem-vindo(a)! 🎉\n\nSeu código foi ativado com sucesso!\n\nMe confirma: posso te chamar de *${user.name}*?` });
    return;
  }

  const user = await userRepo.findByPhone(phone);
  if (!user) {
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: 'Não encontrei seu cadastro. Se você já pagou, envie seu código de ativação (formato: ATIVAR-XXXX).' });
    return;
  }

  const onboardingComplete = await onboardingService.isComplete(user.id);
  if (!onboardingComplete) {
    const response = await onboardingService.processMessage(user.id, text);
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: response });
    return;
  }

  // Check if user needs to re-accept terms
  const needsConsent = await termsConsentService.requiresConsent(user.id);
  if (needsConsent) {
    const normalized = text.trim().toLowerCase();
    if (normalized === 'aceito' || normalized === 'aceitar' || normalized === 'concordo') {
      await termsConsentService.recordConsent(user.id, CURRENT_TERMS_VERSION);
      await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: '✅ Termos aceitos! Pode continuar usando normalmente.' });
      return;
    }

    await messaging.sendText({
      instance: env.MONITOR_INSTANCE,
      to: phone,
      text: `Atualizamos nossos Termos de Uso. Para continuar usando a Cleo, acesse e aceite os novos termos: ${env.SITE_URL}/termos\n\nApós aceitar, me mande qualquer mensagem para continuar.`,
    });
    return;
  }

  // Se o professor mandou mídia (arquivo, imagem, etc.), salvar como material
  if (media) {
    // Buscar ou criar um lead "secretária" para armazenar materiais do professor
    const materialLead = await leadService.findOrCreate(user.id, 'materials', 'Materiais');
    await messageRepo.saveWithMedia({
      leadId: materialLead.id,
      text: text || media.fileName || '[material]',
      direction: 'inbound',
      mediaType: media.type,
      mediaMimeType: media.mimeType,
      mediaFileName: media.fileName,
      mediaKey: messageKey || null,
    });

    const mediaLabel = media.type === 'document' ? `📄 ${media.fileName || 'documento'}` :
      media.type === 'image' ? '🖼️ imagem' :
      media.type === 'audio' ? '🎵 áudio' : '🎬 vídeo';

    await messaging.sendText({
      instance: env.MONITOR_INSTANCE,
      to: phone,
      text: `✅ Material recebido: ${mediaLabel}\n\nQuando quiser enviar pra alguém, me diga: "manda material pro [nome]"`,
    });
    return;
  }

  const intent = await assistenteService.recognize(text);
  if (intent.confidence < 0.7) {
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: 'Não entendi bem. Pode reformular? 🤔\n\nExemplos:\n• "quem tá sem resposta?"\n• "agenda retorno pro João amanhã"\n• "mostra meus clientes"' });
    return;
  }

  const response = await executeIntent(container, user, intent);
  await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: response });
}

async function handleUserWhatsAppMessage(container: any, instance: string, phone: string, text: string, pushName?: string, media?: any, messageKey?: string): Promise<void> {
  const { messaging, sessionRepo, userRepo, exclusionRepo, leadService, messageRepo, ruleEngine } = container;

  const session = await sessionRepo.findByInstance(instance);
  if (!session) return;

  const user = await userRepo.findById(session.user_id);
  if (!user) return;

  const isExcluded = await exclusionRepo.isExcluded(user.id, phone);
  if (isExcluded) return;

  const lead = await leadService.findOrCreate(user.id, phone, pushName);

  // Salvar mensagem com ou sem mídia
  if (media) {
    await messageRepo.saveWithMedia({
      leadId: lead.id,
      text,
      direction: 'inbound',
      mediaType: media.type,
      mediaMimeType: media.mimeType,
      mediaFileName: media.fileName,
      mediaKey: messageKey || null,
    });
  } else {
    await messageRepo.save(lead.id, text, 'inbound');
  }

  await leadService.updateLastInteraction(lead.id);

  // Fetch business hours for rule evaluation
  const business = await userRepo.getBusiness(user.id);

  const isNewLead = !lead.last_interaction;
  const autoResponse = await ruleEngine.evaluate({
    user, lead, isNewLead, messageText: text, timestamp: new Date(),
    businessHoursStart: business?.business_hours_start,
    businessHoursEnd: business?.business_hours_end,
  });

  if (autoResponse) {
    await messaging.sendText({ instance, to: phone, text: autoResponse });
    await messageRepo.save(lead.id, autoResponse, 'outbound');
  }
}

async function executeIntent(container: any, user: any, intent: { type: string; entities: Record<string, string> }): Promise<string> {
  const { leadService, exclusionRepo, messageRepo, messaging, inviteService, planService } = container;

  switch (intent.type) {
    case 'invite_user': {
      const phone = intent.entities.phone || '';
      if (!phone) return 'Para quem devo enviar o convite? Me diz o número (ex: "convida 11999887766").';

      try {
        const invite = await inviteService.createInvite(user.id, phone);
        const inviteLink = `${env.SITE_URL}/conectar/convite?token=${invite.token}`;

        // Enviar link de convite para o colaborador via WhatsApp
        await messaging.sendText({
          instance: env.MONITOR_INSTANCE,
          to: phone,
          text: `Olá! Você foi convidado(a) por *${user.name || 'seu gestor'}* para usar a Cleo, sua secretária virtual.\n\n📱 Clique no link abaixo para conectar seu WhatsApp:\n${inviteLink}\n\nO convite expira em 72 horas.`,
        });

        const slots = await planService.getRemainingSlots(user.id);
        return `✅ Convite enviado para ${phone}!\n\nConexões: ${slots.used} de ${slots.total} usadas (${slots.remaining} restantes).`;
      } catch (error: any) {
        if (error.message === 'NO_SLOTS_AVAILABLE') {
          const slots = await planService.getRemainingSlots(user.id);
          return `❌ Limite de conexões atingido (${slots.used}/${slots.total}). Desconecte alguém ou faça upgrade.`;
        }
        if (error.message === 'SUBSCRIPTION_INACTIVE') {
          return '❌ Sua assinatura está inativa. Renove para convidar colaboradores.';
        }
        return '❌ Erro ao criar convite. Tente novamente.';
      }
    }

    case 'disconnect_user': {
      const phone = intent.entities.phone || '';
      if (!phone) return 'Qual número quer desconectar? Me diz o número (ex: "desconecta 11999887766").';

      try {
        await inviteService.disconnectCollaborator(user.id, phone);
        const slots = await planService.getRemainingSlots(user.id);
        return `✅ Conexão de ${phone} desconectada!\n\nConexões: ${slots.used} de ${slots.total} usadas (${slots.remaining} vagas livres).`;
      } catch (error: any) {
        if (error.message === 'COLLABORATOR_NOT_FOUND') {
          return `❌ Não encontrei ${phone} nas suas conexões. Verifique o número.`;
        }
        return '❌ Erro ao desconectar. Tente novamente.';
      }
    }

    case 'list_leads': {
      const leads = await leadService.listByStatus(user.id, 'new');
      if (leads.length === 0) return 'Você não tem clientes novos no momento. 📭';
      const list = leads.slice(0, 10).map((l: any, i: number) => `${i + 1}. *${l.name}* (${l.phone})`).join('\n');
      return `📋 Seus clientes:\n\n${list}`;
    }
    case 'leads_today': {
      const leads = await leadService.listToday(user.id);
      if (leads.length === 0) return 'Nenhum cliente novo hoje. 📭';
      const list = leads.map((l: any, i: number) => `${i + 1}. *${l.name}*`).join('\n');
      return `📋 Clientes novos de hoje:\n\n${list}`;
    }
    case 'no_reply': {
      const leads = await leadService.listNoReply(user.id);
      if (leads.length === 0) return 'Todos os clientes estão com retorno em dia! ✅';
      const list = leads.slice(0, 10).map((l: any, i: number) => `${i + 1}. *${l.name}* (${l.phone})`).join('\n');
      return `⚠️ Clientes esperando retorno:\n\n${list}`;
    }
    case 'hot_leads': {
      const leads = await leadService.listByStatus(user.id, 'hot');
      if (leads.length === 0) return 'Nenhum cliente quente no momento.';
      const list = leads.slice(0, 10).map((l: any, i: number) => `${i + 1}. 🔥 *${l.name}*`).join('\n');
      return `🔥 Clientes quentes:\n\n${list}`;
    }
    case 'send_material': {
      const name = intent.entities.name || '';
      if (!name) return 'Para quem devo enviar o material? Me diz o nome do contato.';

      // Buscar lead pelo nome
      const leads = await leadService.searchByName(user.id, name);
      if (leads.length === 0) return `Não encontrei nenhum contato com o nome "${name}". Verifique e tente novamente.`;

      const targetLead = leads[0];

      // Buscar último material enviado pelo professor
      const materialLead = await leadService.findByPhone(user.id, 'materials');
      if (!materialLead) return 'Você ainda não me enviou nenhum material. Mande o arquivo aqui primeiro!';

      const materials = await messageRepo.getMediaMessages(materialLead.id);
      if (materials.length === 0) return 'Você ainda não me enviou nenhum material. Mande o arquivo aqui primeiro!';

      const lastMaterial = materials[0];

      if (!lastMaterial.media_key) {
        return 'Não consegui reenviar o último material. Tente mandar o arquivo de novo.';
      }

      // Buscar sessão do usuário para enviar pela instância correta
      const session = await container.sessionRepo.findByUserId(user.id);
      if (!session) return 'Sua conexão WhatsApp não está ativa. Reconecte pelo /conectar.';

      // Forward da mensagem original (reenvia o arquivo real)
      await messaging.forwardMessage({
        instance: session.instance_name,
        to: targetLead.phone,
        messageId: lastMaterial.media_key,
      });

      return `✅ Material enviado para *${targetLead.name}*!`;
    }
    case 'ignore_contact': {
      const name = intent.entities.name || '';
      const phone = intent.entities.phone || '';
      if (!name && !phone) return 'Qual contato você quer ignorar? Me diz o nome ou número.';
      await exclusionRepo.add(user.id, phone || name, name);
      return `✅ Pronto! O contato *${name || phone}* foi marcado como pessoal.`;
    }
    case 'list_ignored': {
      const ignored = await exclusionRepo.list(user.id);
      if (ignored.length === 0) return 'Você não tem nenhum contato na lista de ignorados.';
      const list = ignored.map((c: any, i: number) => `${i + 1}. ${c.name} (${c.phone})`).join('\n');
      return `🚫 Contatos ignorados:\n\n${list}`;
    }
    case 'stop_ignoring': {
      const name = intent.entities.name || '';
      const phone = intent.entities.phone || '';
      if (!name && !phone) return 'Qual contato você quer voltar a acompanhar?';
      await exclusionRepo.remove(user.id, phone || name);
      return `✅ Voltei a acompanhar *${name || phone}*.`;
    }
    default:
      return 'Entendi o que você quer, mas essa função ainda está sendo preparada. Em breve! 🚧';
  }
}
