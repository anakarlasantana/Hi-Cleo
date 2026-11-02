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
import { stripThinkingTags } from '../../shared/middleware/sanitize.js';
import { normalizePhone } from '../../shared/utils/phone.js';

export type MessageProcessor = MessageProcessorPort;

/**
 * Envia mensagem via WhatsApp (fire-and-forget após persistência).
 * Se o envio falhar (Evolution API offline, rate limit, etc.),
 * a mensagem já está salva no banco — loga o erro mas não re-throw.
 */
async function safeSend(messaging: any, options: { instance: string; to: string; text: string }, logger: Logger): Promise<void> {
  try {
    await messaging.sendText(options);
  } catch (error: any) {
    logger.warn({
      instance: options.instance,
      to: options.to.slice(0, 4) + '****',
      error: error.message,
    }, 'falha no envio WhatsApp (resposta já persistida no banco)');
  }
}

/**
 * Resposta padrão para um comando `/algo` que a Cleo não conhece.
 *
 * Usada nos dois caminhos do dono (instância secretary e instância própria):
 * sem isso o texto caía no interpretador de intents e a Cleo respondia a um
 * comando que o dono não deu.
 */
function unknownSlashCommandReply(command: string): string {
  return `Não conheço o comando \`/${command}\` 🤔\n\nMe diga o que você precisa em português mesmo — por exemplo:\n• "quem tá sem resposta?"\n• "clientes novos de hoje"\n• "manda ajuda" (pra ver tudo que eu faço)`;
}

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

/**
 * Quantas mensagens da conversa com o dono entram no prompt conversacional.
 * Mesmo limite usado no atendimento ao cliente (economia de tokens).
 */
const OWNER_HISTORY_LIMIT = 6;

/**
 * Histórico recente da conversa com o dono, em ordem DESC (como vem do banco) e
 * sem a mensagem atual — ela já entra no prompt como "Mensagem do dono".
 */
async function recentOwnerHistory(
  messageRepo: any,
  leadId: string | undefined,
  currentText: string,
): Promise<any[]> {
  if (!leadId) return [];

  try {
    const recent = await messageRepo.getByLead(leadId, OWNER_HISTORY_LIMIT);
    const messages: any[] = Array.isArray(recent) ? recent : [];
    const [newest] = messages;

    // A inbound atual já foi persistida antes da resposta — não duplicar no prompt.
    if (newest && newest.direction === 'inbound' && String(newest.text || '').trim() === currentText.trim()) {
      return messages.slice(1);
    }

    return messages;
  } catch {
    return [];
  }
}

/**
 * Resposta conversacional do dono COM histórico.
 *
 * Sem contexto a Cleo repetia a mesma piada/oferta a cada mensagem vaga (visto
 * no E2E, cenário `edge_case`) e nunca reconhecia o que já tinha sido dito.
 */
async function conversationalOwnerReply(
  container: any,
  user: any,
  leadId: string | undefined,
  text: string,
  maxLength: number,
): Promise<string> {
  const history = await recentOwnerHistory(container.messageRepo, leadId, text);

  // Nome do negócio deixa a oferta concreta ("quer ver os clientes da clínica?").
  // Ignorado quando é igual ao nome do dono (cadastro incompleto).
  let businessName: string | undefined;
  try {
    const business = await container.userRepo?.getBusiness?.(user.id);
    const name = typeof business?.name === 'string' ? business.name.trim() : '';
    businessName = name && name !== user.name ? name : undefined;
  } catch {
    // sem negócio configurado — segue sem o nome
  }

  const aiReply = await container.assistenteService.generateConversationalReply(
    user.name || 'um profissional',
    text,
    history,
    { businessName },
  );

  return stripThinkingTags(aiReply).slice(0, maxLength).trim();
}

