import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { truncate } from '../../shared/logger/logger.js';
import type { WebhookPayload } from '../../shared/types/index.js';
import type { MessageJobData } from '../queue/queue.types.js';

export const webhookRouter = Router();

const log = container.logger.child({ module: 'webhook' });

webhookRouter.post('/evolution', async (req: Request, res: Response) => {
  res.status(200).json({ received: true });

  try {
    const payload = req.body as WebhookPayload;
    if (payload.event !== 'messages.upsert') return;

    const { data } = payload;

    // Ignorar mensagens de grupo (@g.us)
    if (data.key.remoteJid.endsWith('@g.us')) return;

    // Extrair telefone
    const remoteJid = data.key.remoteJid;
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '');
    const text = data.message.conversation || '';
    const isFromMe = data.key.fromMe;
    const isSecretaryInstance = payload.instance === 'secretary';

    if (isFromMe) return;

    log.info({ phone, instance: payload.instance, textIn: truncate(text) }, 'mensagem recebida');

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
