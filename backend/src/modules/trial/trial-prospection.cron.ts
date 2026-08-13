import { CronJob } from 'cron';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { supabase } from '../../shared/config/supabase.js';

const CHECKOUT_URL = env.CHECKOUT_URL || 'https://hicleo.com.br/checkout';
const MAX_SENDS_PER_RUN = 20; // Rate limit: max 20 envios por execução

interface ProspectionCandidate {
  id: string;
  name: string;
  phone: string;
  status: string;
  responses_used: number;
  leads_captured: number;
  whatsapp_connected: boolean;
  onboarding_completed: boolean;
  prospection_attempts: number;
  trial_user_id: string | null;
  expired_at: string | null;
  created_at: string;
}

type Temperature = 'hot' | 'warm' | 'cold';

function classifyTemperature(candidate: ProspectionCandidate): Temperature {
  if (candidate.responses_used >= 20 && candidate.whatsapp_connected && candidate.leads_captured > 0) {
    return 'hot';
  }
  if (candidate.onboarding_completed && candidate.responses_used >= 5) {
    return 'warm';
  }
  return 'cold';
}

function getMinDaysSinceExpiry(temp: Temperature, attempt: number): number {
  // 1ª tentativa
  if (attempt === 0) {
    if (temp === 'hot') return 1;   // dia 8 (1 dia após expirar)
    if (temp === 'warm') return 3;  // dia 10
    return 7;                        // dia 14 (frios)
  }
  // 2ª tentativa (13 dias após a primeira)
  if (temp === 'hot') return 14;    // dia 21
  if (temp === 'warm') return 17;   // dia 24
  return 999; // frios nunca recebem 2ª tentativa
}

function buildMessage(candidate: ProspectionCandidate, temp: Temperature, attempt: number): string {
  const firstName = candidate.name.split(' ')[0];

  if (attempt === 0) {
    // 1ª tentativa
    if (temp === 'hot') {
      return `Oi ${firstName}! A Cleo atendeu ${candidate.leads_captured} cliente(s) pra você no teste. Seus clientes tão sem resposta desde que o teste acabou. Quer reativar?\n\n${CHECKOUT_URL}`;
    }
    if (temp === 'warm') {
      return `Oi ${firstName}! Como foi o teste da Cleo? Vi que você configurou tudo certinho. Alguma dúvida? Quer continuar usando?\n\n${CHECKOUT_URL}`;
    }
    // cold
    return `Oi ${firstName}! Vi que você se cadastrou pra testar a Cleo mas não conseguiu configurar. Posso ajudar? É rapidinho, menos de 5 minutos!`;
  }

  // 2ª tentativa
  if (temp === 'hot') {
    return `Oi ${firstName}! Oferta especial: primeiro mês com 15% off pra você voltar. Válido por 7 dias 🎉\n\n${CHECKOUT_URL}`;
  }
  // warm
  return `Oi ${firstName}! A Cleo tá com saudade 😊 Primeiro mês com desconto especial pra você:\n\n${CHECKOUT_URL}`;
}

export function startTrialProspectionCron(): void {
  // Roda diariamente às 10h (horário comercial)
  const schedule = '0 10 * * *';

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando prospecção pós-trial...');

    const { messaging, subscriptionRepo } = container;
    const instance = env.MONITOR_INSTANCE;

    try {
      // Buscar candidatos: trials expirados ou nunca ativados, com < 2 tentativas
      const { data: candidates } = await supabase
        .from('trial_attempts')
        .select('*')
        .in('status', ['expired', 'started'])
        .neq('prospection_status', 'not_interested')
        .neq('prospection_status', 'converted')
        .lt('prospection_attempts', 2)
        .not('phone', 'is', null)
        .order('responses_used', { ascending: false }); // prioriza quentes

      if (!candidates || candidates.length === 0) {
        return;
      }

      let sentCount = 0;

      for (const candidate of candidates as ProspectionCandidate[]) {
        if (sentCount >= MAX_SENDS_PER_RUN) break;

        const temp = classifyTemperature(candidate);
        const attempt = candidate.prospection_attempts;

        // Frios não recebem 2ª tentativa
        if (temp === 'cold' && attempt >= 1) continue;

        // Verificar timing: dias desde expiração
        const expiryDate = candidate.expired_at || candidate.created_at;
        const daysSinceExpiry = Math.floor((Date.now() - new Date(expiryDate).getTime()) / (1000 * 60 * 60 * 24));
        const minDays = getMinDaysSinceExpiry(temp, attempt);

        if (daysSinceExpiry < minDays) continue;

        // Verificar intervalo mínimo desde última prospecção (13 dias)
        if (attempt > 0) {
          const { data: events } = await supabase
            .from('subscription_events')
            .select('created_at')
            .eq('user_id', candidate.trial_user_id || candidate.id)
            .eq('event_type', 'trial_prospection_sent')
            .order('created_at', { ascending: false })
            .limit(1);

          if (events && events.length > 0) {
            const lastSent = new Date(events[0].created_at);
            const daysSinceLastSent = Math.floor((Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceLastSent < 13) continue;
          }
        }

        // Enviar mensagem
        const message = buildMessage(candidate, temp, attempt);

        try {
          await messaging.sendText({ instance, to: candidate.phone, text: message });

          // Atualizar trial_attempts
          await supabase
            .from('trial_attempts')
            .update({
              prospection_attempts: attempt + 1,
              prospection_status: 'contacted',
              last_prospection_at: new Date().toISOString(),
            })
            .eq('id', candidate.id);

          // Registrar evento
          await subscriptionRepo.createEvent({
            user_id: candidate.trial_user_id || candidate.id,
            event_type: 'trial_prospection_sent' as any,
            order_id: '',
            amount_cents: 0,
            metadata: { temperature: temp, attempt: attempt + 1, phone: candidate.phone.slice(0, 6) + '****' },
          });

          sentCount++;
          console.log(`[Cron] Prospecção enviada: ${candidate.phone.slice(0, 6)}**** (${temp}, tentativa ${attempt + 1})`);

          // Delay de 3s entre envios (anti-ban WhatsApp)
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (err: any) {
          console.error(`[Cron] Falha prospecção ${candidate.phone.slice(0, 6)}****: ${err.message}`);
        }
      }

      if (sentCount > 0) {
        console.log(`[Cron] Prospecção: ${sentCount} mensagem(ns) enviada(s)`);
      }
    } catch (error) {
      console.error('[Cron] Erro prospecção pós-trial:', error);
    }
  });

  job.start();
  console.log(`[Cron] Trial prospection cron iniciado (schedule: ${schedule})`);
}
