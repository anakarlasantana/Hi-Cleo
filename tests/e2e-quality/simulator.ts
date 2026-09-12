/**
 * Simulador de webhook — envia mensagens como se viessem do WhatsApp
 * e coleta as respostas da Cleo do banco de dados.
 */

import axios from 'axios';
import pg from 'pg';
import { config } from './config.js';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const { Pool } = pg;
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 3 });
  }
  return pool;
}

// ─── Funções existentes ──────────────────────────────────────────────────────

/** Envia mensagem simulada via webhook do Evolution API */
export async function sendMessage(phone: string, text: string): Promise<void> {
  const msgId = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await axios.post(
    `${config.baseUrl}/webhooks/evolution`,
    {
      instance: config.instance,
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
          id: msgId,
        },
        message: { conversation: text },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: 'E2E Test User',
      },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
  );
}

/**
 * Aguarda e coleta a resposta da Cleo consultando o banco.
 * A Cleo salva a resposta na tabela messages (direction='outbound') antes de enviar.
 */
export async function waitForResponse(phone: string, afterTimestamp: Date): Promise<string | null> {
  const db = getPool();
  const maxWait = config.messageDelay + 5000;
  const pollInterval = 1000;
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    const result = await db.query(
      `SELECT m.text FROM messages m
       JOIN leads l ON l.id = m.lead_id
       WHERE l.phone = $1
         AND m.direction = 'outbound'
         AND m.timestamp > $2
       ORDER BY m.timestamp DESC
       LIMIT 1`,
      [phone, afterTimestamp.toISOString()],
    );

    if (result.rows.length > 0) {
      return result.rows[0].text;
    }

    await sleep(pollInterval);
  }

  return null;
}

/** Busca o step atual do onboarding de um usuário */
export async function getOnboardingStep(phone: string): Promise<string | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT os.step FROM onboarding_states os
     JOIN users u ON u.id = os.user_id
     WHERE u.phone = $1`,
    [phone],
  );
  return result.rows[0]?.step || null;
}

/** Inicia um trial e retorna o código de ativação */
export async function startTrial(phone: string, name: string): Promise<string> {
  const response = await axios.post(
    `${config.baseUrl}/api/trial/start`,
    { name, phone },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
  );
  return response.data.activationCode;
}

/** Limpa dados de um telefone de teste (para repetir) */
export async function cleanupPhone(phone: string): Promise<void> {
  const db = getPool();
  const userSubquery = `(SELECT id FROM users WHERE phone = $1)`;
  await db.query(`DELETE FROM messages WHERE lead_id IN (SELECT id FROM leads WHERE user_id IN ${userSubquery})`, [phone]);
  await db.query(`DELETE FROM follow_ups WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM leads WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM businesses WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM onboarding_states WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM terms_consent WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM cancellations WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM whatsapp_sessions WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM subscription_events WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM invites WHERE owner_user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM excluded_contacts WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM rules WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM payments WHERE activation_code_id IN (SELECT id FROM activation_codes WHERE user_id IN ${userSubquery})`, [phone]);
  await db.query(`DELETE FROM activation_codes WHERE user_id IN ${userSubquery}`, [phone]);
  await db.query(`DELETE FROM trial_attempts WHERE phone = $1`, [phone]);
  await db.query(`DELETE FROM users WHERE phone = $1`, [phone]);
}

/** Fecha pool do banco */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ─── Novas funções de simulação ──────────────────────────────────────────────

/**
 * Envia webhook como se fosse um cliente de um dono (instância diferente da secretary).
 * Usado para simular mensagens de clientes finais que chegam na instância do dono.
 */
export async function sendMessageAsClient(instance: string, phone: string, text: string): Promise<void> {
  const msgId = `e2e-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await axios.post(
    `${config.baseUrl}/webhooks/evolution`,
    {
      instance,
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
          id: msgId,
        },
        message: { conversation: text },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: 'E2E Client User',
      },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
  );
}

/**
 * Simula webhook de pagamento aprovado do MercadoPago.
 * POST para /webhooks/mercadopago com payload de pagamento aprovado.
 */
