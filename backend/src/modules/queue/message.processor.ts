import type { MessageJobData } from './queue.types.js';
import type { MessageProcessorPort } from './queue.port.js';
import type { Logger } from '../../shared/logger/logger.js';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { trialAttempts, businesses } from '../../shared/schema.js';
import { CURRENT_TERMS_VERSION } from '../terms/constants.js';
import { env } from '../../shared/config/env.js';
import { transcribeAudio } from '../ai/nodes/transcribe-audio.js';
import { interpretConfirmation } from '../ai/nodes/interpret-confirmation.js';
import { generateClientReply, type BusinessContext } from '../ai/nodes/generate-client-reply.js';
import { checkBusinessHours } from '../../shared/utils/business-hours.js';
import { getDegradedReplyForClient, getDegradedReplyForOwner, type FallbackContext } from '../../shared/utils/fallback-templates.js';
import { classifyClientMessage, classifyOwnerMessage } from '../ai/nodes/local-classifier.js';

export type MessageProcessor = MessageProcessorPort;

export function createMessageProcessor(container: any, logger: Logger): MessageProcessorPort {
  const log = logger.child({ module: 'processor' });

  return async (data: MessageJobData) => {
    const startTime = Date.now();
    const { phone, text, instance, isSecretaryInstance, pushName, media, messageKey, webhookKey } = data;

    try {
      if (isSecretaryInstance) {
        await handleSecretaryMessage(container, phone, text, media, messageKey, webhookKey);
      } else {
        await handleUserWhatsAppMessage(container, instance, phone, text, pushName, media, messageKey, webhookKey);
      }

      const durationMs = Date.now() - startTime;
      log.info({ phone: phone.slice(0, 4) + '****', instance, durationMs }, 'mensagem processada com sucesso');
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      log.error({ err: error, phone: phone.slice(0, 4) + '****', instance, durationMs }, 'erro no processamento');

      // Se todos os providers de IA falharam, envia mensagem de fallback ao usuário
      if (error?.message === 'AI_ALL_PROVIDERS_FAILED') {
        try {
          const fallbackText = isSecretaryInstance
            ? getDegradedReplyForOwner()
            : '⚠️ Estou com dificuldade pra processar agora. Vou te responder em breve!\n\nCaso esteja demorando, entre em contato com o suporte.';
          await container.messaging.sendText({
            instance,
            to: phone,
            text: fallbackText,
          });
        } catch {
          // Se nem o envio funcionar, apenas loga
        }
      }

      throw error; // Re-throw para BullMQ acionar retry
    }
  };
}

