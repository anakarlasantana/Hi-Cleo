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

/** Todos os cenários de teste suportados */
export type Scenario =
  | 'onboarding'
  | 'client_message'
  | 'owner_command'
  | 'edge_case'
  | 'trial_flow'
  | 'payment_webhook'
  | 'invite_flow'
  | 'prospection_response'
  | 'material_flow'
  | 'local_classifier'
  | 'configure_rules'
  | 'degraded_fallback';

/** Tipo de avaliação para cada cenário */
export type EvaluationType = 'llm_judge' | 'deterministic' | 'hybrid';

/** Metadata de um cenário de teste */
export interface ScenarioMeta {
  /** Identificador do cenário */
  name: Scenario;
  /** Descrição legível */
  description: string;
  /** Se precisa de setup especial antes de executar (ex: criar user, expirar trial) */
  requiresSpecialSetup: boolean;
  /** Tipo de avaliação usado para pontuar */
  evaluationType: EvaluationType;
}

/** Lista de cenários com metadata */
export const scenarios: ScenarioMeta[] = [
  {
    name: 'onboarding',
    description: 'Fluxo completo de onboarding — do código de ativação até configurar o negócio',
    requiresSpecialSetup: false,
    evaluationType: 'llm_judge',
  },
  {
    name: 'client_message',
    description: 'Cliente envia mensagem para dono e Cleo responde como secretária',
    requiresSpecialSetup: true,
    evaluationType: 'llm_judge',
  },
  {
    name: 'owner_command',
    description: 'Dono envia comando direto (ex: /agenda, /pausa, /status)',
    requiresSpecialSetup: true,
    evaluationType: 'hybrid',
  },
  {
    name: 'edge_case',
    description: 'Casos limítrofes — mensagens vazias, emojis, áudio sem texto, spam',
    requiresSpecialSetup: true,
    evaluationType: 'llm_judge',
  },
  {
    name: 'trial_flow',
    description: 'Criação de trial, limites de respostas e expiração',
    requiresSpecialSetup: false,
    evaluationType: 'hybrid',
  },
  {
    name: 'payment_webhook',
    description: 'Simulação de pagamento MercadoPago — webhook de aprovação e ativação de plano',
    requiresSpecialSetup: true,
    evaluationType: 'deterministic',
  },
  {
    name: 'invite_flow',
    description: 'Dono convida colaborador para acessar a secretária',
    requiresSpecialSetup: true,
    evaluationType: 'hybrid',
  },
  {
    name: 'prospection_response',
    description: 'Resposta a mensagem de prospecção — trial contactado responde',
    requiresSpecialSetup: true,
    evaluationType: 'llm_judge',
  },
  {
    name: 'material_flow',
    description: 'Dono envia material (PDF, imagem) e Cleo reencaminha para clientes',
    requiresSpecialSetup: true,
    evaluationType: 'hybrid',
  },
  {
    name: 'local_classifier',
    description: 'Classificação local — saudações simples e keywords sem chamar IA',
    requiresSpecialSetup: true,
    evaluationType: 'deterministic',
  },
  {
    name: 'configure_rules',
    description: 'Dono muda horário de atendimento, regras de resposta ou personalização',
    requiresSpecialSetup: true,
    evaluationType: 'hybrid',
  },
  {
    name: 'degraded_fallback',
    description: 'Comportamento quando a IA está indisponível — fallback gracioso',
    requiresSpecialSetup: true,
    evaluationType: 'deterministic',
  },
];

export const config = {
  /** URL base do backend */
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',

  /** Nome da instância Evolution (deve bater com MONITOR_INSTANCE) */
  instance: process.env.MONITOR_INSTANCE || 'secretary',

  /** Delay entre mensagens (ms) — tempo pro backend processar via fila + rate limiter de saída (2-5s extra) */
  messageDelay: Number(process.env.E2E_MESSAGE_DELAY) || 8000,

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
    'docs/tecnico/arquitetura-ia.md',
  ],

  /** Provider para o simulador de persona (ollama = local, grátis, sem rate limit) */
  personaProvider: (process.env.E2E_PERSONA_PROVIDER || 'ollama') as 'ollama' | 'deepseek' | 'groq' | 'gemini',

  /** Provider para o judge/evaluator (ollama = local, grátis, sem rate limit) */
  judgeProvider: (process.env.E2E_JUDGE_PROVIDER || 'ollama') as 'ollama' | 'deepseek' | 'groq' | 'gemini',

  /** Provider legado — usado quando persona e judge compartilham o mesmo provider */
  aiProvider: (process.env.E2E_AI_PROVIDER || 'ollama') as 'ollama' | 'deepseek' | 'groq' | 'gemini',

  /** Ollama — configuração do modelo local */
  ollama: {
    baseUrl: process.env.E2E_OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.E2E_OLLAMA_MODEL || 'qwen3:8b',
    /** Temperatura mais alta para personas (mais variação) */
    personaTemperature: Number(process.env.E2E_OLLAMA_PERSONA_TEMP) || 0.7,
    /** Temperatura mais baixa para o judge (mais consistente) */
    judgeTemperature: Number(process.env.E2E_OLLAMA_JUDGE_TEMP) || 0.3,
    /** Máximo de tokens para respostas de persona (msgs WhatsApp são curtas) */
    personaMaxTokens: Number(process.env.E2E_OLLAMA_PERSONA_MAX_TOKENS) || 150,
    /** Máximo de tokens para respostas do judge (avaliação pode ser mais longa) */
    judgeMaxTokens: Number(process.env.E2E_OLLAMA_JUDGE_MAX_TOKENS) || 600,
    /** Timeout em ms (qwen3:8b gera ~1.5 tok/s, precisa de margem generosa) */
    timeout: Number(process.env.E2E_OLLAMA_TIMEOUT) || 300_000,
  },

  /** Conexão com o banco (para ler respostas da Cleo) */
  databaseUrl: process.env.DATABASE_URL || 'postgresql://hicleo:hicleo123@localhost:5434/hicleo',
};
