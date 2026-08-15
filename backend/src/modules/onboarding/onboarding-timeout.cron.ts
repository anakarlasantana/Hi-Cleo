import { CronJob } from 'cron';
import { and, lt, ne } from 'drizzle-orm';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { db } from '../../shared/config/database.js';
import { onboardingStates } from '../../shared/schema.js';

/** Horas sem atividade para considerar onboarding abandonado */
const ONBOARDING_TIMEOUT_HOURS = 48;

/**
 * Cron que verifica onboardings parados há mais de 48h.
 * Envia lembrete amigável para o usuário voltar a completar.
 *
 * Executa 1x por dia às 10h (horário do servidor).
 */
export function startOnboardingTimeoutCron(): void {
  const schedule = '0 10 * * *'; // Todo dia às 10h

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando onboardings abandonados...');

    const { messaging, userRepo } = container;

    try {
      // Buscar onboardings parados há mais de TIMEOUT horas
      const cutoff = new Date(Date.now() - ONBOARDING_TIMEOUT_HOURS * 60 * 60 * 1000);

      const staleOnboardings = await db
        .select({ userId: onboardingStates.userId, step: onboardingStates.step, updatedAt: onboardingStates.updatedAt })
        .from(onboardingStates)
        .where(and(ne(onboardingStates.step, 'completed'), lt(onboardingStates.updatedAt, cutoff)));

      if (staleOnboardings.length === 0) return;

      let remindersSent = 0;

      for (const stale of staleOnboardings) {
        if (!stale.userId) continue;
        const user = await userRepo.findById(stale.userId);
        if (!user || !user.phone) continue;

        const userName = user.name || 'parceiro(a)';

        await messaging.sendText({
          instance: env.MONITOR_INSTANCE,
          to: user.phone,
          text: `Oi, ${userName}! 👋\n\nParece que ficou algo pendente na sua configuração. Quer continuar de onde parou? É rapidinho!\n\nÉ só mandar qualquer mensagem aqui que a gente retoma. Se preferir recomeçar do zero, me diga "recomeçar" 🔄`,
        });

        remindersSent++;
      }

      if (remindersSent > 0) {
        console.log(`[Cron] ${remindersSent} lembrete(s) de onboarding enviado(s).`);
      }
    } catch (error) {
      console.error('[Cron] Erro no timeout de onboarding:', error);
    }
  });

  job.start();
  console.log(`[Cron] Onboarding timeout cron iniciado (timeout: ${ONBOARDING_TIMEOUT_HOURS}h)`);
}