async function handleSecretaryMessage(container: any, phone: string, text: string, media?: any, messageKey?: string, webhookKey?: { remoteJid: string; fromMe: boolean; id: string }): Promise<void> {
  const { messaging, activationService, onboardingService, assistenteService, userRepo, termsConsentService, messageRepo, leadService, trialRepo } = container;

  // === Detecção de resposta de prospecção pós-trial ===
  const trialAttempt = await trialRepo.findByPhone(phone);
  if (trialAttempt && trialAttempt.prospection_status === 'contacted') {
    const lowerText = text.toLowerCase();

    // Opt-out: resposta negativa
    if (/\b(não|nao|para|cancela|remove|sai|chega|pare)\b/.test(lowerText)) {
      await trialRepo.updateProspectionStatus(trialAttempt.id, 'not_interested');
      await messaging.sendText({
        instance: env.MONITOR_INSTANCE,
        to: phone,
        text: 'Entendido! Não vou mais entrar em contato. Se mudar de ideia: hicleo.com.br 😊',
      });
      return;
    }

    // Interesse: resposta positiva
    if (/\b(sim|quero|como|quanto|assinar|plano|continuar|voltar|reativar)\b/.test(lowerText)) {
      await trialRepo.updateProspectionStatus(trialAttempt.id, 'interested');
      const checkoutUrl = env.CHECKOUT_URL || 'https://hicleo.com.br/checkout';
      await messaging.sendText({
        instance: env.MONITOR_INSTANCE,
        to: phone,
        text: `Ótimo! 🎉 Acesse aqui pra escolher seu plano: ${checkoutUrl}\n\nQualquer dúvida, manda aqui que eu ajudo!`,
      });
      return;
    }

    // Resposta ambígua — não intercepta, deixa seguir o fluxo normal
  }

  const activationMatch = text.match(/ATIVAR-[A-Z0-9]{4}/i);
  if (activationMatch) {
    const code = activationMatch[0].toUpperCase();
    const valid = await activationService.validateCode(code);

    if (!valid) {
      // Diferenciar: código já usado vs expirado vs não existe
      const existing = await container.activationRepo.findCodeByValue(code);
      if (existing && existing.used) {
        await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: '✅ Esse código já foi ativado! Se você já completou a configuração, basta conectar seu WhatsApp na página que ficou aberta no computador.\n\nSe precisa de ajuda, me diz aqui!' });
      } else if (existing && new Date(existing.expires_at) < new Date()) {
        await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: '⏰ Esse código expirou. Acesse o site e solicite um novo código de ativação.' });
      } else {
        await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: '❌ Código não encontrado. Verifique se digitou corretamente (formato: ATIVAR-XXXX).' });
      }
      return;
    }

    const user = await activationService.activateUser(code, phone, text);
    const userName = user.name || 'parceiro(a)';
    const introMessage = onboardingService.getIntroMessage(userName);
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: introMessage });
    return;
  }

  const user = await userRepo.findByPhone(phone);
  if (!user) {
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: 'Não encontrei seu cadastro. Se você já pagou, envie seu código de ativação (formato: ATIVAR-XXXX).' });
    return;
  }

  const onboardingComplete = await onboardingService.isComplete(user.id);
  if (!onboardingComplete) {
    // Se chegou áudio durante onboarding, transcrever antes de processar
    let messageText = text;
    if (media?.type === 'audio' && (text === '[áudio]' || !text)) {
      // Aviso de áudio longo (>5 min)
      if (media.durationSeconds && media.durationSeconds > 300) {
        await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: '⏳ Recebi um áudio longo, pode demorar alguns segundos pra eu processar...' });
      }
      const transcribed = await transcribeAudio(phone, media.rawMessage, webhookKey, media.durationSeconds);
      if (!transcribed) {
        await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: 'Não consegui entender o áudio. Pode mandar por texto? 😊' });
        return;
      }
      messageText = transcribed;
    }
    const response = await onboardingService.processMessage(user.id, messageText);
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: response });
    return;
  }

  // Check if user needs to re-accept terms
  const needsConsent = await termsConsentService.requiresConsent(user.id);
  if (needsConsent) {
    const accepted = await interpretConfirmation(container.ai, text);
    if (accepted) {
      await termsConsentService.recordConsent(user.id, CURRENT_TERMS_VERSION);
      await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: '✅ Termos aceitos! Pode continuar usando normalmente.' });
      return;
    }

    await messaging.sendText({
      instance: env.MONITOR_INSTANCE,
      to: phone,
      text: `Atualizamos nossos Termos de Uso. Para continuar usando a Cleo, acesse e aceite os novos termos: ${env.SITE_URL}/termos\n\nApós ler, me mande "aceito" ou "ok" pra continuar.`,
    });
    return;
  }

  // Se o professor mandou mídia — áudio é transcrito como comando, resto é material
  if (media) {
    if (media.type === 'audio') {
      // Aviso de áudio longo (>5 min)
      if (media.durationSeconds && media.durationSeconds > 300) {
        await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: '⏳ Recebi um áudio longo, pode demorar alguns segundos pra eu processar...' });
      }
      const transcribed = await transcribeAudio(phone, media.rawMessage, webhookKey, media.durationSeconds);
      if (transcribed) {
        const intent = await assistenteService.recognize(transcribed);
        if (intent.confidence < 0.7) {
          await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: 'Não entendi bem o áudio. Pode reformular? 🤔\n\nExemplos:\n• "quem tá sem resposta?"\n• "agenda retorno pro João amanhã"\n• "mostra meus clientes"' });
          return;
        }
        const response = await executeIntent(container, user, intent);
        await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: response });
        return;
      }
      await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: 'Não consegui entender o áudio. Pode mandar por texto? 😊' });
      return;
    }

    // Documentos, imagens e vídeos → salvar como material
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
      media.type === 'image' ? '🖼️ imagem' : '🎬 vídeo';

    await messaging.sendText({
      instance: env.MONITOR_INSTANCE,
      to: phone,
      text: `✅ Material recebido: ${mediaLabel}\n\nQuando quiser enviar pra alguém, me diga: "manda material pro [nome]"`,
    });
    return;
  }

  // Classificador local — resolve intents simples sem chamar IA
  const localIntent = classifyOwnerMessage(text);
  if (localIntent.resolved && localIntent.intent) {
    const response = await executeIntent(container, user, { type: localIntent.intent, entities: {}, originalText: text });
    await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: phone, text: response });
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

