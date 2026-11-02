import { CronJob } from 'cron';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { withinServiceWindow } from '../../shared/utils/owner-notices.js';

export function startFollowUpCron(): void {
  const schedule = env.FOLLOWUP_CRON_SCHEDULE;
  const staleHours = env.FOLLOWUP_STALE_HOURS;

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando follow-ups e leads sem resposta...');

    const { messaging, followUpRepo, messageRepo, userRepo, leadService } = container;

    try {
      const dueFollowUps = await followUpRepo.getDue();

      for (const followUp of dueFollowUps) {
        const user = await userRepo.findById(followUp.user_id);
        if (!user || !user.phone) continue;

        const lastMsg = await messageRepo.getLastMessage(followUp.lead_id);
        const contexto = lastMsg ? ` Última conversa: "${lastMsg.text.slice(0, 50)}..."` : '';

        await messaging.sendText({
          instance: env.MONITOR_INSTANCE,
          to: user.phone,
          text: `🔔 *Lembrete:* Você pediu pra falar com alguém hoje.${contexto}`,
        });
        await followUpRepo.markSent(followUp.id);
      }

      const users = await userRepo.listAll();

      for (const user of users) {
        if (!user.phone) continue;

        const staleLeads = await followUpRepo.checkStaleLeads(user.id, staleHours);
        if (staleLeads.length === 0) continue;

        // Guard da janela de 24h do WhatsApp: fora dela a API oficial só aceita
        // template aprovado (texto livre é rejeitado e, em número não oficial, é
        // o padrão que mais derruba conta). 'warn' observa; 'block' segura o envio.
        const ownerLead = await leadService.findOrCreate(user.id, user.phone, user.name || 'Dono');
        const recentes = await messageRepo.getByLead(ownerLead.id, 8);
        const lastInbound = recentes.find((msg: any) => msg.direction === 'inbound');
        const insideWindow = withinServiceWindow(lastInbound?.timestamp);

        if (!insideWindow) {
          const aviso = '[Cron] aviso proativo fora da janela de 24h — exigiria template aprovado';
          if (env.PROACTIVE_WINDOW_GUARD === 'block') {
            console.warn(`${aviso} (envio bloqueado)`, { user: user.id.slice(0, 8) });
            continue;
          }
          console.warn(`${aviso} (enviando em modo warn)`, { user: user.id.slice(0, 8) });
        }

        // Aviso ACIONÁVEL: ensina o comando que a Cleo entende. Antes ela
        // perguntava “quer que eu lembre?” e responder “sim” não fazia nada.
        if (staleLeads.length === 1) {
          await messaging.sendText({
            instance: env.MONITOR_INSTANCE,
            to: user.phone,
            text: `👋 O(a) *${staleLeads[0].name}* tá esperando retorno.\n\nQuer que eu lembre? Responda: "lembra do ${staleLeads[0].name} amanhã"`,
          });
        } else {
          const list = staleLeads.slice(0, 5).map((l) => `• *${l.name}*`).join('\n');
          await messaging.sendText({
            instance: env.MONITOR_INSTANCE,
            to: user.phone,
            text: `👋 Você tem ${staleLeads.length} clientes esperando retorno:\n\n${list}\n\nQuer lembrar alguém? Responda: "lembra do [nome] amanhã"`,
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
