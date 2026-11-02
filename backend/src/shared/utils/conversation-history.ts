import type { Message } from '../types/index.js';

export interface ConversationHistoryOptions {
  /** Rótulo de quem enviou as mensagens inbound (default: "Cliente"). */
  inboundLabel?: string;
  /** Limite de caracteres por mensagem (economia de tokens). */
  maxCharsPerMessage?: number;
}

/**
 * Formata mensagens do banco em texto compacto para injeção no prompt.
 * Retorna undefined se não houver histórico relevante.
 *
 * Formato:
 *   Cliente: "mensagem..."
 *   Cleo: "resposta..."
 *
 * As mensagens chegam em ordem DESC (mais recente primeiro) do banco,
 * então invertemos para ordem cronológica antes de formatar.
 *
 * Usado no atendimento ao cliente (`generate-client-reply`) e nos replies
 * conversacionais do dono (`assistente.service`) — sem histórico a Cleo repete
 * a mesma piada/oferta a cada mensagem.
 */
export function formatConversationHistory(
  messages: Message[],
  options: ConversationHistoryOptions = {},
): string | undefined {
  if (!messages || messages.length === 0) return undefined;

  const { inboundLabel = 'Cliente', maxCharsPerMessage = 100 } = options;

  // Inverter para ordem cronológica (banco retorna DESC)
  const chronological = [...messages].reverse();

  const lines = chronological.map((msg) => {
    const sender = msg.direction === 'inbound' ? inboundLabel : 'Cleo';
    const text = msg.text.length > maxCharsPerMessage
      ? msg.text.slice(0, maxCharsPerMessage) + '...'
      : msg.text;
    return `${sender}: "${text}"`;
  });

  return lines.join('\n');
}

/**
 * Detecta se a nova resposta repete uma FRASE inteira da resposta anterior da
 * Cleo (não só a resposta idêntica).
 *
 * Por que existe: no E2E o guard de repetição comparava a resposta inteira, então
 * a Cleo repetia “Vou anotar seu interesse e o dono entra em contato em breve”
 * na resposta seguinte com outro começo — o guard não pegava e o cliente lia a
 * mesma frase a cada mensagem.
 */
export function repeatsSentence(
  next: string,
  previous?: string,
  minLength = 40,
): boolean {
  if (!next || !previous) return false;

  const normalize = (text: string) => text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizedNext = normalize(next);
  const fragments = previous
    .split(/[.!?\n]+/)
    .map(normalize)
    .filter((fragment) => fragment.length >= minLength);

  return fragments.some((fragment) => normalizedNext.includes(fragment));
}

/** Normalização para comparar respostas: ignora caixa, espaços, pontuação e emojis. */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{So}\p{Sk}]/gu, '');
}
