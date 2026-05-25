import express from 'express';
import cors from 'cors';
import { env } from './shared/config/env.js';
import { container } from './container.js';
import { webhookRouter } from './modules/webhooks/webhooks.controller.js';
import { activationRouter } from './modules/activation/activation.controller.js';
import { cancellationRouter } from './modules/cancellation/cancellation.controller.js';
import { startFollowUpCron } from './modules/follow-up/follow-up.cron.js';
import { startConnectionMonitor } from './modules/connection-monitor/connection-monitor.cron.js';
import { startContactMonitorCron } from './modules/contact-monitor/contact-monitor.cron.js';
import { startCancellationCron } from './modules/cancellation/cancellation.cron.js';

const app = express();
const { logger } = container;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV });
});

app.use('/webhooks', webhookRouter);
app.use('/api/activation', activationRouter);
app.use('/api/cancellation', cancellationRouter);

startFollowUpCron();
startContactMonitorCron();
startCancellationCron();
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