export async function simulatePaymentWebhook(userId: string, planId: string): Promise<void> {
  await axios.post(
    `${config.baseUrl}/webhooks/mercadopago`,
    {
      action: 'payment.created',
      type: 'payment',
      data: {
        id: `e2e-payment-${Date.now()}`,
        status: 'approved',
        external_reference: userId,
        metadata: {
          plan_id: planId,
          user_id: userId,
        },
        transaction_amount: 49.90,
        currency_id: 'BRL',
        date_approved: new Date().toISOString(),
      },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
  );
}

/** Consulta status do trial de um telefone no banco */
export async function getTrialStatus(phone: string): Promise<{
  status: string;
  responsesUsed: number;
  responsesLimit: number;
  expiresAt: Date | null;
} | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT t.status, u.trial_responses_used as responses_used,
            u.trial_responses_limit as responses_limit,
            u.subscription_expires_at as expires_at
     FROM trial_attempts t
     JOIN users u ON u.id = t.trial_user_id
     WHERE t.phone = $1
     ORDER BY t.created_at DESC LIMIT 1`,
    [phone],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    status: row.status,
    responsesUsed: row.responses_used ?? 0,
    responsesLimit: row.responses_limit ?? 30,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

/** Consulta status da subscription de um telefone no banco */
export async function getSubscriptionStatus(phone: string): Promise<{
  status: string;
  planId: string;
  currentPeriodEnd: Date | null;
} | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT subscription_status as status, plan as plan_id,
            subscription_expires_at as current_period_end
     FROM users
     WHERE phone = $1`,
    [phone],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    status: row.status || 'none',
    planId: row.plan_id,
    currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : null,
  };
}

/**
 * Cria um user de teste direto no banco para cenários que precisam
 * de um user pré-existente (client_message, owner_command, etc.).
 */
export async function createTestUser(
  phone: string,
  name: string,
  options?: {
    plan?: string;
    subscriptionStatus?: string;
    onboardingComplete?: boolean;
  },
): Promise<string> {
  const db = getPool();

  const userResult = await db.query(
    `INSERT INTO users (phone, name, created_at)
     VALUES ($1, $2, NOW())
     RETURNING id`,
    [phone, name],
  );
  const userId: string = userResult.rows[0].id;

  if (options?.onboardingComplete) {
    await db.query(
      `INSERT INTO onboarding_states (id, user_id, step, data, updated_at)
       VALUES (gen_random_uuid(), $1, 'completed', '{}', NOW())
       ON CONFLICT DO NOTHING`,
      [userId],
    );

    // Sem registro de consentimento, o backend intercepta TODA mensagem do dono
    // pedindo aceite dos termos (requiresConsent) — o que impediria qualquer
    // cenário de comando do dono de ser testado.
    await db.query(
      `INSERT INTO terms_consent (id, user_id, terms_version, accepted_at)
       VALUES (gen_random_uuid(), $1, '1.0.0', NOW())
       ON CONFLICT DO NOTHING`,
      [userId],
    );
  }

  if (options?.plan || options?.subscriptionStatus) {
    await db.query(
      `UPDATE users SET plan = $2, subscription_status = $3,
       subscription_started_at = NOW(), subscription_expires_at = NOW() + INTERVAL '30 days'
       WHERE id = $1`,
      [userId, options.plan || 'solo', options.subscriptionStatus || 'active'],
    );
  }

  // Criar business profile de teste (necessário para Cleo gerar respostas contextuais)
  if (options?.onboardingComplete) {
    await db.query(
      `INSERT INTO businesses (id, user_id, name, type, tone_of_voice, target_audience,
       business_hours_start, business_hours_end, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'Serviços gerais', 'friendly_professional', 'Público geral',
       '08:00', '18:00', NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, name],
    );
  }

  return userId;
}

/**
 * Cria uma sessão WhatsApp de teste para simular a instância do dono.
 * Necessário para que handleUserWhatsAppMessage encontre o user via session.
 */
export async function createWhatsappSession(userId: string, instanceName: string): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO whatsapp_sessions (id, user_id, instance_name, status, connected_at)
     VALUES (gen_random_uuid(), $1, $2, 'active', NOW())
     ON CONFLICT DO NOTHING`,
    [userId, instanceName],
  );
}

/**
 * Simula envio de documento (PDF, imagem, etc.) via webhook.
 * Usado para testar fluxo de materiais.
 */
export async function sendMaterial(phone: string, fileName: string, mimeType: string): Promise<void> {
  const msgId = `e2e-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  await axios.post(
    `${config.baseUrl}/webhooks/evolution`,
    {
      instance: config.instance,
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: `${phone}@s.whatsapp.net`,
          fromMe: false,
          id: msgId,
        },
        message: {
          documentMessage: {
            url: `https://fake-cdn.test/${msgId}/${fileName}`,
            mimetype: mimeType,
            fileName,
            fileLength: 1024,
          },
        },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: 'E2E Test User',
      },
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
  );
}

/** Consulta follow-ups agendados para um user */
export async function getFollowUps(userId: string): Promise<Array<{
  id: string;
  scheduledAt: Date;
  status: string;
  leadPhone: string;
}>> {
  const db = getPool();
  const result = await db.query(
    `SELECT f.id, f.scheduled_at, f.status, l.phone as lead_phone
     FROM follow_ups f
     JOIN leads l ON l.id = f.lead_id
     WHERE f.user_id = $1
     ORDER BY f.scheduled_at ASC`,
    [userId],
  );

  return result.rows.map(row => ({
    id: row.id,
    scheduledAt: new Date(row.scheduled_at),
    status: row.status,
    leadPhone: row.lead_phone,
  }));
}