async function handleSecretaryMessage(container: any, phone: string, text: string, media?: any, messageKey?: string, webhookKey?: { remoteJid: string; fromMe: boolean; id: string }): Promise<void> {
  const { messaging, activationService, onboardingService, assistenteService, userRepo, termsConsentService, messageRepo, leadService, trialRepo } = container;

  /**
   * Responde pela instância secretary seguindo o padrão persist-then-dispatch:
   * salva a resposta no banco (quando há lead para vincular) ANTES de enviar,
   * e tolera falha do WhatsApp (safeSend) — sem isso, um 500 da Evolution API
   * derrubava o job e a resposta se perdia silenciosamente.
   */
  const respond = async (replyText: string, leadId?: string): Promise<void> => {
    if (leadId) {
      await messageRepo.save(leadId, replyText, 'outbound');
    }
    await safeSend(messaging, { instance: env.MONITOR_INSTANCE, to: phone, text: replyText }, container.logger);
  };

  // === Detecção de resposta de prospecção pós-trial ===
  const trialAttempt = await trialRepo.findByPhone(phone);
  if (trialAttempt && trialAttempt.prospection_status === 'contacted') {
    const lowerText = text.toLowerCase();

    // Lead para persistência das respostas (quando o trial já tem user vinculado)
    const trialLeadId = trialAttempt.trial_user_id
      ? (await leadService.findOrCreate(trialAttempt.trial_user_id, phone, phone)).id
      : undefined;

    // Opt-out: resposta negativa
    if (/\b(não|nao|para|cancela|remove|sai|chega|pare)\b/.test(lowerText)) {
      await trialRepo.updateProspectionStatus(trialAttempt.id, 'not_interested');
      await respond('Entendido! Não vou mais entrar em contato. Se mudar de ideia: hicleo.com.br 😊', trialLeadId);
      return;
    }

    // Interesse: resposta positiva
    if (/\b(sim|quero|como|quanto|assinar|plano|continuar|voltar|reativar)\b/.test(lowerText)) {
      await trialRepo.updateProspectionStatus(trialAttempt.id, 'interested');
      const checkoutUrl = env.CHECKOUT_URL || 'https://hicleo.com.br/checkout';
      await respond(`Ótimo! 🎉 Acesse aqui pra escolher seu plano: ${checkoutUrl}\n\nQualquer dúvida, manda aqui que eu ajudo!`, trialLeadId);
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
        await respond('✅ Esse código já foi ativado! Se você já completou a configuração, basta conectar seu WhatsApp na página que ficou aberta no computador.\n\nSe precisa de ajuda, me diz aqui!');
      } else if (existing && new Date(existing.expires_at) < new Date()) {
        await respond('⏰ Esse código expirou. Acesse o site e solicite um novo código de ativação.');
      } else {
        await respond('❌ Código não encontrado. Verifique se digitou corretamente (formato: ATIVAR-XXXX).');
      }
      return;
    }

    const user = await activationService.activateUser(code, phone, text);
    const userName = user.name || 'parceiro(a)';
    // Confirmar a ativação explicitamente (crucial pro trial: a pessoa acabou de
    // mandar o código e precisa saber que funcionou antes do onboarding começar)
    const activationNote = user.subscription_status === 'trial'
      ? '✅ *Ativação concluída!* Seu teste grátis de 7 dias começou agora. 🎉\n\n'
      : '✅ *Ativação concluída!* Sua conta está pronta. 🎉\n\n';
    const introMessage = activationNote + onboardingService.getIntroMessage(userName);
    // Persiste a resposta ANTES de enviar — sem isso, falha do WhatsApp perdia o onboarding
    const activationLead = await leadService.findOrCreate(user.id, phone, userName);
    await respond(introMessage, activationLead.id);
    return;
  }

  const user = await userRepo.findByPhone(phone);
  if (!user) {
    await respond('Não encontrei seu cadastro. Se você já pagou, envie seu código de ativação (formato: ATIVAR-XXXX).');
    return;
  }

  // Lead de auditoria do dono — criado cedo para persistir TODAS as respostas
  // da secretária (onboarding, termos, comandos) no padrão persist-then-dispatch
  const ownerLead = await leadService.findOrCreate(user.id, phone, user.name || 'Dono');

  const onboardingComplete = await onboardingService.isComplete(user.id);
  if (!onboardingComplete) {
    // Se chegou áudio durante onboarding, transcrever antes de processar
    let messageText = text;
    if (media?.type === 'audio' && (text === '[áudio]' || !text)) {
      // Aviso de áudio longo (>5 min)
      if (media.durationSeconds && media.durationSeconds > 300) {
        await respond('⏳ Recebi um áudio longo, pode demorar alguns segundos pra eu processar...', ownerLead.id);
      }
      const transcribed = await transcribeAudio(phone, media.rawMessage, webhookKey, media.durationSeconds);
      if (!transcribed) {
        await respond('Não consegui entender o áudio. Pode mandar por texto? 😊', ownerLead.id);
        return;
      }
      messageText = transcribed;
    }
    const response = await onboardingService.processMessage(user.id, messageText);
    await respond(response, ownerLead.id);
    return;
  }

  // Check if user needs to re-accept terms
  const needsConsent = await termsConsentService.requiresConsent(user.id);
  if (needsConsent) {
    const accepted = await interpretConfirmation(container.ai, text);
    if (accepted) {
      await termsConsentService.recordConsent(user.id, CURRENT_TERMS_VERSION);
      await respond('✅ Termos aceitos! Pode continuar usando normalmente.', ownerLead.id);
      return;
    }

    // Se a usuária fez uma PERGUNTA em vez de responder, acolher a dúvida e
    // explicar o passo de aceite em vez de reenviar o mesmo texto (loop robótico).
    if (text.includes('?')) {
      await respond(
        'É bem simples 😊 Abre o link acima, lê rapidinho e depois me responde aqui com a palavra *aceito* (ou "ok"). Se tiver qualquer dúvida sobre os termos ou sobre a conexão, manda aqui que eu te ajudo!',
        ownerLead.id,
      );
      return;
    }

    await respond(
      `Atualizamos nossos Termos de Uso. Para continuar usando a Cleo, acesse e aceite os novos termos: ${env.SITE_URL}/termos\n\nApós ler, me mande "aceito" ou "ok" pra continuar.`,
      ownerLead.id,
    );
    return;
  }

  // Se o professor mandou mídia — áudio é transcrito como comando, resto é material
  if (media) {
    if (media.type === 'audio') {
      // Aviso de áudio longo (>5 min)
      if (media.durationSeconds && media.durationSeconds > 300) {
        await respond('⏳ Recebi um áudio longo, pode demorar alguns segundos pra eu processar...', ownerLead.id);
      }
      const transcribed = await transcribeAudio(phone, media.rawMessage, webhookKey, media.durationSeconds);
      if (transcribed) {
        const intent = await assistenteService.recognize(transcribed);
        if (intent.confidence < 0.7) {
          await respond('Não entendi bem o áudio. Pode reformular? 🤔\n\nExemplos:\n• "quem tá sem resposta?"\n• "agenda retorno pro João amanhã"\n• "mostra meus clientes"', ownerLead.id);
          return;
        }
        const response = await executeIntent(container, user, intent, ownerLead.id);
        await respond(response, ownerLead.id);
        return;
      }
      await respond('Não consegui entender o áudio. Pode mandar por texto? 😊', ownerLead.id);
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

    await respond(
      `✅ Material recebido: ${mediaLabel}\n\nQuando quiser enviar pra alguém, me diga: "manda material pro [nome]"`,
      ownerLead.id,
    );
    return;
  }

  // Salvar mensagem inbound do dono
  await messageRepo.save(ownerLead.id, text, 'inbound');

  // Agradecimento/encerramento ("obrigada", "valeu") — NÃO é pedido novo.
  // Responder de forma humilde e fechar, em vez de re-executar comandos que o
  // texto menciona por cortesia ("...ninguém sem resposta então" dispararia
  // de novo a consulta). Perguntas e comandos reais não caem aqui.
  const hasCommandSignal = /(agend|convida|ignora|desconecta|manda|lembra|mostra|envia)/i.test(text);
  const isClosing = !hasCommandSignal
    && !text.includes('?')
    && /(obrigad[oa]|valeu|pode deixar|tá bom assim|ta bom assim|tá certo|ta certo|^show[!. 😊🙏👍]*$|entendi|deixa pra lá|então tá|tudo certo|resolvido)/i.test(text);
  if (isClosing) {
    try {
      const clean = await conversationalOwnerReply(container, user, ownerLead.id, text, 250);
      if (clean.length > 5) {
        await messageRepo.save(ownerLead.id, clean, 'outbound');
        await safeSend(messaging, { instance: env.MONITOR_INSTANCE, to: phone, text: clean }, container.logger);
        return;
      }
    } catch { /* IA indisponível — fallback estático abaixo */ }
    const reply = 'De nada! Qualquer coisa é só chamar 😊';
    await messageRepo.save(ownerLead.id, reply, 'outbound');
    await safeSend(messaging, { instance: env.MONITOR_INSTANCE, to: phone, text: reply }, container.logger);
    return;
  }

  // Comandos "/algo" não são conversa: avisar em vez de mandar para o
  // interpretador de intents (que respondia algo que o dono nunca pediu).
  const slashCommand = text.trim().match(/^\/([a-z0-9_]+)/i);
  if (slashCommand) {
    await respond(unknownSlashCommandReply(slashCommand[1]), ownerLead.id);
    return;
  }

  // Classificador local — resolve intents simples sem chamar IA
  const localIntent = classifyOwnerMessage(text);
  if (localIntent.resolved && localIntent.intent) {
    const response = await executeIntent(container, user, { type: localIntent.intent, entities: {}, originalText: text }, ownerLead.id);
    await messageRepo.save(ownerLead.id, response, 'outbound');
    await safeSend(messaging, { instance: env.MONITOR_INSTANCE, to: phone, text: response }, container.logger);
    return;
  }

  const intent = await assistenteService.recognize(text);
  if (intent.confidence < 0.7) {
    // Mensagem vaga/small talk do dono — engajar com IA (resposta variada e
    // contextual) antes de cair no menu fixo, evitando loop robótico.
    try {
      const clean = await conversationalOwnerReply(container, user, ownerLead.id, text, 300);
      if (clean.length > 10) {
        await messageRepo.save(ownerLead.id, clean, 'outbound');
        await safeSend(messaging, { instance: env.MONITOR_INSTANCE, to: phone, text: clean }, container.logger);
        return;
      }
    } catch { /* IA indisponível — segue pro fallback fixo */ }
    const fallback = 'Não entendi bem. Pode reformular? 🤔\n\nExemplos:\n• "quem tá sem resposta?"\n• "agenda retorno pro João amanhã"\n• "mostra meus clientes"';
    await messageRepo.save(ownerLead.id, fallback, 'outbound');
    await safeSend(messaging, { instance: env.MONITOR_INSTANCE, to: phone, text: fallback }, container.logger);
    return;
  }

  const response = await executeIntent(container, user, intent, ownerLead.id);
  await messageRepo.save(ownerLead.id, response, 'outbound');
  await safeSend(messaging, { instance: env.MONITOR_INSTANCE, to: phone, text: response }, container.logger);
}