async function handleUserWhatsAppMessage(container: any, instance: string, phone: string, text: string, pushName?: string, media?: any, messageKey?: string, webhookKey?: { remoteJid: string; fromMe: boolean; id: string }): Promise<void> {
  const { messaging, sessionRepo, userRepo, exclusionRepo, leadService, messageRepo, ruleEngine } = container;

  const session = await sessionRepo.findByInstance(instance);
  if (!session) return;

  const user = await userRepo.findById(session.user_id);
  if (!user) return;

  const isExcluded = await exclusionRepo.isExcluded(user.id, phone);
  if (isExcluded) return;

  const lead = await leadService.findOrCreate(user.id, phone, pushName);

  // Atualizar métrica leads_captured se é trial e lead acabou de ser criado
  if (user.subscription_status === 'trial' && lead.created_at) {
    const createdAt = new Date(lead.created_at);
    const isNewLead = (Date.now() - createdAt.getTime()) < 5000; // criado há menos de 5s = novo
    if (isNewLead) {
      await db.update(trialAttempts)
        .set({ leadsCaptured: sql`${trialAttempts.leadsCaptured} + 1` })
        .where(eq(trialAttempts.trialUserId, user.id));
    }
    // Marcar whatsapp_connected na primeira mensagem de cliente processada
    await db.update(trialAttempts)
      .set({ whatsappConnected: true, lastActivityAt: new Date() })
      .where(and(eq(trialAttempts.trialUserId, user.id), eq(trialAttempts.whatsappConnected, false)));
  }

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

  // Se o cliente mandou áudio, transcrever antes de gerar resposta
  let messageText = text;
  if (media?.type === 'audio' && (text === '[áudio]' || !text)) {
    // Aviso de áudio longo (>5 min)
    if (media.durationSeconds && media.durationSeconds > 300) {
      await messaging.sendText({ instance, to: phone, text: '⏳ Recebi seu áudio! Pode demorar alguns segundos pra processar...' });
    }
    const transcribed = await transcribeAudio(phone, media.rawMessage, webhookKey, media.durationSeconds);
    if (transcribed) {
      messageText = transcribed;
    } else {
      // Transcrição falhou — enviar mensagem genérica ao invés de passar '[áudio]' pra IA
      const ownerName = user.name || 'o responsável';
      const fallbackReply = `Olá! Recebi seu áudio 🎙️ Vou repassar para ${ownerName} e te retornamos em breve!`;
      await messaging.sendText({ instance, to: phone, text: fallbackReply });
      await messageRepo.save(lead.id, fallbackReply, 'outbound');
      return;
    }
  }

  // Buscar dados do negócio para gerar resposta contextual
  const business = await userRepo.getBusiness(user.id);
  if (!business) return; // Sem dados do negócio = onboarding não completo, não responde

  // === GUARD: Trial — verificar se expirou ou atingiu limite de respostas ===
  if (user.subscription_status === 'trial') {
    const trialCheck = container.trialService.checkTrialStatus(user);

    if (!trialCheck.isValid) {
      if (trialCheck.reason === 'expired') {
        // Trial expirou — mensagem genérica pro cliente, aviso pro dono
        await messaging.sendText({ instance, to: phone, text: `Olá! O responsável vai te responder em breve 😊` });
        await messageRepo.save(lead.id, `Olá! O responsável vai te responder em breve 😊`, 'outbound');
        return;
      }

      if (trialCheck.reason === 'limit_reached') {
        // Limite de respostas atingido
        await messaging.sendText({ instance, to: phone, text: `Olá! O responsável vai te responder em breve 😊` });
        await messageRepo.save(lead.id, `Olá! O responsável vai te responder em breve 😊`, 'outbound');

        // Avisar o dono (uma vez — só se ainda não avisou)
        if (user.phone && trialCheck.responsesUsed === trialCheck.responsesLimit) {
          const checkoutUrl = env.CHECKOUT_URL || 'https://hicleo.com.br/checkout';
          await messaging.sendText({
            instance: env.MONITOR_INSTANCE,
            to: user.phone,
            text: `⚠️ Limite do teste atingido (${trialCheck.responsesLimit}/${trialCheck.responsesLimit} respostas).\n\nSeus clientes não estão mais recebendo resposta automática.\n\nAssine pra continuar: ${checkoutUrl}`,
          });
        }
        return;
      }
    }

    // Trial válido — incrementar contador de respostas
    await container.trialRepo.incrementResponses(user.id);
  }

  const now = new Date();
  const { isOutsideHours, start, end } = checkBusinessHours({
    businessHoursStart: business.business_hours_start,
    businessHoursEnd: business.business_hours_end,
    timezone: business.timezone,
    businessDays: business.business_days,
  });

  // Verificar se tem mensagem customizada de fora do horário (regra do dono)
  if (isOutsideHours) {
    const customRule = await ruleEngine.evaluate({
      user, lead, isNewLead: !lead.last_interaction, messageText, timestamp: now,
      businessHoursStart: start, businessHoursEnd: end,
    });
    if (customRule) {
      await messaging.sendText({ instance, to: phone, text: customRule });
      await messageRepo.save(lead.id, customRule, 'outbound');
      return;
    }
  }

  // Classificador local — saudações simples usam template direto (sem IA)
  const localClassification = classifyClientMessage(messageText);
  if (localClassification.resolved && localClassification.intent === 'greeting') {
    const greetingReply = buildGreetingReply(business, user.name, pushName);
    await messaging.sendText({ instance, to: phone, text: greetingReply });
    await messageRepo.save(lead.id, greetingReply, 'outbound');
    return;
  }

  // Gerar resposta contextual via IA usando dados do onboarding
  const businessContext: BusinessContext = {
    ownerName: user.name || 'o responsável',
    businessDescription: business.services || business.name || '',
    targetAudience: business.target_audience || '',
    toneOfVoice: (business.tone_of_voice as any) || 'friendly_professional',
    businessHoursStart: start,
    businessHoursEnd: end,
  };

  // Buscar últimas mensagens do lead para contexto multi-turno
  const recentMessages = await messageRepo.getByLead(lead.id, 5);

  let reply: string;
  try {
    reply = await generateClientReply(container.ai, businessContext, messageText, pushName, isOutsideHours, recentMessages);
  } catch (error: any) {
    if (error?.message === 'AI_ALL_PROVIDERS_FAILED') {
      const fallbackCtx: FallbackContext = {
        ownerName: user.name,
        toneOfVoice: business.tone_of_voice as any,
        isOutsideHours,
      };
      reply = getDegradedReplyForClient(fallbackCtx);
      container.logger.warn({ phone: phone.slice(0, 4) + '****' }, 'IA indisponível — usando resposta degradada para cliente');
    } else {
      throw error;
    }
  }
  await messaging.sendText({ instance, to: phone, text: reply });
  await messageRepo.save(lead.id, reply, 'outbound');
}

