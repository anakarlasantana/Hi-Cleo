import { CronJob } from 'cron';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';

const CHECKOUT_URL = env.CHECKOUT_URL;

export function startSubscriptionCron(): void {
  const schedule = env.CANCELLATION_CRON_SCHEDULE;

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando assinaturas...');

    const { subscriptionService, subscriptionRepo, messaging } = container;
    const instance = env.MONITOR_INSTANCE;

    try {
      // Lembretes 3 dias antes
      const expiring3 = await subscriptionService.getExpiringIn(3);
      for (const sub of expiring3) {
        try {
          await messaging.sendText({
            instance,
            to: sub.phone,
            text: `⚠️ Sua assinatura do plano ${sub.plan_name} vence em 3 dias.\n\nRenove: ${CHECKOUT_URL}\n\nApós vencer, seus dados ficam guardados por 30 dias. Depois são removidos.`,
          });
          await subscriptionRepo.createEvent({
            user_id: sub.user_id,
            event_type: 'reminder_sent',
            order_id: '',
            amount_cents: 0,
            metadata: { days_ahead: 3 },
          });
        } catch (err: any) {
          console.error(`[Cron] Falha lembrete 3d ${sub.phone}: ${err.message}`);
        }
      }

      // Lembretes 1 dia antes
      const expiring1 = await subscriptionService.getExpiringIn(1);
      for (const sub of expiring1) {
        try {
          await messaging.sendText({
            instance,
            to: sub.phone,
            text: `🚨 Último aviso! Plano ${sub.plan_name} vence amanhã.\n\nRenove: ${CHECKOUT_URL}\n\nVocê tem 30 dias após vencer para reativar.`,
          });
          await subscriptionRepo.createEvent({
            user_id: sub.user_id,
            event_type: 'reminder_sent',
            order_id: '',
            amount_cents: 0,
            metadata: { days_ahead: 1 },
          });
        } catch (err: any) {
          console.error(`[Cron] Falha lembrete 1d ${sub.phone}: ${err.message}`);
        }
      }

      // Expirar assinaturas vencidas
      const expired = await subscriptionService.checkExpirations();
      if (expired > 0) {
        console.log(`[Cron] ${expired} assinatura(s) expirada(s)`);
      }
    } catch (error) {
      console.error('[Cron] Erro subscription:', error);
    }
  });

  job.start();
  console.log(`[Cron] Subscription cron iniciado (schedule: ${schedule})`);
}