/**
 * Indica se o número que enviou a mensagem é o próprio dono da sessão.
 *
 * O dono conecta o próprio WhatsApp ao `user-<id>`; quando ele manda mensagem
 * para si mesmo pelo dispositivo vinculado, o webhook chega com esse número.
 * Sem este check, a Cleo tratava o dono como lead e respondia como atendimento.
 */
function isOwnerMessage(user: { phone?: string | null }, phone: string): boolean {
  const ownerPhone = normalizePhone(user.phone);
  return ownerPhone !== '' && ownerPhone === normalizePhone(phone);
}

/**
 * Remove o próprio dono das listas de clientes.
 *
 * `handleSecretaryMessage` cria um lead de auditoria com o telefone do dono para
 * persistir as respostas da Cleo (padrão persist-then-dispatch). Sem este filtro
 * esse lead entra em `list_leads` / `leads_today` / `no_reply` / `hot_leads` e a
 * Cleo anuncia o dono como cliente novo dele mesmo — visto no E2E
 * (`owner_command`: "Clientes novos de hoje: 1. Fernanda Costa (o próprio número)").
 */
function withoutOwnerLead<T extends { phone?: string | null }>(
  leads: T[],
  user: { phone?: string | null },
): T[] {
  const ownerPhone = normalizePhone(user.phone);
  if (!ownerPhone) return leads;
  return leads.filter((lead) => normalizePhone(lead.phone) !== ownerPhone);
}

