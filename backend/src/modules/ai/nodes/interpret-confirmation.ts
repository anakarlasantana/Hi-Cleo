import type { AiPort } from '../../../shared/ports/ai.port.js';
import { sanitizeForAiPrompt } from '../../../shared/middleware/sanitize.js';
import { CONFIRMATION_PROMPT } from '../prompts/terms.prompts.js';

/**
 * Interpreta se uma mensagem é confirmação ou negação.
 * Usado para aceite de termos e qualquer fluxo de sim/não.
 *
 * No LangGraph futuro, será um nó genérico de decisão binária.
 */
export async function interpretConfirmation(
  ai: AiPort,
  message: string,
): Promise<boolean> {
  try {
    const sanitized = sanitizeForAiPrompt(message);
    const response = await ai.generateContent([
      CONFIRMATION_PROMPT,
      `Mensagem: "${sanitized}"`,
    ]);
    const parsed = JSON.parse(response);
    return parsed.confirmed === true;
  } catch {
    // Fallback: lista de palavras conhecidas
    const lower = message.trim().toLowerCase();
    const confirms = ['ok', 'sim', 'aceito', 'aceitar', 'concordo', 'pode', 'beleza', 'bora', 'tá bom', 'ta bom', 'vamos'];
    return confirms.some(w => lower.includes(w));
  }
}
