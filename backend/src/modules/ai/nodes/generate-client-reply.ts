import type { AiPort } from '../../../shared/ports/ai.port.js';
import type { Message } from '../../../shared/types/index.js';
import { sanitizeForAiPrompt, stripThinkingTags } from '../../../shared/middleware/sanitize.js';
import { formatConversationHistory, normalizeForCompare, repeatsSentence } from '../../../shared/utils/conversation-history.js';
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
 * Inclui histórico de conversa recente para manter contexto multi-turno.
 *
 * No LangGraph futuro, será o nó principal do grafo de atendimento ao cliente.
 */
export async function generateClientReply(
  ai: AiPort,
  business: BusinessContext,
  clientMessage: string,
  clientName: string | undefined,
  isOutsideHours: boolean,
  recentMessages?: Message[],
): Promise<string> {
  try {
    const sanitized = sanitizeForAiPrompt(clientMessage);
    const conversationHistory = formatConversationHistory(recentMessages || [], { inboundLabel: clientName });
    const prompt = CLIENT_REPLY_PROMPT(business, isOutsideHours, conversationHistory);

    const response = await ai.generateContent([
      prompt,
      `Mensagem do cliente${clientName ? ` (${clientName})` : ''}: "${sanitized}"`,
    ]);

    // Nunca vazar raciocínio interno (<think>) para o cliente final — mesmo se
    // o modelo estourar max_tokens e deixar a tag aberta
    const cleaned = stripThinkingTags(response);
    if (!cleaned) return buildFallbackReply(business, isOutsideHours);

    // Anti-repetição: se a resposta for idêntica à última da Cleo (loop robótico),
    // regenerar UMA vez pedindo variação explícita. Se repetir de novo, desiste —
    // melhor repetir uma vez do que não responder.
    const lastCleoReply = recentMessages?.find((m) => m.direction === 'outbound')?.text;
    // Resposta idêntica OU a mesma frase-chave repetida (o guard antigo só pegava
    // idêntica; a Cleo repetia a mesma despedida com outro começo).
    const repeated = !!lastCleoReply
      && (normalizeForCompare(cleaned) === normalizeForCompare(lastCleoReply)
        || repeatsSentence(cleaned, lastCleoReply));

    if (lastCleoReply && repeated) {
      try {
        const retry = await ai.generateContent([
          prompt,
          `Mensagem do cliente${clientName ? ` (${clientName})` : ''}: "${sanitized}"\n\nIMPORTANTE: você já respondeu exatamente isso antes: "${cleaned}". NÃO repita. Varie a redação e adicione algo útil (ex: reforçar que vai avisar ${business.ownerName} assim que possível).`,
        ]);
        const retryCleaned = stripThinkingTags(retry);
        if (retryCleaned && normalizeForCompare(retryCleaned) !== normalizeForCompare(lastCleoReply)) {
          return retryCleaned;
        }
      } catch {
        // falhou a regeneração — devolve a resposta original
      }
    }

    return cleaned;
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
        return `Prezado(a), ${ownerName} não está disponível no momento. Retornaremos no próximo dia útil.`;
      case 'casual':
        return `Eii! ${ownerName} já foi descansar 😴 Mas relaxa, anotei e te retornamos amanhã!`;
      default:
        return `Olá! ${ownerName} não está disponível agora, mas anotei sua mensagem e retornamos em breve 📝`;
    }
  }

  switch (toneOfVoice) {
    case 'formal':
      return `Boa tarde! Sou a assistente de ${ownerName}. Sua mensagem foi registrada e retornaremos em breve.`;
    case 'casual':
      return `E aí! 👋 Sou a assistente de ${ownerName}. Já anotei e a gente te responde logo!`;
    default:
      return `Olá! 😊 Sou a assistente de ${ownerName}. Já anotei seu contato e vamos te retornar em breve!`;
  }
}
