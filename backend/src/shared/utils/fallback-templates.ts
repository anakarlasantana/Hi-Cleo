/**
 * Templates de resposta para modo degradado (quando IA está indisponível).
 * Usados como último recurso — garantem que a Cleo nunca fica completamente muda.
 */

export interface FallbackContext {
  ownerName?: string;
  toneOfVoice?: 'formal' | 'friendly_professional' | 'casual';
  isOutsideHours?: boolean;
}

export function getDegradedReplyForClient(ctx: FallbackContext): string {
  const owner = ctx.ownerName || 'o responsável';
  const isOutside = ctx.isOutsideHours ?? false;

  if (isOutside) {
    switch (ctx.toneOfVoice) {
      case 'formal':
        return `Prezado(a), estamos fora do horário de atendimento. ${owner} retornará no próximo horário disponível.`;
      case 'casual':
        return `Eii! Tô fora do horário agora 😴 Mas relaxa, anotei e te retornamos amanhã!`;
      default:
        return `Olá! Estamos fora do horário agora, mas anotei sua mensagem. ${owner} retorna em breve! 📝`;
    }
  }

  switch (ctx.toneOfVoice) {
    case 'formal':
      return `Boa tarde. Sua mensagem foi recebida e ${owner} retornará em breve.`;
    case 'casual':
      return `E aí! 👋 Recebi sua msg! O(a) ${owner} te responde logo!`;
    default:
      return `Olá! 😊 Recebi sua mensagem. ${owner} vai te retornar em breve!`;
  }
}

export function getDegradedReplyForOwner(): string {
  return '⚠️ Estou com dificuldade pra processar agora. Seus clientes estão recebendo respostas automáticas básicas. Tente novamente em alguns minutos.';
}