/**
 * Processa mensagem do dono na própria instância conectada.
 *
 * Diferente do fluxo da secretária (instância `secretary`), aqui as respostas
 * usam a MESMA instância que recebeu a mensagem — é o único número conectado
 * daquele usuário e o único caminho de volta para ele.
 */
async function handleOwnerMessage(
  container: any,
  instance: string,
  user: any,
  phone: string,
  text: string,
): Promise<void> {
  const { messageRepo, leadService, assistenteService } = container;

  const ownerLead = await leadService.findOrCreate(user.id, phone, user.name || 'Dono');
  await messageRepo.save(ownerLead.id, text, 'inbound');

  let reply: string;

  // Comandos "/algo" não são conversa: se não existe um comando com esse nome,
  // avisar em vez de mandar para a IA (que respondia com brincadeira e lixo
  // de formatação, ex: "Quer trocar de contato? Tá de sacanagem, chefe! 😜】").
  const slashCommand = text.trim().match(/^\/([a-z0-9_]+)/i);
  if (slashCommand) {
    reply = unknownSlashCommandReply(slashCommand[1]);
    await messageRepo.save(ownerLead.id, reply, 'outbound');
    await safeSend(container.messaging, { instance, to: phone, text: reply }, container.logger);
    return;
  }

  const localIntent = classifyOwnerMessage(text);
  if (localIntent.resolved && localIntent.intent) {
    reply = await executeIntent(container, user, { type: localIntent.intent, entities: {}, originalText: text }, ownerLead.id);
  } else {
    const intent = await assistenteService.recognize(text);

    if (intent.confidence >= 0.7) {
      reply = await executeIntent(container, user, intent, ownerLead.id);
    } else {
      try {
        const clean = await conversationalOwnerReply(container, user, ownerLead.id, text, 300);
        reply = clean.length > 10
          ? clean
          : 'Não entendi bem. Pode reformular? 🤔\n\nExemplos:\n• "quem tá sem resposta?"\n• "agenda retorno pro João amanhã"\n• "mostra meus clientes"';
      } catch {
        reply = 'Não entendi bem. Pode reformular? 🤔\n\nExemplos:\n• "quem tá sem resposta?"\n• "agenda retorno pro João amanhã"\n• "mostra meus clientes"';
      }
    }
  }

  // Persist-then-dispatch: salva antes de enviar para não perder a resposta
  await messageRepo.save(ownerLead.id, reply, 'outbound');
  await safeSend(container.messaging, { instance, to: phone, text: reply }, container.logger);
}

