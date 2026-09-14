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

    const cleaned = response.replace(/```(?:json)?\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const entities = parsed.entities || {};
    if (!entities.phone) {
      const phone = extractPhoneEntity(text);
      if (phone) entities.phone = phone;
    }

    const aiResult = {
      type: parsed.type as IntentType,
      confidence: parsed.confidence || 0.5,
      entities,
      originalText: text,
    };

    // IA insegura? Tentar o fallback por keywords antes de desistir — evita
    // "Não entendi bem" para frases que keywords resolvem (ex: "como tá meu negócio hoje?")
    if (aiResult.confidence < 0.7) {
      const keywordResult = fallbackRecognize(text);
      if (keywordResult.confidence > aiResult.confidence && keywordResult.type !== 'unknown') {
        return keywordResult;
      }
    }

    return aiResult;
  } catch {
    return fallbackRecognize(text);
  }
}

/**
 * Extrai telefone do texto livre. Aceita formatos com/sem código do país,
 * com/sem nono dígito: "5548999887766", "48 99887-766", "48999887766".
 * Retorna no formato usado em users.phone (com DDI 55).
 */
function extractPhoneEntity(text: string): string | undefined {
  const match = text.match(/\b(\d[\d\s\-().]{8,17}\d)\b/);
  if (!match) return undefined;

  const digits = match[1].replace(/\D/g, '');

  // 10–11 dígitos: número BR sem DDI → prefixar 55
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // 12–13 dígitos: já com DDI
  if (digits.length === 12 || digits.length === 13) return digits;

  return undefined;
}

/**
 * Fallback por keywords quando IA falha.
 */
function fallbackRecognize(text: string): RecognizedIntent {
  const lower = text.toLowerCase();

  const patterns: Array<{ keywords: string[]; type: IntentType }> = [
    // Intents com telefone primeiro: matching por substring é sensível a falsos
    // positivos (ex.: "remove o acesso" contém "e o" de lead_status)
    { keywords: ['convida', 'adiciona conexão', 'adiciona a conexão', 'adiciona número', 'adiciona o número', 'adicionar número', 'convite'], type: 'invite_user' },
    { keywords: ['desconecta', 'remove conexão', 'remove a conexão', 'remove acesso', 'remove o acesso', 'remove usuário', 'remove o usuário', 'remove número', 'remove o número', 'desvincula', 'cancela acesso', 'cancela o acesso', 'cancelar acesso', 'cancelar o acesso', 'cancela número', 'cancela o número', 'cancelar número', 'cancelar o número', 'apaga conexão', 'apaga a conexão', 'tira acesso'], type: 'disconnect_user' },
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
    { keywords: ['ajuda', 'help', 'o que você faz', 'comandos', 'como funciona'], type: 'help' },
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(kw => lower.includes(kw))) {
      // Intents que operam sobre um telefone (convidar/desconectar)
      // precisam da entidade extraída mesmo sem IA disponível
      const entities: Record<string, string> = {};
      if (pattern.type === 'invite_user' || pattern.type === 'disconnect_user') {
        const phone = extractPhoneEntity(text);
        if (phone) entities.phone = phone;
      }
      return { type: pattern.type, confidence: 0.75, entities, originalText: text };
    }
  }

  return { type: 'unknown', confidence: 0, entities: {}, originalText: text };
}
