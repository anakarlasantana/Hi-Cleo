import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database (PostgreSQL)
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Gemini
  GEMINI_API_KEY: z.string().min(1),

  // DeepSeek (provider primário de IA)
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-v4-flash'),

  // Groq (fallback de IA)
  GROQ_API_KEY: z.string().optional(),

  // IA — Orçamento diário (alerta preventivo, não bloqueia)
  AI_DAILY_CALL_BUDGET: z.coerce.number().default(5000),

  // Messaging Provider
  MESSAGING_PROVIDER: z.enum(['evolution-api', 'evolution-go']).default('evolution-api'),

  // Evolution API / Evolution Go
  EVOLUTION_API_URL: z.string().url().default('http://localhost:8080'),
  EVOLUTION_API_KEY: z.string().min(1),

  // WhatsApp
  SECRETARY_PHONE: z.string().min(10),

  // Webhook
  WEBHOOK_URL: z.string().url().default('http://localhost:3001/webhooks/evolution'),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),

  // Logger
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_DIR: z.string().default('./logs'),

  // Monitor de Conexão
  MONITOR_INSTANCE: z.string().default('secretary'),
  MONITOR_ADMIN_PHONE: z.string().min(10).optional(),

  // Redis / Queue (BullMQ)
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  // Senha do Redis — obrigatória em produção (docker-compose.prod.yml usa --requirepass).
  // Opcional em dev, onde o Redis sobe sem autenticação.
  REDIS_PASSWORD: z.string().optional(),
  QUEUE_MAX_RETRIES: z.coerce.number().default(3),
  QUEUE_BACKOFF_DELAYS: z.string().default('5000,15000,45000'),

  // Follow-up Cron
  FOLLOWUP_STALE_HOURS: z.coerce.number().default(48),
  FOLLOWUP_CRON_SCHEDULE: z.string().default('0 * * * *'),

  // Contact Monitor Cron
  CONTACT_MONITOR_CRON_SCHEDULE: z.string().default('0 0 * * *'),

  // Cancellation Cron
  CANCELLATION_CRON_SCHEDULE: z.string().default('0 0 * * *'),

  // Mercado Pago
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(1),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(1),

  // URLs públicas
  CHECKOUT_URL: z.string().url().default('https://hicleo.com.br/checkout'),
  SITE_URL: z.string().url().default('https://hicleo.com.br'),

  // Segurança
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RATE_LIMIT_GLOBAL: z.coerce.number().default(200),
  RATE_LIMIT_PAYMENTS: z.coerce.number().default(5),

  // Rate Limiting de saída — WhatsApp anti-ban
  WA_RATE_LIMIT_PER_HOUR: z.coerce.number().default(25),
  WA_RATE_LIMIT_PER_DAY: z.coerce.number().default(200),
  WA_MIN_DELAY_MS: z.coerce.number().default(2000),
  WA_MAX_DELAY_MS: z.coerce.number().default(5000),
  WA_BURST_MAX: z.coerce.number().default(3),
  WA_BURST_COOLDOWN_MS: z.coerce.number().default(12000),

  // Sentry (opcional — error tracking)
  SENTRY_DSN: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
