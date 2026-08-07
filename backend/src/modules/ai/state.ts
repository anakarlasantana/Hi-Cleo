/**
 * Resultado padronizado de um nó de interpretação.
 * Cada nó retorna isso — no LangGraph, será o output parcial do estado.
 */
export interface InterpretedResponse {
  valid: boolean;
  extractedData: Record<string, string>;
  retryMessage?: string;
}

/**
 * Estado conversacional compartilhado entre nós.
 * No futuro, será o Annotation/State do LangGraph.
 */
export interface ConversationState {
  userId: string;
  step: string;
  data: Record<string, string>;
  lastMessage: string;
}
