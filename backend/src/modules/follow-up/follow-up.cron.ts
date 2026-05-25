import { CronJob } from 'cron';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';

export function startFollowUpCron(): void {
  const schedule = env.FOLLOWUP_CRON_SCHEDULE;
  const staleHours = env.FOLLOWUP_STALE_HOURS;

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando follow-ups e leads sem resposta...');

    const { messaging, followUpRepo, messageRepo, userRepo } = container;

    try {
      const dueFollowUps = await followUpRepo.getDue();

      for (const followUp of dueFollowUps) {
        const user = await userRepo.findById(followUp.user_id);
        if (!user) continue;

        const lastMsg = await messageRepo.getLastMessage(followUp.lead_id);
        const contexto = lastMsg ? ` Última conversa: "${lastMsg.text.slice(0, 50)}..."` : '';

        await messaging.sendText({
          instance: 'secretary',
          to: user.phone,
          text: `🔔 *Lembrete:* Você pediu pra falar com alguém hoje.${contexto}`,
        });
        await followUpRepo.markSent(followUp.id);
      }

      const users = await userRepo.listAll();

      for (const user of users) {
        const staleLeads = await followUpRepo.checkStaleLeads(user.id, staleHours);
        if (staleLeads.length === 0) continue;

        if (staleLeads.length === 1) {
          await messaging.sendText({
            instance: 'secretary',
            to: user.phone,
            text: `👋 O(a) *${staleLeads[0].name}* tá esperando retorno. Quer que eu te lembre mais tarde?`,
          });
        } else {
          const list = staleLeads.slice(0, 5).map((l) => `• *${l.name}*`).join('\n');
          await messaging.sendText({
            instance: 'secretary',
            to: user.phone,
            text: `👋 Você tem ${staleLeads.length} clientes esperando retorno:\n\n${list}\n\nQuer ver detalhes?`,
          });
        }
      }
    } catch (error) {
      console.error('[Cron] Erro:', error);
    }
  });

  job.start();
  console.log(`[Cron] Follow-up cron iniciado (schedule: ${schedule}, staleHours: ${staleHours})`);
}
