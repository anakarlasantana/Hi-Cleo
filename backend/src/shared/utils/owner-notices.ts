/**
 * Avisos ao dono e regras de mensagem proativa.
 *
 * Por que existe: o produto promete ao dono “nunca deixar passar um cliente”
 * (`docs/produto/personalidade-cleo.md`) e “fazer ele sentir que a Cleo trabalha”
 * — mas o backend não avisava o dono quando um cliente NOVO chegava, e não havia
 * caminho para o cliente pedir atendimento humano. Os construtores de texto são
 * puros para poderem ser testados sem banco nem WhatsApp.
 */

/** Máximo de caracteres da 1ª mensagem do cliente no aviso (evita textão). */
const PREVIEW_MAX = 120;

/** “Quero falar com uma pessoa/atendente/humano” — pedido explícito de handoff. */
const HUMAN_REQUEST = new RegExp(
  [
    // “quero falar com uma pessoa/atendente/responsável”
    '\\b(falar|conversar|atendid[oa])\\s+(com\\s+)?((uma?|o|a)\\s+)?(pessoa|humano|atendente|respons[aá]vel|dono|dona|propriet[aá]ri[oa])\\b',
    // “quero um humano”, “quero atendente”
    '\\bquero\\s+((um|uma)\\s+)?(humano|atendente|pessoa\\s+de\\s+verdade)\\b',
    // “me passa para um atendente”, “me passar pra pessoa”
    '\\bme\\s+passa(r)?\\s+(para|pra|pro)\\s+((uma?|o|a)\\s+)?(humano|atendente|respons[aá]vel|pessoa)\\b',
    // “preciso falar com alguém/alguém do negócio”
    '\\bpreciso\\s+(falar|conversar)\\s+com\\s+(algu[eé]m|uma\\s+pessoa|o\\s+respons[aá]vel)\\b',
    // “atendimento humano”, “suporte de verdade”
    '\\b(atendimento|suporte)\\s+(humano|real|de\\s+verdade)\\b',
  ].join('|'),
  'i',
);

/** O cliente pediu explicitamente para falar com uma pessoa do negócio? */
export function wantsHuman(message: string): boolean {
  if (!message) return false;
  return HUMAN_REQUEST.test(message);
}

function firstName(name?: string): string {
  const clean = (name || '').trim();
  if (!clean) return '';
  return clean.split(/\s+/)[0];
}

function shorten(text: string, max = PREVIEW_MAX): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

/**
 * Aviso de cliente NOVO para o dono.
 *
 * É a “prova de valor” mais imediata: o dono fica sabendo em segundos que a Cleo
 * atendeu alguém — e pode assumir a conversa se quiser.
 */
export function buildNewLeadNotice(input: {
  clientName?: string;
  phone: string;
  message?: string;
}): string {
  const name = firstName(input.clientName);
  const who = name ? `*${name}*` : `*${input.phone}*`;
  const preview = shorten(input.message || '');

  const lines = [
    '🆕 *Novo cliente no WhatsApp!*',
    '',
    `👤 ${who}`,
    `📱 ${input.phone}`,
  ];

  if (preview) lines.push(`💬 "${preview}"`);

  lines.push('', 'Já estou atendendo. Se quiser assumir, é só responder por aqui.');
  return lines.join('\n');
}

/** Resposta ao cliente quando ele pede atendimento humano. */
export function buildHandoffReply(ownerName?: string): string {
  const owner = firstName(ownerName) || 'a pessoa responsável';
  return `Claro! Já avisei ${owner} que você quer falar com uma pessoa. Ele(a) te responde por aqui assim que puder 🙏`;
}

/** Aviso ao dono de que um cliente pediu atendimento humano. */
export function buildHandoffNotice(input: { clientName?: string; phone: string; message?: string }): string {
  const name = firstName(input.clientName);
  const who = name ? `*${name}*` : `*${input.phone}*`;
  const preview = shorten(input.message || '');

  return [
    '🙋 *Cliente pedindo atendimento humano*',
    '',
    `👤 ${who}`,
    `📱 ${input.phone}`,
    preview ? `💬 "${preview}"` : '',
    '',
    'Responda por aqui para assumir a conversa.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Aviso ao dono de que o cliente pediu para não receber mais mensagens. */
export function buildOptOutNotice(input: { clientName?: string; phone: string; message?: string }): string {
  const name = firstName(input.clientName);
  const who = name ? `*${name}*` : `*${input.phone}*`;
  const preview = shorten(input.message || '');

  return [
    '🚫 *Cliente pediu para não receber mensagens*',
    '',
    `👤 ${who}`,
    `📱 ${input.phone}`,
    preview ? `💬 "${preview}"` : '',
    '',
    'Parei de responder automaticamente para ele. Se precisar falar, faça manualmente.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Janela de atendimento do WhatsApp: 24h desde a última mensagem do usuário. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * A mensagem proativa ainda está dentro da janela de 24h?
 *
 * Fora da janela, a API oficial só aceita **template aprovado** — texto livre é
 * rejeitado e, em número não oficial (Evolution), é o padrão que mais derruba
 * conta. Usado para avisar (ou bloquear) envios proativos.
 */
export function withinServiceWindow(
  lastInboundAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  const timestamp = lastInboundAt instanceof Date ? lastInboundAt.getTime() : new Date(lastInboundAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  const elapsed = now.getTime() - timestamp;
  return elapsed >= 0 && elapsed < SERVICE_WINDOW_MS;
}
