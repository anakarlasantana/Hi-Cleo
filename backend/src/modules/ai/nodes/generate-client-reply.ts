import type { AiPort } from '../../../shared/ports/ai.port.js';
import { sanitizeForAiPrompt } from '../../../shared/middleware/sanitize.js';
import { CLIENT_REPLY_PROMPT } from '../prompts/client-reply.prompts.js';

/**
 * Contexto do negócio do dono (coletado no onboarding).
 */
export interface BusinessContext {
  ownerName: string;
  businessDescription: string;
  targetAudience: string;
  toneOfVoice: 'formal' | 'friendly_professional' | 'casual';
  businessHoursStart: string;
  businessHoursEnd: string;
}

/**
 * Gera resposta contextual para um cliente do dono.
 * Usa os dados do onboarding para responder de forma natural e adaptada ao negócio.
 *
 * No LangGraph futuro, será o nó principal do grafo de atendimento ao cliente.
 */
export async function generateClientReply(
  ai: AiPort,
  business: BusinessContext,
  clientMessage: string,
  clientName: string | undefined,
  isOutsideHours: boolean,
): Promise<string> {
  try {
    const sanitized = sanitizeForAiPrompt(clientMessage);
    const prompt = CLIENT_REPLY_PROMPT(business, isOutsideHours);

    const response = await ai.generateContent([
      prompt,
      `Mensagem do cliente${clientName ? ` (${clientName})` : ''}: "${sanitized}"`,
    ]);

    return response.trim();
  } catch {
    // Fallback: resposta genérica segura
    return buildFallbackReply(business, isOutsideHours);
  }
}

function buildFallbackReply(business: BusinessContext, isOutsideHours: boolean): string {
  const { ownerName, toneOfVoice } = business;

  if (isOutsideHours) {
    switch (toneOfVoice) {
      case 'formal':
        return `Prezado(a), o(a) ${ownerName} não está disponível no momento. Retornaremos no próximo dia útil.`;
      case 'casual':
        return `Eii! O(a) ${ownerName} já foi descansar 😴 Mas relaxa, anotei e te retornamos amanhã!`;
      default:
        return `Olá! O(a) ${ownerName} não está disponível agora, mas anotei sua mensagem e retornamos em breve 📝`;
    }
  }

  switch (toneOfVoice) {
    case 'formal':
      return `Boa tarde! Sou assistente do(a) ${ownerName}. Sua mensagem foi registrada e retornaremos em breve.`;
    case 'casual':
      return `E aí! 👋 Tô aqui pelo(a) ${ownerName}. Já anotei e a gente te responde logo!`;
    default:
      return `Olá! 😊 Sou assistente do(a) ${ownerName}. Já anotei seu contato e vamos te retornar em breve!`;
  }
}
