import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { sanitizeMessageText, validatePhoneNumber, maskPhone } from '../../shared/middleware/sanitize.js';
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
        key: message.imageMessage.mediaKey || null,
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
        key: message.audioMessage.mediaKey || null,
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
        key: message.videoMessage.mediaKey || null,
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
        key: message.documentMessage.mediaKey || null,
      },
    };
  }

  // Tipo não suportado
  return { text: '', media: null };
}

webhookRouter.post('/evolution', async (req: Request, res: Response) => {
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
    if (payload.event !== 'messages.upsert') return;

    const { data } = payload;

    // Ignorar mensagens de grupo (@g.us)
    if (data.key.remoteJid.endsWith('@g.us')) return;

    // Extrair e validar telefone
    const remoteJid = data.key.remoteJid;
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');

    if (!validatePhoneNumber(phone)) {
      log.warn({ jid: remoteJid }, 'telefone inválido recebido no webhook');
      return;
    }

    // Extrair conteúdo (texto + mídia)
    const { text: rawText, media } = extractMessageContent(data.message);
    const text = sanitizeMessageText(rawText);
    const isFromMe = data.key.fromMe;
    const isSecretaryInstance = payload.instance === 'secretary';

    if (isFromMe) return;
    if (!text && !media) return; // Mensagem vazia ou tipo não suportado

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
