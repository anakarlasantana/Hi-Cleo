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
      // === LEMBRETES DE TRIAL ===

      // Trial: lembrete dia 5 (2 dias restantes)
      const trialExpiring2 = await subscriptionRepo.getTrialExpiringIn(2);
      for (const sub of trialExpiring2) {
        if (!sub.phone) continue;
        try {
          const used = (sub as any).trial_responses_used || 0;
          const limit = (sub as any).trial_responses_limit || 30;
          await messaging.sendText({
            instance,
            to: sub.phone,
            text: `⏰ Seu teste grátis da Cleo acaba em 2 dias!\n\nVocê já usou ${used} de ${limit} respostas automáticas.\n\nQuer continuar? Assine agora e não perca nada: ${CHECKOUT_URL}`,
          });
          await subscriptionRepo.createEvent({
            user_id: sub.user_id,
            event_type: 'reminder_sent',
            order_id: '',
            amount_cents: 0,
            metadata: { type: 'trial', days_ahead: 2 },
          });
        } catch (err: any) {
          console.error(`[Cron] Falha lembrete trial 2d ${sub.phone}: ${err.message}`);
        }
      }

      // Trial: lembrete dia 7 (último dia)
      const trialExpiring0 = await subscriptionRepo.getTrialExpiringIn(0);
      for (const sub of trialExpiring0) {
        if (!sub.phone) continue;
        try {
          const used = (sub as any).trial_responses_used || 0;
          await messaging.sendText({
            instance,
            to: sub.phone,
            text: `🚨 Último dia do seu teste!\n\nA Cleo já atendeu seus clientes ${used} vezes. Amanhã ela para de responder.\n\nAssine agora e continue sem interrupção: ${CHECKOUT_URL}`,
          });
          await subscriptionRepo.createEvent({
            user_id: sub.user_id,
            event_type: 'reminder_sent',
            order_id: '',
            amount_cents: 0,
            metadata: { type: 'trial', days_ahead: 0 },
          });
        } catch (err: any) {
          console.error(`[Cron] Falha lembrete trial último dia ${sub.phone}: ${err.message}`);
        }
      }

      // === LEMBRETES DE ASSINATURAS PAGAS ===
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

      // Notificar donos de trial que acabaram de expirar (sessões já desconectadas acima)
      // Busca users que foram marcados como expired AGORA e tinham status trial
      const justExpiredTrials = await subscriptionRepo.getJustExpiredTrials();
      for (const sub of justExpiredTrials) {
        if (!sub.phone) continue;
        try {
          await messaging.sendText({
            instance,
            to: sub.phone,
            text: `😢 Seu teste grátis acabou.\n\nSeus clientes não estão mais recebendo resposta automática da Cleo.\n\nAssine agora e reative em 1 minuto: ${CHECKOUT_URL}`,
          });
          await subscriptionRepo.createEvent({
            user_id: sub.user_id,
            event_type: 'reminder_sent',
            order_id: '',
            amount_cents: 0,
            metadata: { type: 'trial_expired_notification' },
          });
        } catch (err: any) {
          console.error(`[Cron] Falha notificação trial expirado ${sub.phone}: ${err.message}`);
        }
      }
    } catch (error) {
      console.error('[Cron] Erro subscription:', error);
    }
  });

  job.start();
  console.log(`[Cron] Subscription cron iniciado (schedule: ${schedule})`);
}
