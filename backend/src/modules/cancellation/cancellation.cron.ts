import { CronJob } from 'cron';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { GRACE_PERIOD_DAYS } from './constants.js';

export function startCancellationCron(): void {
  const schedule = env.CANCELLATION_CRON_SCHEDULE;

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando assinaturas expiradas...');

    const { cancellationRepo } = container;

    try {
      // Find users whose subscription expired (cancelled + past access_until)
      const expiredUsers = await cancellationRepo.findExpiredSubscriptions();

      for (const record of expiredUsers) {
        try {
          // Disconnect all WhatsApp sessions and update status to expired
          await cancellationRepo.disconnectAllSessions(record.user_id);
          await cancellationRepo.updateSubscriptionStatus(record.user_id, 'expired');
          console.log(`[Cron] Usuário ${record.user_id} expirado — sessões desconectadas`);
        } catch (error) {
          console.error(`[Cron] Erro ao expirar usuário ${record.user_id}:`, error);
        }
      }

      // Find users past grace period (30 days after expiration) — delete data
      const purgeUsers = await cancellationRepo.findPastGracePeriod(GRACE_PERIOD_DAYS);

      for (const record of purgeUsers) {
        try {
          await cancellationRepo.purgeUserData(record.user_id);
          console.log(`[Cron] Dados do usuário ${record.user_id} removidos (grace period expirado)`);
        } catch (error) {
          console.error(`[Cron] Erro ao purgar dados do usuário ${record.user_id}:`, error);
        }
      }
    } catch (error) {
      console.error('[Cron] Erro no cron de cancelamento:', error);
    }
  });

  job.start();
  console.log(`[Cron] Cancellation cron iniciado (schedule: ${schedule})`);
}