function buildGreetingReply(business: any, ownerName: string, clientName?: string): string {
  const name = clientName ? `, ${clientName}` : '';
  const owner = ownerName || 'o responsável';
  const tone = business?.tone_of_voice || 'friendly_professional';

  switch (tone) {
    case 'formal':
      return `Boa tarde${name}! Sou assistente do(a) ${owner}. Em que posso ajudá-lo(a)?`;
    case 'casual':
      return `E aí${name}! 👋 Tô aqui pelo(a) ${owner}. Como posso te ajudar?`;
    default:
      return `Olá${name}! 😊 Sou assistente do(a) ${owner}. Como posso te ajudar?`;
  }
}

async function executeIntent(container: any, user: any, intent: { type: string; entities: Record<string, string>; originalText?: string }): Promise<string> {
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

    case 'help': {
      return `👋 Oi! Sou a *Cleo*, sua secretária virtual.\n\nAqui vai o que posso fazer por você:\n\n📋 *Clientes*\n• "mostra meus clientes"\n• "clientes novos de hoje"\n• "quem tá sem resposta?"\n• "clientes quentes"\n• "como tá o João?" (status de um contato)\n\n📅 *Lembretes*\n• "agenda retorno pro João amanhã"\n• "lembra de falar com a Maria segunda"\n\n📎 *Materiais*\n• Mande um arquivo aqui e eu guardo\n• "manda material pro João"\n\n⚙️ *Configurações*\n• "muda horário pra 8h às 20h"\n• "ignora 11999..." (contato pessoal)\n• "para de ignorar 11999..."\n• "quem tá ignorado?"\n\n👥 *Equipe* (planos Equipe/Empresa)\n• "convida 11999..." (adicionar conexão)\n• "desconecta 11999..." (liberar vaga)\n\n💡 Pode falar do seu jeito — eu entendo linguagem natural!`;
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
    case 'schedule_followup': {
      const name = intent.entities.name || '';
      if (!name) return 'Para quem devo agendar o retorno? Me diz o nome do contato.';

      const leads = await leadService.searchByName(user.id, name);
      if (leads.length === 0) return `Não encontrei nenhum contato com o nome "${name}". Verifique e tente novamente.`;

      const targetLead = leads[0];

      // Calcular data do follow-up (amanhã por padrão, ou data informada)
      let scheduledDate: Date;
      if (intent.entities.date) {
        scheduledDate = new Date(intent.entities.date);
        if (isNaN(scheduledDate.getTime())) {
          scheduledDate = new Date();
          scheduledDate.setDate(scheduledDate.getDate() + 1);
        }
      } else {
        scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + 1);
      }

      // Ajustar horário se informado
      if (intent.entities.time) {
        const timeMatch = intent.entities.time.match(/(\d{1,2}):?(\d{2})?/);
        if (timeMatch) {
          scheduledDate.setHours(Number(timeMatch[1]), Number(timeMatch[2] || '0'), 0, 0);
        }
      } else {
        scheduledDate.setHours(9, 0, 0, 0); // Padrão: 9h da manhã
      }

      const { followUpRepo } = container;
      await followUpRepo.schedule(targetLead.id, user.id, scheduledDate);

      const dateLabel = scheduledDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      const timeLabel = scheduledDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      return `✅ Lembrete agendado!\n\n📅 *${targetLead.name}*\n🕐 ${dateLabel} às ${timeLabel}\n\nVou te avisar na hora certa.`;
    }

    case 'configure_rule': {
      // Orientar o usuário sobre o que pode configurar via WhatsApp
      const configText = intent.originalText || '';
      const lower = configText.toLowerCase();

      // Verificar se quer mudar horário
      if (lower.includes('horário') || lower.includes('hora')) {
        const timePattern = /(\d{1,2})[:h]?(\d{2})?\s*[-aàáeé]+\s*(\d{1,2})[:h]?(\d{2})?/i;
        const match = lower.match(timePattern);

        if (match) {
          const startHour = match[1].padStart(2, '0');
          const startMin = match[2] || '00';
          const endHour = match[3].padStart(2, '0');
          const endMin = match[4] || '00';

          await db.update(businesses)
            .set({
              businessHoursStart: `${startHour}:${startMin}`,
              businessHoursEnd: `${endHour}:${endMin}`,
            })
            .where(eq(businesses.userId, user.id));

          return `✅ Horário atualizado!\n\n🕐 Agora atendo de *${startHour}:${startMin}* às *${endHour}:${endMin}*.\n\nMensagens fora desse horário vão receber a resposta automática.`;
        }

        return 'Me diz o novo horário no formato: "muda horário pra 8h às 20h" ou "horário 9h-18h".';
      }

      // Configuração genérica — orientar
      return `⚙️ Posso configurar pra você:\n\n• *Horário de atendimento* — "muda horário pra 8h às 20h"\n• *Contatos ignorados* — "ignora 11999..." ou "para de ignorar"\n\nO que quer ajustar?`;
    }

    case 'lead_status': {
      const name = intent.entities.name || '';
      if (!name) return 'Qual cliente você quer saber? Me diz o nome.';

      const leads = await leadService.searchByName(user.id, name);
      if (leads.length === 0) return `Não encontrei nenhum contato com o nome "${name}".`;

      const targetLead = leads[0];
      const lastMsg = await messageRepo.getLastMessage(targetLead.id);

      const statusLabels: Record<string, string> = {
        new: '🆕 Novo',
        hot: '🔥 Quente',
        lost: '❌ Perdido',
        closed: '✅ Fechado',
      };

      const statusLabel = statusLabels[targetLead.status] || targetLead.status;
      const createdAt = new Date(targetLead.created_at).toLocaleDateString('pt-BR');

      let response = `📋 *${targetLead.name}*\n\n📱 ${targetLead.phone}\n📊 Status: ${statusLabel}\n📅 Contato desde: ${createdAt}`;

      if (targetLead.last_interaction) {
        const lastInteraction = new Date(targetLead.last_interaction);
        const diffHours = Math.round((Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60));
        const timeLabel = diffHours < 24
          ? `${diffHours}h atrás`
          : `${Math.round(diffHours / 24)} dia(s) atrás`;
        response += `\n⏰ Última interação: ${timeLabel}`;
      }

      if (lastMsg) {
        const direction = lastMsg.direction === 'inbound' ? '← Ele(a):' : '→ Você:';
        response += `\n💬 Última msg: ${direction} "${lastMsg.text.slice(0, 60)}${lastMsg.text.length > 60 ? '...' : ''}"`;
      }

      return response;
    }

    case 'send_material': {
      const name = intent.entities.name || '';
      if (!name) return 'Para quem devo enviar o material? Me diz o nome do contato.';

      // Buscar lead pelo nome
      const leads = await leadService.searchByName(user.id, name);
      if (leads.length === 0) return `Não encontrei nenhum contato com o nome "${name}". Verifique e tente novamente.`;

      const targetLead = leads[0];

      // Buscar materiais disponíveis
      const materialLead = await leadService.findByPhone(user.id, 'materials');
      if (!materialLead) return 'Você ainda não me enviou nenhum material. Mande o arquivo aqui primeiro!';

      const materials = await messageRepo.getMediaMessages(materialLead.id);
      if (materials.length === 0) return 'Você ainda não me enviou nenhum material. Mande o arquivo aqui primeiro!';

      // Selecionar material: por nome se especificado na intent, senão por lógica de seleção
      let selectedMaterial = materials[0]; // Padrão: último material

      const materialName = intent.entities.material || '';
      if (materialName && materials.length > 1) {
        // Buscar por nome do arquivo (match parcial, case-insensitive)
        const searchLower = materialName.toLowerCase();
        const found = materials.find((m: any) => {
          const fileName = (m.media_file_name || m.text || '').toLowerCase();
          return fileName.includes(searchLower);
        });
        if (found) {
          selectedMaterial = found;
        } else {
          // Não encontrou pelo nome — listar disponíveis
          const list = materials.slice(0, 10).map((m: any, i: number) => {
            const label = m.media_file_name || m.text || `material ${i + 1}`;
            return `${i + 1}) ${label}`;
          }).join('\n');
          return `Não encontrei "${materialName}". Tenho estes materiais:\n\n${list}\n\nDiga o nome ou número do material que quer enviar.`;
        }
      } else if (!materialName && materials.length > 1) {
        // Sem nome especificado e há múltiplos — listar para escolha
        const list = materials.slice(0, 10).map((m: any, i: number) => {
          const label = m.media_file_name || m.text || `material ${i + 1}`;
          return `${i + 1}) ${label}`;
        }).join('\n');
        return `Tenho ${materials.length} materiais salvos. Qual quer enviar pro(a) *${targetLead.name}*?\n\n${list}\n\nDiga: "manda o [nome] pro ${targetLead.name}" ou o número da lista.`;
      }

      if (!selectedMaterial.media_key) {
        return 'Não consegui reenviar esse material. Tente mandar o arquivo de novo.';
      }

      // Buscar sessão do usuário para enviar pela instância correta
      const session = await container.sessionRepo.findByUserId(user.id);
      if (!session) return 'Sua conexão WhatsApp não está ativa. Reconecte pelo /conectar.';

      // Forward da mensagem original (reenvia o arquivo real)
      await messaging.forwardMessage({
        instance: session.instance_name,
        to: targetLead.phone,
        messageId: selectedMaterial.media_key,
      });

      const materialLabel = selectedMaterial.media_file_name || 'material';
      return `✅ *${materialLabel}* enviado para *${targetLead.name}*!`;
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
