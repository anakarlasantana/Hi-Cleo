import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { sanitizeMessageText, validatePhoneNumber, maskPhone } from '../../shared/middleware/sanitize.js';
import { STICKER_MARKER } from '../../shared/utils/client-signals.js';
import type { WebhookPayload, MediaType } from '../../shared/types/index.js';
import type { MessageJobData } from '../queue/queue.types.js';

export const webhookRouter = Router();

const log = container.logger.child({ module: 'webhook' });

/**
 * Extrai texto e metadados de mídia de uma mensagem do WhatsApp.
 */
function extractMessageContent(message: WebhookPayload['data']['message']) {
  // Texto puro
  if (message.conversation) {
    return { text: message.conversation, media: null };
  }

  // Texto com formatação/link
  if (message.extendedTextMessage?.text) {
    return { text: message.extendedTextMessage.text, media: null };
  }

  // Imagem
  if (message.imageMessage) {
    return {
      text: message.imageMessage.caption || '[imagem]',
      media: {
        type: 'image' as MediaType,
        mimeType: message.imageMessage.mimetype,
        fileName: null as string | null,
        key: null as string | null,
      },
    };
  }

  // Áudio
  if (message.audioMessage) {
    return {
      text: '[áudio]',
      media: {
        type: 'audio' as MediaType,
        mimeType: message.audioMessage.mimetype,
        fileName: null as string | null,
        key: null as string | null,
        rawMessage: message,
        durationSeconds: message.audioMessage.seconds || undefined,
      },
    };
  }

  // Vídeo
  if (message.videoMessage) {
    return {
      text: message.videoMessage.caption || '[vídeo]',
      media: {
        type: 'video' as MediaType,
        mimeType: message.videoMessage.mimetype,
        fileName: null as string | null,
        key: null as string | null,
      },
    };
  }

  // Documento
  if (message.documentMessage) {
    return {
      text: message.documentMessage.title || message.documentMessage.fileName || '[documento]',
      media: {
        type: 'document' as MediaType,
        mimeType: message.documentMessage.mimetype,
        fileName: message.documentMessage.fileName || message.documentMessage.title || null,
        key: null as string | null,
      },
    };
  }

  // Figurinha — antes caía no `return { text: '', media: null }` e o webhook
  // descartava a mensagem: o cliente ficava em SILÊNCIO, nada era salvo e, se
  // fosse a primeira mensagem, o lead nem existia. Agora é tratada como texto
  // de baixa informação (o processor responde sem chamar a IA).
  if (message.stickerMessage) {
    return { text: STICKER_MARKER, media: null };
  }

  // Reação (👍 numa mensagem anterior): ignorar EXPLICITAMENTE. Não é pergunta,
  // e responder a uma reação polui a conversa.
  if (message.reactionMessage) {
    return { text: '', media: null };
  }

  return { text: '', media: null };
}

