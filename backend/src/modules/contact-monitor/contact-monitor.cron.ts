import { CronJob } from 'cron';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';

export function startContactMonitorCron(): void {
  const schedule = env.CONTACT_MONITOR_CRON_SCHEDULE;
  const adminPhone = env.MONITOR_ADMIN_PHONE;

  if (!adminPhone) {
    console.log('[Cron] Contact monitor desativado — MONITOR_ADMIN_PHONE não configurado');
    return;
  }

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando threshold de contatos...');

    const { contactMonitorService, messaging } = container;

    try {
      const exceeded = await contactMonitorService.checkAlertThreshold();
      if (!exceeded) return;

      const metrics = await contactMonitorService.getSystemMetrics();

      const alertText = [
        '⚠️ *ALERTA: Threshold de contatos excedido*',
        '',
        `📊 Total de contatos: ${metrics.totalContacts.toLocaleString('pt-BR')}`,
        `👤 Média por usuário: ${metrics.avgPerUser.toLocaleString('pt-BR')}`,
        `📈 Máximo por usuário: ${metrics.maxPerUser.toLocaleString('pt-BR')}`,
        '',
        'Verifique o uso de armazenamento no Supabase.',
      ].join('\n');

      await messaging.sendText({
        instance: 'secretary',
        to: adminPhone,
        text: alertText,
      });

      console.log('[Cron] Alerta de contatos enviado ao admin');
    } catch (error) {
      console.error('[Cron] Erro no monitor de contatos:', error);
    }
  });

  job.start();
  console.log(`[Cron] Contact monitor cron iniciado (schedule: ${schedule})`);
}
