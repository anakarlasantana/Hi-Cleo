import type { BusinessContext } from '../nodes/generate-client-reply.js';

/**
 * Prompt compacto para respostas aos clientes.
 *
 * Design para otimização de tokens:
 * - Prefixo FIXO por dono (parte estática → caching automático dos providers)
 * - Personalidade via contexto emocional (não via regras explícitas)
 * - ~100-120 tokens no system prompt (vs ~400 na versão anterior)
 *
 * O caching funciona assim:
 * - Groq: 50% desconto em tokens com prefixo idêntico entre chamadas
 * - Gemini 2.0+: até 90% desconto (implicit caching)
 * - Como o system prompt é idêntico para todos os clientes do MESMO dono,
 *   todas as chamadas de um dono aproveitam o cache.
 */

const TONE_PERSONALITY: Record<string, string> = {
  formal: 'educada e respeitosa, sem emojis, linguagem formal (Sr./Sra.)',
  friendly_professional: 'simpática e acolhedora, emojis com moderação, como quem já conhece a pessoa',
  casual: 'próxima e descontraída, usa emojis e gírias, como uma amiga',
};

export function CLIENT_REPLY_PROMPT(business: BusinessContext, isOutsideHours: boolean): string {
  const tone = TONE_PERSONALITY[business.toneOfVoice] || TONE_PERSONALITY.friendly_professional;
  const outsideFlag = isOutsideHours ? ' FORA DO HORÁRIO — informe que retorna.' : '';

  // Prompt compacto com personalidade (não com regras técnicas)
  return `Você é secretária do(a) ${business.ownerName}, que trabalha com ${business.businessDescription}. Atende ${business.targetAudience}. Horário: ${business.businessHoursStart}-${business.businessHoursEnd}.${outsideFlag}
Seja ${tone}. Máx 3 linhas. Não invente dados — anote interesse e diga que ${business.ownerName} retorna. Só texto, sem JSON.`;
}