/** Marca trial como expirado no banco (para testar comportamento pós-trial) */
export async function setTrialExpired(phone: string): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE trial_attempts SET status = 'expired', expired_at = NOW()
     WHERE phone = $1`,
    [phone],
  );
  await db.query(
    `UPDATE users SET subscription_status = 'expired',
     subscription_expires_at = NOW() - INTERVAL '1 day'
     WHERE phone = $1`,
    [phone],
  );
}

/** Seta número de respostas usadas no trial (para testar limite) */
export async function setTrialResponsesUsed(phone: string, count: number): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE users SET trial_responses_used = $2
     WHERE phone = $1`,
    [phone, count],
  );
  await db.query(
    `UPDATE trial_attempts SET responses_used = $2
     WHERE phone = $1`,
    [phone, count],
  );
}

/** Marca trial como 'contacted' para testar resposta de prospecção */
export async function markAsProspected(phone: string): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE trial_attempts SET prospection_status = 'contacted',
     last_prospection_at = NOW(), prospection_attempts = prospection_attempts + 1
     WHERE phone = $1`,
    [phone],
  );
}

/** Busca últimas mensagens de um telefone (inbound + outbound) */
export async function getMessages(phone: string, limit?: number): Promise<Turn[]> {
  const db = getPool();
  const maxMessages = limit || 20;

  const result = await db.query(
    `SELECT m.text, m.direction, m.timestamp
     FROM messages m
     JOIN leads l ON l.id = m.lead_id
     WHERE l.phone = $1
     ORDER BY m.timestamp DESC
     LIMIT $2`,
    [phone, maxMessages],
  );

  return result.rows
    .map(row => ({
      role: (row.direction === 'outbound' ? 'assistant' : 'user') as Turn['role'],
      content: row.text,
      timestamp: new Date(row.timestamp),
    }))
    .reverse();
}

/**
 * Espera resposta da Cleo na instância secretary para um telefone específico.
 * Diferente de waitForResponse, este busca especificamente na instância secretary
 * (útil quando a mensagem foi enviada em outra instância mas a resposta sai pela secretary).
 */
export async function waitForSecretaryResponse(phone: string, afterTimestamp: Date): Promise<string | null> {
  const db = getPool();
  const maxWait = config.messageDelay + 5000;
  const pollInterval = 1000;
  const deadline = Date.now() + maxWait;

  while (Date.now() < deadline) {
    const result = await db.query(
      `SELECT m.text FROM messages m
       JOIN leads l ON l.id = m.lead_id
       WHERE l.phone = $1
         AND m.direction = 'outbound'
         AND m.instance = $2
         AND m.timestamp > $3
       ORDER BY m.timestamp DESC
       LIMIT 1`,
      [phone, config.instance, afterTimestamp.toISOString()],
    );

    if (result.rows.length > 0) {
      return result.rows[0].text;
    }

    await sleep(pollInterval);
  }

  return null;
}

/** Limpa múltiplos telefones de teste de uma vez */
export async function cleanupAll(phones: string[]): Promise<void> {
  for (const phone of phones) {
    await cleanupPhone(phone);
  }
}

// ─── Assinatura, cancelamento e colaboradores ────────────────────────────────

/**
 * Marca assinatura como expirada e desconecta TODAS as sessões do usuário.
 * Replica o efeito final de subscriptionService.checkExpirations() (cron):
 * status 'expired' + expiração no passado + sessões desconectadas.
 */
export async function setSubscriptionExpired(phone: string): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE users SET subscription_status = 'expired',
     subscription_expires_at = NOW() - INTERVAL '1 day'
     WHERE phone = $1`,
    [phone],
  );
  await db.query(
    `UPDATE whatsapp_sessions SET status = 'disconnected', disconnected_at = NOW()
     WHERE user_id IN (SELECT id FROM users WHERE phone = $1)
       AND status = 'active'`,
    [phone],
  );
}

/** Ajusta a expiração da assinatura para uma data futura específica (em dias) */
export async function setSubscriptionExpiresInDays(phone: string, days: number): Promise<void> {
  const db = getPool();
  await db.query(
    `UPDATE users SET subscription_expires_at = NOW() + ($2 || ' days')::INTERVAL
     WHERE phone = $1`,
    [phone, String(days)],
  );
}

/**
 * Simula renovação antecipada aplicando a MESMA regra de
 * SubscriptionService.activate: se a assinatura ainda está ativa,
 * estende a partir da expiração atual; senão, a partir de agora.
 *
 * LIMITAÇÃO: o caminho completo (webhook HMAC do MercadoPago → activate)
 * depende do gateway real e não é simulável offline. Este cenário valida
 * o contrato da regra de renovação (não penalizar quem paga adiantado)
 * e a integridade dos dados após renovar.
 */
