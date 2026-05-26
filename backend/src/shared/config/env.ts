import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Gemini
  GEMINI_API_KEY: z.string().min(1),

  // Groq (fallback de IA)
  GROQ_API_KEY: z.string().optional(),

  // Messaging Provider
  MESSAGING_PROVIDER: z.enum(['evolution-api', 'evolution-go']).default('evolution-api'),

  // Evolution API / Evolution Go
  EVOLUTION_API_URL: z.string().url().default('http://localhost:8080'),
  EVOLUTION_API_KEY: z.string().min(1),

  // WhatsApp
  SECRETARY_PHONE: z.string().min(10),

  // Webhook
  WEBHOOK_URL: z.string().url().default('http://localhost:3001/webhooks/evolution'),

  // Logger
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_DIR: z.string().default('./logs'),

  // Monitor de Conexão
  MONITOR_INSTANCE: z.string().default('secretary'),
  MONITOR_ADMIN_PHONE: z.string().min(10).optional(),

  // Redis / Queue (BullMQ)
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