webhookRouter.post('/', async (req: Request, res: Response) => {
  // Validar secret se configurado (dupla camada: IP interno + secret)
  if (env.EVOLUTION_WEBHOOK_SECRET) {
    const receivedSecret = req.headers['x-webhook-secret'] as string;
    if (receivedSecret !== env.EVOLUTION_WEBHOOK_SECRET) {
      log.warn({ ip: req.ip }, 'webhook Evolution rejeitado: secret inválido');
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }
  }

  res.status(200).json({ received: true });

  try {
    const payload = req.body as WebhookPayload;

    if (payload.event === 'connection.update') {
      await handleConnectionUpdate(payload);
      return;
    }

    if (payload.event !== 'messages.upsert') return;

    const { data } = payload;

    // Ignorar mensagens de grupo (@g.us)
    if (data.key.remoteJid.endsWith('@g.us')) return;

    // Extrair telefone e destinatário para resposta
    const remoteJid = data.key.remoteJid;
    const phone = remoteJid.replace('@s.whatsapp.net', '');

    if (!validatePhoneNumber(phone)) {
      log.warn({ jid: remoteJid }, 'telefone inválido recebido no webhook');
      return;
    }

    // Extrair conteúdo (texto + mídia)
    const { text: rawText, media } = extractMessageContent(data.message);
    const text = sanitizeMessageText(rawText);
    const isFromMe = data.key.fromMe;
    const isSecretaryInstance = payload.instance === env.MONITOR_INSTANCE;

    if (isFromMe) return;
    if (!text && !media) {
      // Log de tipo não suportado: sem isso o descarte era invisível e não havia
      // como descobrir em produção quais mensagens de cliente estavam sendo
      // perdidas (figurinha era uma delas antes da correção).
      log.warn(
        { phone: maskPhone(phone), types: Object.keys(data.message || {}) },
        'mensagem de tipo não suportado ignorada',
      );
      return;
    }

    log.info({
      phone: maskPhone(phone),
      instance: payload.instance,
      textLength: text.length,
      mediaType: media?.type || null,
    }, 'mensagem recebida');

    const jobData: MessageJobData = {
      phone,
      instance: payload.instance,
      text,
      pushName: data.pushName,
      isSecretaryInstance,
      timestamp: Date.now(),
      remoteJid,
      messageKey: data.key.id,
      webhookKey: data.key,
      media: media || undefined,
    };

    // Tentar enfileirar no BullMQ
    const result = await container.queueService.enqueue(jobData);

    if (!result.enqueued) {
      // Fallback síncrono quando Redis indisponível
      log.warn({ phone: maskPhone(phone), instance: payload.instance }, 'Redis indisponível, processando sincronamente');
      await container.messageProcessor(jobData);
    }
  } catch (error) {
    log.error({ err: error }, 'erro ao processar webhook');
  }
});

/**
 * Trata `connection.update` da Evolution API.
 *
 * É a ÚNICA fonte de verdade sobre "este WhatsApp está conectado". Sem gravar a
 * sessão aqui, `findByInstance` retorna null no processamento de mensagens e a
 * Cleo não responde a nenhum cliente.
 *
 * Estados da Evolution: `open` (conectado), `connecting` (QR aguardando leitura)
 * e `close` (desconectado/logout).
 */
async function handleConnectionUpdate(payload: WebhookPayload): Promise<void> {
  const instanceName = payload.instance;
  // A Evolution pode enviar o estado no root (`state`) ou dentro de `data`.
  const state = payload.state ?? (payload.data as unknown as { state?: string } | undefined)?.state;

  if (!instanceName || !state) return;

  // A instância da secretária (Cleo) não pertence a nenhum usuário: é monitorada
  // pelo connection-monitor, não deve gerar linha em whatsapp_sessions.
  if (instanceName === env.MONITOR_INSTANCE) return;

  log.info({ instance: instanceName, state }, 'connection.update recebido');

  try {
    if (state === 'open') {
      const userId = await resolveUserIdForInstance(instanceName);
      if (!userId) {
        log.error({ instance: instanceName }, 'instância conectada sem usuário correspondente — sessão não gravada');
        return;
      }

      await container.sessionRepo.activateSession({ userId, instanceName });
      log.info({ instance: instanceName }, 'sessão WhatsApp ativada');
      return;
    }

    if (state === 'close') {
      await container.sessionRepo.markDisconnected(instanceName);
      log.warn({ instance: instanceName }, 'sessão WhatsApp desconectada');
    }
  } catch (error) {
    log.error({ err: error, instance: instanceName }, 'erro ao processar connection.update');
  }
}

/**
 * Descobre o dono da instância a partir do nome determinístico.
 * Suporta `user-<uuid>` (dono/colaborador) e `invite-<token>` (convite em aceite).
 */
async function resolveUserIdForInstance(instanceName: string): Promise<string | null> {
  if (instanceName.startsWith('user-')) {
    const userId = instanceName.slice('user-'.length);
    const user = await container.userRepo.findById(userId);
    return user ? user.id : null;
  }

  if (instanceName.startsWith('invite-')) {
    const token = instanceName.slice('invite-'.length);
    const { valid, invite } = await container.inviteService.validateInvite(token);

    // Convite recém-aceito já não é mais 'pending' — busca o colaborador vinculado
    if (!valid && invite?.used_by_user_id) {
      const collaborator = await container.userRepo.findById(invite.used_by_user_id as string);
      return collaborator ? collaborator.id : null;
    }
  }

  return null;
}
