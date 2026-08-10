import type { AiPort } from '../../../shared/ports/ai.port.js';
import type { InterpretedResponse } from '../state.js';
import { ONBOARDING_PROMPTS, ONBOARDING_RETRY_MESSAGES } from '../prompts/onboarding.prompts.js';
import { sanitizeForAiPrompt } from '../../../shared/middleware/sanitize.js';

/**
 * Interpreta a resposta do usuário usando IA para um step do onboarding.
 * Função pura: recebe dependências + dados → retorna resultado tipado.
 *
 * No LangGraph futuro, esta função será o corpo de cada nó do grafo de onboarding.
 */
export async function interpretOnboardingResponse(
  ai: AiPort,
  step: string,
  message: string,
  context: Record<string, string>,
): Promise<InterpretedResponse> {
  const prompt = ONBOARDING_PROMPTS[step];
  if (!prompt) return { valid: true, extractedData: {} };

  try {
    const sanitized = sanitizeForAiPrompt(message);
    const contextStr = Object.keys(context).length > 0
      ? `\nContexto já coletado: ${JSON.stringify(context)}`
      : '';

    const response = await ai.generateContent([
      `${prompt}${contextStr}`,
      `Resposta do usuário: "${sanitized}"`,
    ]);

    // Limpar markdown backticks que o modelo pode adicionar
    const cleaned = response.replace(/```(?:json)?\s*/g, '').trim();
    return JSON.parse(cleaned) as InterpretedResponse;
  } catch {
    return fallbackInterpret(step, message);
  }
}

/**
 * Fallback local quando IA falha — preserva funcionalidade mínima.
 * Mesma lógica de parse que existia antes (regex/string matching).
 */
function fallbackInterpret(step: string, message: string): InterpretedResponse {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  const retry = ONBOARDING_RETRY_MESSAGES[step];

  switch (step) {
    case 'confirm_name':
      if (trimmed.length < 2) return { valid: false, extractedData: {}, retryMessage: retry };
      return { valid: true, extractedData: { nome_confirmado: trimmed } };

    case 'business_type':
      if (trimmed.length < 3) return { valid: false, extractedData: {}, retryMessage: retry };
      return { valid: true, extractedData: { negocio: trimmed } };

    case 'target_audience':
      if (trimmed.length < 3) return { valid: false, extractedData: {}, retryMessage: retry };
      return { valid: true, extractedData: { publico_alvo: trimmed } };

    case 'tone_of_voice': {
      if (lower === '1' || lower.includes('formal') || lower.includes('cordial')) {
        return { valid: true, extractedData: { tom_de_voz: 'formal' } };
      }
      if (lower === '3' || lower.includes('informal') || lower.includes('amigo')) {
        return { valid: true, extractedData: { tom_de_voz: 'casual' } };
      }
      if (lower === '2' || lower.includes('descontraíd') || lower.includes('profissional')) {
        return { valid: true, extractedData: { tom_de_voz: 'friendly_professional' } };
      }
      return { valid: false, extractedData: {}, retryMessage: retry };
    }

    case 'business_hours': {
      const timePattern = /(\d{1,2})[:h]?(\d{2})?\s*[-aàáeé]+\s*(\d{1,2})[:h]?(\d{2})?/i;
      const match = trimmed.match(timePattern);
      if (match) {
        return {
          valid: true,
          extractedData: {
            horario_inicio: `${match[1].padStart(2, '0')}:${match[2] || '00'}`,
            horario_fim: `${match[3].padStart(2, '0')}:${match[4] || '00'}`,
            horario_descricao: trimmed,
          },
        };
      }
      return { valid: false, extractedData: {}, retryMessage: retry };
    }

    case 'outside_hours_behavior': {
      if (lower === '2' || lower.includes('não respond') || lower.includes('nao respond')) {
        return { valid: true, extractedData: { fora_horario: 'silent' } };
      }
      if (lower === '1' || lower.includes('avis') || lower.includes('retorn')) {
        return { valid: true, extractedData: { fora_horario: 'notify' } };
      }
      if (trimmed.length > 10) {
        return { valid: true, extractedData: { fora_horario: 'notify', fora_horario_mensagem: trimmed } };
      }
      return { valid: false, extractedData: {}, retryMessage: retry };
    }

    case 'confirm_summary': {
      const confirms = ['ok', 'sim', 'confirma', 'perfeito', 'tá certo', 'bom', 'isso', 'pode ser', 'bora'];
      const isConfirm = confirms.some(w => lower.includes(w));
      return { valid: true, extractedData: { confirmed: isConfirm ? 'true' : 'false' } };
    }

    default:
      return { valid: true, extractedData: {} };
  }
}
