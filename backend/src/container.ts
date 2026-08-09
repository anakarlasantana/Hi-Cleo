import { env } from './shared/config/env.js';

// Adapters
import { GeminiAdapter } from './modules/ai/adapters/gemini.adapter.js';
import { GroqAdapter } from './modules/ai/adapters/groq.adapter.js';
import { AiFallbackAdapter } from './modules/ai/adapters/ai-fallback.adapter.js';
import { EvolutionApiAdapter } from './modules/evolution/evolution-api.adapter.js';
import { EvolutionGoAdapter } from './modules/evolution/evolution-go.adapter.js';
import { SupabaseActivationRepository, SupabaseUserRepository } from './modules/activation/activation.repository.js';
import { SupabaseLeadRepository } from './modules/leads/leads.repository.js';
import { SupabaseMessageRepository } from './modules/messages/messages.repository.js';
import { SupabaseFollowUpRepository } from './modules/follow-up/follow-up.repository.js';
import { SupabaseRuleRepository } from './modules/rules/rules.repository.js';
import { SupabaseOnboardingRepository } from './modules/onboarding/onboarding.repository.js';
import { SupabaseExclusionRepository } from './modules/exclusion/exclusion.repository.js';
import { SupabaseSessionRepository } from './modules/webhooks/webhooks.repository.js';
import { SupabasePlanRepository } from './modules/plans/plans.repository.js';
import { SupabaseTermsConsentRepository } from './modules/terms/terms.repository.js';
import { SupabaseCancellationRepository } from './modules/cancellation/cancellation.repository.js';
import { SupabaseContactMonitorRepository } from './modules/contact-monitor/contact-monitor.repository.js';
import { SupabasePaymentRepository } from './modules/payment/payment.repository.js';
import { SupabaseSubscriptionRepository } from './modules/subscription/subscription.repository.js';
import { SupabaseInviteRepository } from './modules/invites/invites.repository.js';

// Services
import { ActivationService } from './modules/activation/activation.service.js';
import { LeadService } from './modules/leads/leads.service.js';
import { OnboardingService } from './modules/onboarding/onboarding.service.js';
import { RuleEngine } from './modules/rules/rules.service.js';
import { AssistenteService } from './modules/assistente/assistente.service.js';
import { PlanService } from './modules/plans/plans.service.js';
import { TermsConsentService } from './modules/terms/terms.service.js';
import { CancellationService } from './modules/cancellation/cancellation.service.js';
import { ContactMonitorService } from './modules/contact-monitor/contact-monitor.service.js';
import { PaymentService } from './modules/payment/payment.service.js';
import { SubscriptionService } from './modules/subscription/subscription.service.js';
import { InviteService } from './modules/invites/invites.service.js';

// Adapters (Payment)
import { MercadoPagoAdapter } from './modules/payment/mercadopago.adapter.js';

// Logger
import { createLogger } from './shared/logger/logger.js';

// Queue
import { QueueService } from './modules/queue/queue.service.js';
import { MessageWorker } from './modules/queue/queue.worker.js';
import { createMessageProcessor } from './modules/queue/message.processor.js';
import type { QueuePort, WorkerPort, MessageProcessorPort } from './modules/queue/queue.port.js';

// --- Adapters ---

const logger = createLogger();
const gemini = new GeminiAdapter();
const providers: { name: string; adapter: any }[] = [{ name: 'Gemini', adapter: gemini }];

if (env.GROQ_API_KEY) {
  providers.push({ name: 'Groq', adapter: new GroqAdapter() });
}

const ai = new AiFallbackAdapter(providers, logger, async (message) => {
  if (env.MONITOR_ADMIN_PHONE) {
    try {
      await messaging.sendText({ instance: env.MONITOR_INSTANCE, to: env.MONITOR_ADMIN_PHONE, text: message });
    } catch { /* se messaging também falhou, só loga */ }
  }
}, env.AI_DAILY_CALL_BUDGET);