export async function renewSubscriptionSimulated(
  phone: string,
  billingPeriod: 'monthly' | 'yearly' = 'monthly',
): Promise<{ previousExpiry: Date | null; newExpiry: Date | null }> {
  const db = getPool();

  const before = await db.query(
    `SELECT subscription_expires_at FROM users WHERE phone = $1`,
    [phone],
  );
  const previousExpiry: Date | null = before.rows[0]?.subscription_expires_at ?? null;
  const days = billingPeriod === 'monthly' ? 30 : 365;

  await db.query(
    `UPDATE users SET
       subscription_status = 'active',
       subscription_started_at = NOW(),
       billing_period = $3,
       subscription_expires_at = CASE
         WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > NOW()
           THEN subscription_expires_at + ($2 || ' days')::INTERVAL
         ELSE NOW() + ($2 || ' days')::INTERVAL
       END
     WHERE phone = $1`,
    [phone, String(days), billingPeriod],
  );

  const after = await db.query(
    `SELECT subscription_expires_at FROM users WHERE phone = $1`,
    [phone],
  );
  return { previousExpiry, newExpiry: after.rows[0]?.subscription_expires_at ?? null };
}

/** Chama o endpoint real de cancelamento do backend */
export async function requestCancellationHttp(
  userId: string,
  phone: string,
  reason = 'teste e2e',
): Promise<{ httpStatus: number; body: any }> {
  try {
    const response = await axios.post(
      `${config.baseUrl}/api/cancellation/request`,
      { userId, phone, reason },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 },
    );
    return { httpStatus: response.status, body: response.data };
  } catch (err: any) {
    return { httpStatus: err.response?.status ?? 0, body: err.response?.data ?? { error: err.message } };
  }
}

/** Consulta registro de cancelamento do usuário no banco */
export async function getCancellationRecord(userId: string): Promise<{
  cancelledAt: Date;
  accessUntil: Date;
  refundEligible: boolean;
  reactivatedAt: Date | null;
} | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT cancelled_at, access_until, refund_eligible, reactivated_at
     FROM cancellations WHERE user_id = $1
     ORDER BY cancelled_at DESC LIMIT 1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    cancelledAt: new Date(row.cancelled_at),
    accessUntil: new Date(row.access_until),
    refundEligible: row.refund_eligible,
    reactivatedAt: row.reactivated_at ? new Date(row.reactivated_at) : null,
  };
}

/** Consulta dados básicos do usuário (para checks de cancelamento/assinatura) */
export async function getUserSnapshot(phone: string): Promise<{
  subscriptionStatus: string;
  subscriptionStartedAt: Date | null;
  subscriptionExpiresAt: Date | null;
  plan: string | null;
  hasBusiness: boolean;
} | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT u.subscription_status, u.subscription_started_at, u.subscription_expires_at, u.plan,
            EXISTS (SELECT 1 FROM businesses b WHERE b.user_id = u.id) AS has_business
     FROM users u WHERE u.phone = $1`,
    [phone],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    subscriptionStatus: row.subscription_status,
    subscriptionStartedAt: row.subscription_started_at ? new Date(row.subscription_started_at) : null,
    subscriptionExpiresAt: row.subscription_expires_at ? new Date(row.subscription_expires_at) : null,
    plan: row.plan,
    hasBusiness: row.has_business,
  };
}

/** Status das sessões WhatsApp de um usuário */
export async function getSessionsStatus(userId: string): Promise<Array<{ instance: string; status: string }>> {
  const db = getPool();
  const result = await db.query(
    `SELECT instance_name AS instance, status FROM whatsapp_sessions WHERE user_id = $1`,
    [userId],
  );
  return result.rows;
}

/**
 * Cria um colaborador (user vinculado a um owner via owner_user_id)
 * com sessão WhatsApp ativa — para cenários de disconnect de colaborador.
 */
export async function createCollaborator(
  ownerUserId: string,
  phone: string,
  name: string,
  instance: string,
): Promise<string> {
  const db = getPool();
  const userResult = await db.query(
    `INSERT INTO users (phone, name, owner_user_id, subscription_status, created_at)
     VALUES ($1, $2, $3, 'active', NOW())
     RETURNING id`,
    [phone, name, ownerUserId],
  );
  const collaboratorId: string = userResult.rows[0].id;
  await createWhatsappSession(collaboratorId, instance);
  return collaboratorId;
}

/** Status de todas as sessões de um usuário (id de colaborador, por exemplo) */
export async function getSessionStatusByUserId(userId: string): Promise<string | null> {
  const db = getPool();
  const result = await db.query(
    `SELECT status FROM whatsapp_sessions WHERE user_id = $1 ORDER BY connected_at DESC LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.status ?? null;
}

// ─── Utilitários internos ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
