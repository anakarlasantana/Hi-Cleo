import { CronJob } from 'cron';
import { eq, and, lt, ne, inArray, isNotNull, desc } from 'drizzle-orm';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { db } from '../../shared/config/database.js';
import { trialAttempts, subscriptionEvents } from '../../shared/schema.js';

const CHECKOUT_URL = env.CHECKOUT_URL || 'https://hicleo.com.br/checkout';
const MAX_SENDS_PER_RUN = 20; // Rate limit: max 20 envios por execução

interface ProspectionCandidate {
  id: string;
  name: string;
  phone: string;
  status: string;
  responsesUsed: number;
  leadsCaptured: number;
  whatsappConnected: boolean;
  onboardingCompleted: boolean;
  prospectionAttempts: number;
  trialUserId: string | null;
  expiredAt: Date | null;
  createdAt: Date | null;
}

type Temperature = 'hot' | 'warm' | 'cold';

function classifyTemperature(candidate: ProspectionCandidate): Temperature {
  if (candidate.responsesUsed >= 20 && candidate.whatsappConnected && candidate.leadsCaptured > 0) {
    return 'hot';
  }
  if (candidate.onboardingCompleted && candidate.responsesUsed >= 5) {
    return 'warm';
  }
  return 'cold';
}

function getMinDaysSinceExpiry(temp: Temperature, attempt: number): number {
  if (attempt === 0) {
    if (temp === 'hot') return 1;
    if (temp === 'warm') return 3;
    return 7;
  }
  if (temp === 'hot') return 14;
  if (temp === 'warm') return 17;
  return 999;
}

function buildMessage(candidate: ProspectionCandidate, temp: Temperature, attempt: number): string {
  const firstName = candidate.name.split(' ')[0];

  if (attempt === 0) {
    if (temp === 'hot') {
      return `Oi ${firstName}! A Cleo atendeu ${candidate.leadsCaptured} cliente(s) pra você no teste. Seus clientes tão sem resposta desde que o teste acabou. Quer reativar?\n\n${CHECKOUT_URL}`;
    }
    if (temp === 'warm') {
      return `Oi ${firstName}! Como foi o teste da Cleo? Vi que você configurou tudo certinho. Alguma dúvida? Quer continuar usando?\n\n${CHECKOUT_URL}`;
    }
    return `Oi ${firstName}! Vi que você se cadastrou pra testar a Cleo mas não conseguiu configurar. Posso ajudar? É rapidinho, menos de 5 minutos!`;
  }

  if (temp === 'hot') {
    return `Oi ${firstName}! Oferta especial: primeiro mês com 15% off pra você voltar. Válido por 7 dias 🎉\n\n${CHECKOUT_URL}`;
  }
  return `Oi ${firstName}! A Cleo tá com saudade 😊 Primeiro mês com desconto especial pra você:\n\n${CHECKOUT_URL}`;
}

export function startTrialProspectionCron(): void {
  const schedule = '0 10 * * *';

  const job = new CronJob(schedule, async () => {
    console.log('[Cron] Verificando prospecção pós-trial...');

    const { messaging, subscriptionRepo } = container;
    const instance = env.MONITOR_INSTANCE;

    try {
      // Buscar candidatos: trials expirados ou nunca ativados, com < 2 tentativas
      const candidates = await db
        .select()
        .from(trialAttempts)
        .where(
          and(
            inArray(trialAttempts.status, ['expired', 'started']),
            ne(trialAttempts.prospectionStatus, 'not_interested'),
            ne(trialAttempts.prospectionStatus, 'converted'),
            lt(trialAttempts.prospectionAttempts, 2),
            isNotNull(trialAttempts.phone),
          ),
        )
        .orderBy(desc(trialAttempts.responsesUsed));

      if (candidates.length === 0) return;

      let sentCount = 0;

      for (const raw of candidates) {
        if (sentCount >= MAX_SENDS_PER_RUN) break;

        const candidate: ProspectionCandidate = {
          id: raw.id,
          name: raw.name,
          phone: raw.phone,
          status: raw.status || 'started',
          responsesUsed: raw.responsesUsed || 0,
          leadsCaptured: raw.leadsCaptured || 0,
          whatsappConnected: raw.whatsappConnected || false,
          onboardingCompleted: raw.onboardingCompleted || false,
          prospectionAttempts: raw.prospectionAttempts || 0,
          trialUserId: raw.trialUserId,
          expiredAt: raw.expiredAt,
          createdAt: raw.createdAt,
        };

        const temp = classifyTemperature(candidate);
        const attempt = candidate.prospectionAttempts;

        // Frios não recebem 2ª tentativa
        if (temp === 'cold' && attempt >= 1) continue;

        // Verificar timing: dias desde expiração
        const expiryDate = candidate.expiredAt || candidate.createdAt || new Date();
        const daysSinceExpiry = Math.floor((Date.now() - new Date(expiryDate).getTime()) / (1000 * 60 * 60 * 24));
        const minDays = getMinDaysSinceExpiry(temp, attempt);

        if (daysSinceExpiry < minDays) continue;

        // Verificar intervalo mínimo desde última prospecção (13 dias)
        if (attempt > 0) {
          const userId = candidate.trialUserId || candidate.id;
          const [lastEvent] = await db
            .select({ createdAt: subscriptionEvents.createdAt })
            .from(subscriptionEvents)
            .where(
              and(
                eq(subscriptionEvents.userId, userId),
                eq(subscriptionEvents.eventType, 'trial_prospection_sent'),
              ),
            )
            .orderBy(desc(subscriptionEvents.createdAt))
            .limit(1);

          if (lastEvent) {
            const daysSinceLastSent = Math.floor((Date.now() - new Date(lastEvent.createdAt).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceLastSent < 13) continue;
          }
        }

        // Enviar mensagem
        const message = buildMessage(candidate, temp, attempt);

        try {
          await messaging.sendText({ instance, to: candidate.phone, text: message });

          // Atualizar trial_attempts
          await db.update(trialAttempts)
            .set({
              prospectionAttempts: attempt + 1,
              prospectionStatus: 'contacted',
              lastProspectionAt: new Date(),
            })
            .where(eq(trialAttempts.id, candidate.id));

          // Registrar evento
          await subscriptionRepo.createEvent({
            user_id: candidate.trialUserId || candidate.id,
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