async function handleUserWhatsAppMessage(container: any, instance: string, phone: string, text: string, pushName?: string, media?: any, messageKey?: string, webhookKey?: { remoteJid: string; fromMe: boolean; id: string }): Promise<void> {
  const { messaging, sessionRepo, userRepo, exclusionRepo, leadService, messageRepo, ruleEngine } = container;

  const session = await sessionRepo.findByInstance(instance);
  if (!session) return;

  const user = await userRepo.findById(session.user_id);
  if (!user) return;

  // === GUARD: mensagem do próprio dono ===
  // O dono usa o mesmo WhatsApp que conectou. Sem este desvio, a mensagem dele
  // virava um "lead" e a Cleo respondia como atendimento ao cliente.
  if (isOwnerMessage(user, phone)) {
    await handleOwnerMessage(container, instance, user, phone, text);
    return;
  }

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
      await messageRepo.save(lead.id, fallbackReply, 'outbound');
      await safeSend(messaging, { instance, to: phone, text: fallbackReply }, container.logger);
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
        await messageRepo.save(lead.id, `Olá! O responsável vai te responder em breve 😊`, 'outbound');
        await safeSend(messaging, { instance, to: phone, text: `Olá! O responsável vai te responder em breve 😊` }, container.logger);
        return;
      }

      if (trialCheck.reason === 'limit_reached') {
        // Limite de respostas atingido
        await messageRepo.save(lead.id, `Olá! O responsável vai te responder em breve 😊`, 'outbound');
        await safeSend(messaging, { instance, to: phone, text: `Olá! O responsável vai te responder em breve 😊` }, container.logger);

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

  // === GUARD: assinatura inativa (expirada/cancelada/suspensa) =================
  // Cleo fica 100% INOPERANTE para clientes: nenhuma resposta automática.
  // NOTA: o objeto user usa camelCase vindo do drizzle (subscriptionStatus).
  const subStatus = (user as any).subscriptionStatus ?? (user as any).subscription_status;
  if (subStatus !== 'active' && subStatus !== 'trial') {
    return;
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
      await messageRepo.save(lead.id, customRule, 'outbound');
      await safeSend(messaging, { instance, to: phone, text: customRule }, container.logger);
      return;
    }
  }

  // Classificador local — saudações simples usam template direto (sem IA)
  const localClassification = classifyClientMessage(messageText);
  if (localClassification.resolved && localClassification.intent === 'greeting') {
    const greetingReply = buildGreetingReply(business, user.name, pushName);
    await messageRepo.save(lead.id, greetingReply, 'outbound');
    await safeSend(messaging, { instance, to: phone, text: greetingReply }, container.logger);
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
  await messageRepo.save(lead.id, reply, 'outbound');
  await safeSend(messaging, { instance, to: phone, text: reply }, container.logger);
}

