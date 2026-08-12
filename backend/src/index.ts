import { initSentry, Sentry } from './shared/config/sentry.js';
initSentry();

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
import { invitesRouter } from './modules/invites/invites.controller.js';
import { startFollowUpCron } from './modules/follow-up/follow-up.cron.js';
import { startConnectionMonitor } from './modules/connection-monitor/connection-monitor.cron.js';
import { startContactMonitorCron } from './modules/contact-monitor/contact-monitor.cron.js';
import { startCancellationCron } from './modules/cancellation/cancellation.cron.js';
import { startSubscriptionCron } from './modules/subscription/subscription.cron.js';
import { startOnboardingTimeoutCron } from './modules/onboarding/onboarding-timeout.cron.js';
import { ensureEvolutionInstance } from './modules/evolution/evolution-setup.js';

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
app.get('/health', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = { server: 'ok' };

  // Verificar Supabase (DB)
  try {
    const { supabase } = await import('./shared/config/supabase.js');
    const { error } = await supabase.from('plan_limits').select('id').limit(1);
    checks.database = error ? 'error' : 'ok';
  } catch {
    checks.database = 'error';
  }

  // Verificar Redis
  try {
    const IORedis = (await import('ioredis')).default;
    const redis = new IORedis({ host: env.REDIS_HOST, port: env.REDIS_PORT, maxRetriesPerRequest: 1, connectTimeout: 2000 });
    await redis.ping();
    await redis.quit();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const allHealthy = Object.values(checks).every((v) => v === 'ok');
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
    checks,
  });
});

// --- Webhooks (sem rate limit, validação por origem/assinatura) ---
app.use('/webhooks/evolution', validateInternalOrigin, webhookRouter);
app.use('/webhooks', paymentWebhookRouter); // MP já valida assinatura no controller

// --- API pública (com rate limit) ---
// Rate limit de pagamentos: POST e GET /price usam paymentRateLimit (5/min),
// GET /:orderId/status usa apenas apiRateLimit global (polling frequente do frontend)
app.post('/api/payments', apiRateLimit, paymentRateLimit, paymentRouter);
app.get('/api/payments/price', apiRateLimit, paymentRateLimit, paymentRouter);
app.get('/api/payments/:orderId/status', apiRateLimit, paymentRouter);
app.use('/api/activation', apiRateLimit, activationRouter);
app.use('/api/invites', apiRateLimit, invitesRouter);
app.use('/api/cancellation', apiRateLimit, cancellationRouter);

startFollowUpCron();
startContactMonitorCron();
startCancellationCron();
startSubscriptionCron();
startOnboardingTimeoutCron();
startConnectionMonitor({
  messaging: container.messaging,
  logger: container.logger,
  instanceName: env.MONITOR_INSTANCE,
  adminPhone: env.MONITOR_ADMIN_PHONE,
  sessionRepo: container.sessionRepo,
  userRepo: container.userRepo,
});

// Inicializar fila e worker
(async () => {
  await container.queueService.initialize();
  await container.messageWorker.start();
  logger.info('Queue e Worker inicializados');

  // Garantir instância Evolution API com webhook
  await ensureEvolutionInstance({
    messaging: container.messaging,
    logger,
    instanceName: env.MONITOR_INSTANCE,
    webhookUrl: env.WEBHOOK_URL,
  });
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

// Capturar erros não tratados no Sentry
if (env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Capturar unhandled rejections e uncaught exceptions
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  Sentry.captureException(reason);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  Sentry.captureException(error);
  shutdown();
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, webhook: env.WEBHOOK_URL, provider: env.MESSAGING_PROVIDER }, '🚀 Backend rodando');
});
