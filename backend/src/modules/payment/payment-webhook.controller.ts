import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';

export const paymentWebhookRouter = Router();

// POST /webhooks/mercadopago
paymentWebhookRouter.post('/mercadopago', async (req: Request, res: Response) => {
  const xSignature = req.headers['x-signature'] as string;
  const xRequestId = req.headers['x-request-id'] as string;
  const dataId = req.query['data.id'] as string;

  if (!xSignature) { res.status(400).json({ error: 'Header x-signature ausente' }); return; }
  if (!dataId) { res.status(400).json({ error: 'Query param data.id ausente' }); return; }

  const isValid = container.mercadoPagoAdapter.validateWebhookSignature(
    xSignature, xRequestId || '', dataId, env.MERCADO_PAGO_WEBHOOK_SECRET
  );

  if (!isValid) { res.status(401).json({ error: 'Assinatura inválida' }); return; }

  // Responder 200 imediatamente (MP espera em até 22s)
  res.status(200).json({ received: true });

  // Processar async — delega pro service
  const body = req.body;
  if (body.type === 'order' && body.data?.id) {
    container.paymentService.processWebhook(body.data.id).catch((err: any) => {
      container.logger.error(`Erro webhook MP: ${err.message}`);
    });
  }
});
