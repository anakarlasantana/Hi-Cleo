/**
 * Sinais de baixa informação e pedidos de opt-out vindos do CLIENTE final.
 *
 * Por que existe (dois buracos reais encontrados na validação do beta):
 *
 * 1. **Figurinha e emoji solto** — o webhook só reconhecia texto, imagem, áudio,
 *    vídeo e documento. `stickerMessage` caía no `return { text: '', media: null }`
 *    e o webhook descartava com `if (!text && !media) return;`: o cliente ficava
 *    em **silêncio absoluto**, a mensagem não era salva e, se fosse a primeira,
 *    o lead nem existia (o dono nunca sabia daquela pessoa).
 * 2. **Opt-out** — o único opt-out era o da prospecção pós-trial. Um cliente
 *    dizendo "para de me mandar mensagem" não tinha registro nenhum.
 *
 * As funções são puras para poderem ser testadas sem banco nem WhatsApp.
 */

/** Marcador de figurinha (mesmo padrão de `[áudio]`/`[imagem]`). */
export const STICKER_MARKER = '[figurinha]';

/** A mensagem é uma figurinha? */
export function isStickerMessage(text: string): boolean {
  return (text || '').trim() === STICKER_MARKER;
}

/**
 * Texto sem nenhuma letra ou número — só emoji, pontuação ou símbolo.
 *
 * Usa `\p{L}`/`\p{N}` (Unicode) para não classificar "não" como baixa informação
 * por causa do acento.
 */
export function isEmojiOnlyMessage(text: string): boolean {
  const clean = (text || '').trim();
  if (!clean) return false;
  return !/[\p{L}\p{N}]/u.test(clean);
}

/**
 * Mensagem que a IA não tem como interpretar e não deve consumir chamada de IA.
 * Inclui figurinha e emoji/pontuação soltos.
 */
export function isLowInformationMessage(text: string): boolean {
  return isStickerMessage(text) || isEmojiOnlyMessage(text);
}

/**
 * Pedido de opt-out (o cliente não quer mais receber mensagens).
 *
 * **Alta precisão** de propósito: no atendimento ao cliente um falso positivo
 * cala um cliente pagante. Por isso nenhum padrão reage a "para"/"não" isolados
 * — "quanto *para* fazer a escova?" e "não sei se *para* sábado" precisam passar
 * como mensagens normais.
 */
const OPT_OUT_PATTERNS: RegExp[] = [
  // "para de me mandar", "pare de enviar", "parem de mandar mensagem"
  /\b(para|pare|parem|parar)\s+de\s+(me\s+)?(mandar|enviar|mensagear|incomodar|perturbar)\b/,
  // "não quero mais receber", "não quero receber mensagens"
  /\bn[aã]o\s+quero\s+(mais\s+)?(receber|mensagens?)\b/,
  // "não me manda mais", "não me envie mais"
  /\bn[aã]o\s+me\s+(manda|mande|envie|enviar|mandar)\s+(mais|mensagens?)\b/,
  // "me tira da lista", "me remova dos contatos"
  /\b(me\s+)?(tira|tire|remove|remova|retira|retire)\s+(da|do|dos|das)?\s*(lista|contatos|cadastro)\b/,
  // "descadastra", "descadastrar meu número"
  /\bdescadastr\w*/,
  // "cancela meu cadastro"
  /\bcancel\w*\s+(o\s+)?(meu\s+)?cadastro\b/,
  // "quero ser removido", "quero sair da lista"
  /\bquero\s+(ser\s+removid[oa]|sair\s+da\s+lista)\b/,
];

/** O cliente pediu para não receber mais mensagens? */
export function wantsOptOut(text: string): boolean {
  const clean = (text || '').trim();
  if (!clean) return false;
  const normalized = clean.toLowerCase();
  return OPT_OUT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Resposta à figurinha: leve, sem chamar a IA, e convida ao texto. */
export function buildStickerReply(): string {
  return 'Recebi sua figurinha 😄 Me conta em texto como posso te ajudar?';
}

/** Resposta a emoji/pontuação soltos (não há intenção para interpretar). */
export function buildLowInformationReply(): string {
  return 'Não consegui entender 🤔 Me conta em texto como posso te ajudar?';
}

/**
 * Resposta única ao opt-out. Depois dela a Cleo para de responder
 * automaticamente; se o cliente voltar a escrever, o fluxo reativa o contato.
 */
export function buildOptOutReply(): string {
  return 'Combinado! Não vou mais te enviar mensagens. Se precisar, é só chamar aqui 🙏';
}
