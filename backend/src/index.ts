import express from 'express';
import cors from 'cors';
import { env } from './shared/config/env.js';
import { container } from './container.js';
import {
  securityHeaders,
  buildCorsOptions,
  apiRateLimit,
  paymentRateLimit,
  validateInternalOrigin,
} from './shared/middleware/security.js';
import { webhookRouter } from './modules/webhooks/webhooks.controller.js';
import { activationRouter } from './modules/activation/activation.controller.js';
import { cancellationRouter } from './modules/cancellation/cancellation.controller.js';
import { paymentRouter } from './modules/payment/payment.controller.js';
import { paymentWebhookRouter } from './modules/payment/payment-webhook.controller.js';
import { startFollowUpCron } from './modules/follow-up/follow-up.cron.js';
import { startConnectionMonitor } from './modules/connection-monitor/connection-monitor.cron.js';
import { startContactMonitorCron } from './modules/contact-monitor/contact-monitor.cron.js';
import { startCancellationCron } from './modules/cancellation/cancellation.cron.js';
import { startSubscriptionCron } from './modules/subscription/subscription.cron.js';

const app = express();
const { logger } = container;

// --- Segurança global ---
app.set('trust proxy', 1); // Para X-Forwarded-For funcionar com Docker/nginx
app.use(securityHeaders);
app.use(cors(buildCorsOptions()));

// --- Payload limits por contexto ---
// Webhooks precisam de mais espaço (mensagens longas, mídia metadata)
app.use('/webhooks', express.json({ limit: '5mb' }));
// Rotas da API (browser) — payloads pequenos
app.use('/api', express.json({ limit: '50kb' }));
// Fallback para outras rotas
app.use(express.json({ limit: '100kb' }));

// --- Health check (sem rate limit) ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV });
});

// --- Webhooks (sem rate limit, validação por origem/assinatura) ---
app.use('/webhooks/evolution', validateInternalOrigin, webhookRouter);
app.use('/webhooks', paymentWebhookRouter); // MP já valida assinatura no controller

// --- API pública (com rate limit) ---
app.use('/api/payments', apiRateLimit, paymentRateLimit, paymentRouter);
app.use('/api/activation', apiRateLimit, activationRouter);
app.use('/api/cancellation', apiRateLimit, cancellationRouter);

startFollowUpCron();
startContactMonitorCron();
startCancellationCron();
startSubscriptionCron();
startConnectionMonitor({
  messaging: container.messaging,
  logger: container.logger,
  instanceName: env.MONITOR_INSTANCE,
  adminPhone: env.MONITOR_ADMIN_PHONE,
});

// Inicializar fila e worker
(async () => {
  await container.queueService.initialize();
  await container.messageWorker.start();
  logger.info('Queue e Worker inicializados');
})();

// Graceful shutdown
const shutdown = async () => {
  logger.info('Encerrando...');
  await container.messageWorker.shutdown();
  await container.queueService.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, webhook: env.WEBHOOK_URL, provider: env.MESSAGING_PROVIDER }, '🚀 Backend rodando');
});
