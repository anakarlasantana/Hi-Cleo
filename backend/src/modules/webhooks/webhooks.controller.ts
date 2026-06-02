import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { sanitizeMessageText, validatePhoneNumber, maskPhone } from '../../shared/middleware/sanitize.js';
import type { WebhookPayload } from '../../shared/types/index.js';
import type { MessageJobData } from '../queue/queue.types.js';

export const webhookRouter = Router();

const log = container.logger.child({ module: 'webhook' });

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

    // Sanitizar texto da mensagem
    const rawText = data.message.conversation || '';
    const text = sanitizeMessageText(rawText);
    const isFromMe = data.key.fromMe;
    const isSecretaryInstance = payload.instance === 'secretary';

    if (isFromMe) return;

    log.info({ phone: maskPhone(phone), instance: payload.instance, textLength: text.length }, 'mensagem recebida');

    const jobData: MessageJobData = {
      phone,
      instance: payload.instance,
      text,
      pushName: data.pushName,
      isSecretaryInstance,
      timestamp: Date.now(),
      remoteJid,
    };

    // Tentar enfileirar no BullMQ
    const result = await container.queueService.enqueue(jobData);

    if (!result.enqueued) {
      // Fallback síncrono quando Redis indisponível
      log.warn({ phone, instance: payload.instance }, 'Redis indisponível, processando sincronamente');
      await container.messageProcessor(jobData);
    }
  } catch (error) {
    log.error({ err: error }, 'erro ao processar webhook');
  }
});