const messaging = env.MESSAGING_PROVIDER === 'evolution-go'
  ? new EvolutionGoAdapter(env.EVOLUTION_API_URL, env.EVOLUTION_API_KEY)
  : new EvolutionApiAdapter(env.EVOLUTION_API_URL, env.EVOLUTION_API_KEY);

// --- Repositories ---

const activationRepo = new SupabaseActivationRepository();
const userRepo = new SupabaseUserRepository();
const leadRepo = new SupabaseLeadRepository();
const messageRepo = new SupabaseMessageRepository();
const followUpRepo = new SupabaseFollowUpRepository();
const ruleRepo = new SupabaseRuleRepository();
const onboardingRepo = new SupabaseOnboardingRepository();
const exclusionRepo = new SupabaseExclusionRepository();
const sessionRepo = new SupabaseSessionRepository();
const planRepo = new SupabasePlanRepository();
const termsConsentRepo = new SupabaseTermsConsentRepository();
const cancellationRepo = new SupabaseCancellationRepository();
const contactMonitorRepo = new SupabaseContactMonitorRepository();
const paymentRepo = new SupabasePaymentRepository();
const subscriptionRepo = new SupabaseSubscriptionRepository();
const inviteRepo = new SupabaseInviteRepository();

// --- Services ---

const activationService = new ActivationService(activationRepo, userRepo, onboardingRepo, ai);
const leadService = new LeadService(leadRepo);
const onboardingService = new OnboardingService(onboardingRepo, ruleRepo, ai);
const ruleEngine = new RuleEngine(ruleRepo);
const assistenteService = new AssistenteService(ai);
const planService = new PlanService(planRepo);
const termsConsentService = new TermsConsentService(termsConsentRepo);
const cancellationService = new CancellationService(cancellationRepo);
const contactMonitorService = new ContactMonitorService(contactMonitorRepo);

// Payment & Subscription
const mercadoPagoAdapter = new MercadoPagoAdapter(env.MERCADO_PAGO_ACCESS_TOKEN);
const paymentService = new PaymentService(mercadoPagoAdapter, paymentRepo, planRepo);
const subscriptionService = new SubscriptionService(subscriptionRepo);
const inviteService = new InviteService(inviteRepo, planService, userRepo);

// Configurar dependências do webhook (referência circular resolvida aqui)
paymentService.setWebhookDeps({ subscriptionService, activationService, userRepo, messaging, monitorInstance: env.MONITOR_INSTANCE });

// --- Queue ---

const queueConfig = {
  redisHost: env.REDIS_HOST,
  redisPort: env.REDIS_PORT,
  maxRetries: env.QUEUE_MAX_RETRIES,
  backoffDelays: env.QUEUE_BACKOFF_DELAYS.split(',').map(Number),
};

const queueService: QueuePort = new QueueService(queueConfig, logger);

// Container parcial para o processor (será completado abaixo)
const containerRef: any = {};

const messageProcessor: MessageProcessorPort = createMessageProcessor(containerRef, logger);
const messageWorker: WorkerPort = new MessageWorker(queueConfig, messageProcessor, logger);

// --- Export ---

export const container = {
  logger,
  ai,
  messaging,

  activationRepo,
  userRepo,
  leadRepo,
  messageRepo,
  followUpRepo,
  ruleRepo,
  onboardingRepo,
  exclusionRepo,
  sessionRepo,
  planRepo,
  termsConsentRepo,
  cancellationRepo,
  contactMonitorRepo,
  paymentRepo,
  subscriptionRepo,

  activationService,
  leadService,
  onboardingService,
  ruleEngine,
  assistenteService,
  planService,
  termsConsentService,
  cancellationService,
  contactMonitorService,
  paymentService,
  subscriptionService,
  inviteService,
  mercadoPagoAdapter,

  queueService,
  messageProcessor,
  messageWorker,
};

// Preencher referência circular para o processor
Object.assign(containerRef, container);
