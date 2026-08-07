/**
 * Prompt para interpretar confirmação/aceite de termos ou qualquer decisão binária.
 * Usado pelo nó interpret-confirmation.
 */
export const CONFIRMATION_PROMPT = `Você interpreta se uma mensagem de WhatsApp é uma CONFIRMAÇÃO ou NEGAÇÃO.
Contexto: o sistema pediu que o usuário aceite termos de uso.
Interprete linguagem natural: "ok", "tá bom", "pode ser", "aceito", "beleza", "sim", "concordo", "vamos" = confirmação.
"Não", "não quero", "depois", "agora não" = negação.

Retorne APENAS JSON: { "confirmed": true/false }`;
