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

function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config.databaseUrl, max: 3 });
  }
  return pool;
}

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
  await db.query(`DELETE FROM messages WHERE lead_id IN (SELECT id FROM leads WHERE user_id IN (SELECT id FROM users WHERE phone = $1))`, [phone]);
  await db.query(`DELETE FROM leads WHERE user_id IN (SELECT id FROM users WHERE phone = $1)`, [phone]);
  await db.query(`DELETE FROM businesses WHERE user_id IN (SELECT id FROM users WHERE phone = $1)`, [phone]);
  await db.query(`DELETE FROM onboarding_states WHERE user_id IN (SELECT id FROM users WHERE phone = $1)`, [phone]);
  await db.query(`DELETE FROM activation_codes WHERE user_id IN (SELECT id FROM users WHERE phone = $1)`, [phone]);
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
