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

  // Steps de escolha numérica: se a resposta começa com dígito ("2", "2 😊",
  // "2, mas bem leve"), resolver localmente — não depende da IA, que pode
  // rejeitar por rigor excessivo ou estar indisponível.
  if ((step === 'tone_of_voice' || step === 'outside_hours_behavior') && /^[\d]/.test(message.trim())) {
    const local = fallbackInterpret(step, message);
    if (local.valid) return local;
  }

  // business_hours: o padrão de horário ("9h às 18h", "08:00-17:00") é
  // determinístico. Resolver localmente evita perder o horário quando a IA
  // responde JSON válido sem os campos (ou está indisponível), que fazia o
  // usuário repetir a resposta em loop.
  if (step === 'business_hours') {
    const local = fallbackInterpret(step, message);
    if (local.valid) return local;
  }

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

  // Comandos (/algo) e perguntas nunca são dados válidos nos steps de coleta.
  // confirm_summary é exceção para perguntas ("tá certo?" é confirmação válida).
  if (trimmed.startsWith('/') || (trimmed.includes('?') && step !== 'confirm_summary')) {
    return { valid: false, extractedData: {}, retryMessage: retry };
  }
  // Nome não pode ser frase longa
  if (step === 'confirm_name' && trimmed.length > 40) {
    return { valid: false, extractedData: {}, retryMessage: retry };
  }

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
      // Aceita "2", "2 😊", "2, mas bem leve", além de palavras-chave
      const choice = lower.match(/^(\d)/)?.[1];
      if (choice === '1' || lower.includes('formal') || lower.includes('cordial')) {
        return { valid: true, extractedData: { tom_de_voz: 'formal' } };
      }
      if (choice === '3' || lower.includes('informal') || lower.includes('amigo')) {
        return { valid: true, extractedData: { tom_de_voz: 'casual' } };
      }
      if (choice === '2' || lower.includes('descontraíd') || lower.includes('profissional')) {
        return { valid: true, extractedData: { tom_de_voz: 'friendly_professional' } };
      }
      return { valid: false, extractedData: {}, retryMessage: retry };
    }

    case 'business_hours': {
      const timePattern = /(\d{1,2})[:h]?(\d{2})?\s*(?:às|as|até|ate|a|e|-|–|—)+\s*(\d{1,2})[:h]?(\d{2})?/i;
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
      const choice = lower.match(/^(\d)/)?.[1];
      if (choice === '2' || lower.includes('não respond') || lower.includes('nao respond')) {
        return { valid: true, extractedData: { fora_horario: 'silent' } };
      }
      if (choice === '1' || lower.includes('avis') || lower.includes('retorn')) {
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
