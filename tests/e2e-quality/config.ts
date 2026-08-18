/**
 * Configuração do teste E2E de qualidade.
 * Lê variáveis de ambiente com fallbacks sensatos para dev local.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

// Carrega .env da raiz do projeto (sem depender do pacote dotenv)
const root = resolve(__dirname, '../..');
try {
  const envContent = readFileSync(resolve(root, '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch { /* .env não encontrado — usa env vars do sistema */ }

export const config = {
  /** URL base do backend */
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',

  /** Nome da instância Evolution (deve bater com MONITOR_INSTANCE) */
  instance: process.env.MONITOR_INSTANCE || 'secretary',

  /** Delay entre mensagens (ms) — tempo pro backend processar via fila */
  messageDelay: Number(process.env.E2E_MESSAGE_DELAY) || 5000,

  /** Número de conversas autônomas a gerar */
  conversationCount: Number(process.env.E2E_CONVERSATION_COUNT) || 5,

  /** Máximo de turnos por conversa (evita loops infinitos) */
  maxTurnsPerConversation: Number(process.env.E2E_MAX_TURNS) || 12,

  /** Threshold mínimo para passar (0.0 a 1.0) */
  passThreshold: Number(process.env.E2E_PASS_THRESHOLD) || 0.7,

  /** Docs que a IA lê para entender o produto */
  docsPath: [
    'docs/produto/regras-de-negocio.md',
    'docs/produto/personalidade-cleo.md',
    'docs/produto/visao-geral.md',
  ],

  /** Provider para o teste (deepseek | groq | gemini) */
  aiProvider: (process.env.E2E_AI_PROVIDER || 'deepseek') as 'deepseek' | 'groq' | 'gemini',

  /** Conexão com o banco (para ler respostas da Cleo) */
  databaseUrl: process.env.DATABASE_URL || 'postgresql://hicleo:hicleo123@localhost:5434/hicleo',
};