function buildGreetingReply(business: any, ownerName: string, clientName?: string): string {
  const name = clientName ? `, ${clientName}` : '';
  const owner = ownerName || 'o responsável';
  const tone = business?.tone_of_voice || 'friendly_professional';

  switch (tone) {
    // Resposta CURTA: saudação de cliente é resolvida sem IA, então precisa ser
    // rápida e direta (o E2E flagrou texto longo e “introdutório” aqui).
    case 'formal':
      return `Boa tarde${name}! Em que posso ajudá-lo(a)?`;
    case 'casual':
      return `E aí${name}! 👋 Como posso ajudar?`;
    default:
      return `Olá${name}! 😊 Como posso te ajudar?`;
  }
}

/**
 * Executa UM pedido do dono. Mantida separada para permitir multi-intent:
 * `executeIntent` orquestra a lista e chama esta função por item.
 */
async function executeSingleIntent(
  container: any,
  user: any,
  intent: { type: string; entities: Record<string, string>; originalText?: string },
  leadId?: string,
): Promise<string> {
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
      // O dono tem um lead de auditoria (para persistir as mensagens dele) —
      // ele NÃO é cliente de si mesmo e não pode aparecer nas listas.
      const leads = withoutOwnerLead(await leadService.listByStatus(user.id, 'new'), user);
      if (leads.length === 0) return 'Você não tem clientes novos no momento. 📭';
      const list = leads.slice(0, 10).map((l: any, i: number) => `${i + 1}. *${l.name}* (${l.phone})`).join('\n');
      return `📋 Seus clientes:\n\n${list}`;
    }
    case 'leads_today':
    case 'no_reply': {
      // Mensagens combinadas ("clientes novos de hoje E quem está sem resposta")
      // precisam responder as duas partes — senão a dona repete o pedido e a
      // Cleo entra em loop respondendo sempre a mesma metade.
      const original = (intent.originalText || '').toLowerCase();
      const asksToday = intent.type === 'leads_today' || /(hoje|novos|chegou)/.test(original);
      const asksNoReply = intent.type === 'no_reply' || /(sem resposta|sem retorno|não respond|nao respond|pendente)/.test(original);

      const sections: string[] = [];

      if (asksToday) {
        const today = withoutOwnerLead(await leadService.listToday(user.id), user);
        sections.push(
          today.length === 0
            ? '📭 *Clientes novos de hoje:* nenhum por enquanto.'
            : `📋 *Clientes novos de hoje:*

${today.map((l: any, i: number) => `${i + 1}. *${l.name}*`).join('\n')}`,
        );
      }
      if (asksNoReply) {
        const pending = withoutOwnerLead(await leadService.listNoReply(user.id), user);
        sections.push(
          pending.length === 0
            ? '✅ *Sem resposta:* ninguém esperando retorno, tá em dia!'
            : `⚠️ *Clientes esperando retorno:*

${pending.slice(0, 10).map((l: any, i: number) => `${i + 1}. *${l.name}* (${l.phone})`).join('\n')}`,
        );
      }

      // Separador VISÍVEL entre as seções: com apenas '\n\n' as duas
      // listas apareceram grudadas no WhatsApp (visto no E2E).
      return sections.join('\n\n———\n\n');
    }
    case 'hot_leads': {
      const leads = withoutOwnerLead(await leadService.listByStatus(user.id, 'hot'), user);
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

      // Sem data nem horário no pedido → não inventar ("amanhã 9h" do nada).
      // Perguntar antes pro dono confirmar.
      if (!intent.entities.date && !intent.entities.time) {
        return `Pra quando você quer que eu lembre de falar com *${targetLead.name}*? Me diz o dia e horário (ex: "amanhã 14h" ou "sexta 10h").`;
      }

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
        const timePattern = /(\d{1,2})[:h]?(\d{2})?\s*(?:às|as|até|ate|a|e|-|–|—)+\s*(\d{1,2})[:h]?(\d{2})?/i;
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

      // Dias da semana: “não atender no domingo”, “para de responder sábado”…
      const DAY_ALIASES: Record<string, string> = {
        domingo: 'sun', domingos: 'sun',
        segunda: 'mon', segundas: 'mon', 'segunda-feira': 'mon',
        terca: 'tue', 'terça': 'tue', tercas: 'tue', 'terças': 'tue',
        quarta: 'wed', quartas: 'wed', 'quarta-feira': 'wed',
        quinta: 'thu', quintas: 'thu', 'quinta-feira': 'thu',
        sexta: 'fri', sextas: 'fri', 'sexta-feira': 'fri',
        sabado: 'sat', 'sábado': 'sat', sabados: 'sat', 'sábados': 'sat',
      };
      const DAY_LABELS: Record<string, string> = {
        mon: 'segunda', tue: 'terça', wed: 'quarta', thu: 'quinta',
        fri: 'sexta', sat: 'sábado', sun: 'domingo',
      };

      const mentionedDay = Object.keys(DAY_ALIASES).find((day) => lower.includes(day));
      const wantsToRemove = /(n[ãa]o\s+(atend|respond)|sem\s+atend|para\s+de\s+(atend|respond)|nunca\s+(atend|respond)|folga)/i.test(lower);

      if (mentionedDay && wantsToRemove) {
        const dayCode = DAY_ALIASES[mentionedDay];
        const [business] = await db
          .select()
          .from(businesses)
          .where(eq(businesses.userId, user.id))
          .limit(1);

        const currentDays: string[] = business?.businessDays ?? ['mon', 'tue', 'wed', 'thu', 'fri'];

        if (!currentDays.includes(dayCode)) {
          return `📅 Já não atendo ${DAY_LABELS[dayCode]} — os dias atuais são: ${currentDays.map((d) => DAY_LABELS[d] ?? d).join(', ')}.`;
        }

        const updatedDays = currentDays.filter((day) => day !== dayCode);
        await db.update(businesses)
          .set({ businessDays: updatedDays })
          .where(eq(businesses.userId, user.id));

        return `✅ Pronto! Não vou mais atender ${DAY_LABELS[dayCode]}.\n\n📅 *Dias de atendimento:* ${updatedDays.map((d) => DAY_LABELS[d] ?? d).join(', ')}`;
      }

      // Configuração genérica — orientar
      return `⚙️ Posso configurar pra você:\n\n• *Horário de atendimento* — "muda horário pra 8h às 20h"\n• *Dias* — "não atender no domingo"\n• *Contatos ignorados* — "ignora 11999..." ou "para de ignorar"\n\nO que quer ajustar?`;
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
      const createdDate = targetLead.created_at ? new Date(targetLead.created_at) : null;
      const createdAt = createdDate && !isNaN(createdDate.getTime())
        ? createdDate.toLocaleDateString('pt-BR')
        : 'hoje';

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
      if (!name) {
        // Não repetir a MESMA pergunta em loop: mostra os contatos recentes para
        // o dono escolher (o E2E flagrou a mesma frase 3× seguidas).
        // Nunca listar o próprio dono nem o “lead” interno de materiais
        const recentes = withoutOwnerLead(await leadService.listByStatus(user.id, 'new'), user)
          .filter((lead: any) => lead.phone !== 'materials' && lead.name !== 'Materiais');
        const opcoes = recentes.slice(0, 5).map((lead: any) => `• ${lead.name}`).join('\n');

        return opcoes
          ? `Para quem devo enviar o material? Seus contatos mais recentes:\n\n${opcoes}\n\nMe diz o nome (ex: "manda material pro João").`
          : 'Para quem devo enviar o material? Me diz o nome do contato — ainda não tenho contatos salvos.';
      }

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
      // Guard: sem telefone, só ignora nome que corresponda a um lead existente.
      // Evita excluir lixo ("13", "contato") quando a IA interpreta errado
      // conversa casual do dono como comando.
      if (!phone) {
        const matches = await leadService.searchByName(user.id, name);
        if (matches.length === 0) {
          return `Não encontrei nenhum contato chamado "${name}" na sua lista. Se é um número, me manda o telefone completo com DDD.`;
        }
      }
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
      // Guard: sem telefone, confirmar que o nome existe entre os ignorados
      // antes de "confirmar" uma ação que talvez o dono não pediu.
      if (!phone) {
        const ignored = await exclusionRepo.list(user.id);
        const found = ignored.some((c: any) =>
          (c.name || '').toLowerCase().includes(name.toLowerCase()));
        if (!found) {
          return `Não encontrei "${name}" na sua lista de ignorados. Quer que eu liste quem está lá?`;
        }
      }
      await exclusionRepo.remove(user.id, phone || name);
      return `✅ Voltei a acompanhar *${name || phone}*.`;
    }
    default: {
      // Intent não reconhecida ou small talk — resposta conversacional via IA
      // (variada, engajando com o que o dono disse) em vez de texto fixo robótico.
      // Com histórico: sem contexto a Cleo repetia a mesma piada a cada mensagem.
      try {
        const clean = await conversationalOwnerReply(
          container,
          user,
          leadId,
          intent.originalText || '',
          300,
        );
        if (clean.length > 10) return clean;
      } catch {
        // IA indisponível — cai no fallback padrão
      }
      return 'Entendi o que você quer, mas essa função ainda está sendo preparada. Em breve! 🚧';
    }
  }
}

