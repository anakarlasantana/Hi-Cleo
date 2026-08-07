import type { AiPort } from '../../../shared/ports/ai.port.js';
import type { IntentType, RecognizedIntent } from '../../../shared/types/index.js';
import { sanitizeForAiPrompt } from '../../../shared/middleware/sanitize.js';
import { INTENT_PROMPT } from '../prompts/intent.prompts.js';

/**
 * Reconhece a intenção do dono a partir de texto (ou áudio transcrito).
 * Função pura: recebe IA + texto → retorna intent tipado.
 *
 * No LangGraph futuro, será o nó router do grafo de assistente.
 */
export async function recognizeIntent(ai: AiPort, text: string): Promise<RecognizedIntent> {
  try {
    const sanitized = sanitizeForAiPrompt(text);

    const response = await ai.generateContent([
      INTENT_PROMPT,
      `Mensagem do usuário: "${sanitized}"`,
    ]);

    const parsed = JSON.parse(response);

    return {
      type: parsed.type as IntentType,
      confidence: parsed.confidence || 0.5,
      entities: parsed.entities || {},
      originalText: text,
    };
  } catch {
    return fallbackRecognize(text);
  }
}

/**
 * Fallback por keywords quando IA falha.
 */
function fallbackRecognize(text: string): RecognizedIntent {
  const lower = text.toLowerCase();

  const patterns: Array<{ keywords: string[]; type: IntentType }> = [
    { keywords: ['leads', 'clientes', 'contatos', 'lista', 'mostra'], type: 'list_leads' },
    { keywords: ['hoje', 'novos', 'novo', 'chegou'], type: 'leads_today' },
    { keywords: ['sem resposta', 'pendente', 'devendo', 'não respondeu'], type: 'no_reply' },
    { keywords: ['quente', 'quentes', 'engajado', 'oportunidade'], type: 'hot_leads' },
    { keywords: ['agenda', 'lembrete', 'retorno', 'lembra'], type: 'schedule_followup' },
    { keywords: ['como tá', 'status', 'novidade', 'e o'], type: 'lead_status' },
    { keywords: ['manda', 'envia', 'material', 'orçamento', 'catálogo'], type: 'send_material' },
    { keywords: ['configura', 'muda', 'horário', 'automática'], type: 'configure_rule' },
    { keywords: ['ignora', 'pessoal', 'não é cliente', 'exclui'], type: 'ignore_contact' },
    { keywords: ['ignorados', 'excluídos', 'quem tá ignorado'], type: 'list_ignored' },
    { keywords: ['volta a acompanhar', 'para de ignorar', 'desbloqueia'], type: 'stop_ignoring' },
    { keywords: ['convida', 'adiciona conexão', 'convite'], type: 'invite_user' },
    { keywords: ['desconecta', 'remove conexão', 'tira acesso'], type: 'disconnect_user' },
    { keywords: ['ajuda', 'help', 'o que você faz', 'comandos', 'como funciona'], type: 'help' },
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(kw => lower.includes(kw))) {
      return { type: pattern.type, confidence: 0.6, entities: {}, originalText: text };
    }
  }

  return { type: 'unknown', confidence: 0, entities: {}, originalText: text };
}