/**
 * Orquestra a execução de um ou mais pedidos do dono.
 *
 * Por que existe: o dono costuma pedir várias coisas na mesma mensagem
 * ("ver os clientes novos de hoje E quem está sem resposta"). Antes só o
 * primeiro pedido era executado e o resto era ignorado — o usuário repetia,
 * recebia a mesma meia-resposta e a conversa entrava em loop.
 *
 * Regras:
 * - Consultas (listas/status) rodam em sequência e as respostas são COMBINADAS
 *   numa mensagem só, separadas por linha em branco.
 * - Pedidos que precisam de dados do usuário (agendar, enviar material,
 *   convidar, desconectar, configurar) só são executados pelo seu próprio texto:
 *   em multi-intent eles são pulados para não responder algo que o dono não pediu
 *   nem interromper as consultas com uma pergunta.
 * - Falha de um pedido não derruba os demais.
 */
async function executeIntent(
  container: any,
  user: any,
  intent: {
    type: string;
    entities: Record<string, string>;
    originalText?: string;
    additionalIntents?: Array<{ type: string; entities: Record<string, string>; originalText?: string }>;
  },
  leadId?: string,
): Promise<string> {
  const extras = Array.isArray(intent.additionalIntents) ? intent.additionalIntents : [];

  // Caminho comum: um pedido só — executa direto, sem mudar o comportamento atual
  if (extras.length === 0) {
    return executeSingleIntent(container, user, intent, leadId);
  }

  const all = [
    { type: intent.type, entities: intent.entities, originalText: intent.originalText },
    ...extras,
  ];

  const isQuery = (type: string) => QUERY_INTENT_TYPES.includes(type);
  const queries = all.filter((i) => isQuery(i.type));
  const actions = all.filter((i) => !isQuery(i.type));

  // `leads_today` e `no_reply` já respondem as duas partes quando o texto pede
  // as duas (ver case 'leads_today'/'no_reply'). Executar também o `no_reply`
  // separado duplicava a seção "Retorno em dia" na mesma mensagem.
  const hasPair = queries.some((q) => q.type === 'leads_today') && queries.some((q) => q.type === 'no_reply');

  const parts: string[] = [];

  for (const query of queries) {
    // Com o par presente, só o `leads_today` roda (ele cobre as duas seções)
    if (hasPair && query.type === 'no_reply') continue;
    try {
      const result = await executeSingleIntent(container, user, query, leadId);
      if (result?.trim()) parts.push(result.trim());
    } catch (error: any) {
      container.logger.warn({ err: error, intent: query.type }, 'falha ao executar pedido combinado');
    }
  }

  // Ações que pedem dados: executadas em sequência (ex: "agenda retorno pro João
  // e manda o material") — a resposta de cada uma já é uma pergunta ao dono.
  for (const action of actions) {
    try {
      const result = await executeSingleIntent(container, user, action, leadId);
      if (result?.trim()) parts.push(result.trim());
    } catch (error: any) {
      container.logger.warn({ err: error, intent: action.type }, 'falha ao executar ação combinada');
    }
  }

  if (parts.length === 0) {
    return executeSingleIntent(container, user, intent, leadId);
  }

  // Seções visivelmente separadas: com apenas '\n\n' as listas apareciam
  // grudadas no WhatsApp e pareciam um bloco só (visto no E2E).
  return parts.join('\n\n———\n\n');
}

/** Intenções puramente consultivas — seguras para combinar numa resposta. */
const QUERY_INTENT_TYPES = ['list_leads', 'leads_today', 'no_reply', 'hot_leads', 'lead_status', 'list_ignored'];

/** Última linha do arquivo: mantém o executor de um pedido disponível para os testes. */
export { executeSingleIntent };
