import type { AiPort } from '../../shared/ports/ai.port.js';
import type { IntentType, RecognizedIntent } from '../../shared/types/index.js';
import { sanitizeForAiPrompt } from '../../shared/middleware/sanitize.js';

const INTENT_PROMPT = `Você é o interpretador de intenções de um CRM via WhatsApp.
O usuário é um pequeno empresário brasileiro que fala de forma informal.

Analise a mensagem e retorne APENAS um JSON válido (sem markdown, sem backticks):
{
  "type": "tipo_da_intencao",
  "confidence": 0.0 a 1.0,
  "entities": { "name": "...", "date": "...", "time": "..." }
}

Intenções possíveis:
- list_leads: quer ver todos os clientes/contatos
- leads_today: quer ver clientes novos de hoje
- no_reply: quer saber quem está sem retorno
- hot_leads: quer ver clientes engajados/quentes
- schedule_followup: quer agendar lembrete/retorno para alguém
- lead_status: quer saber sobre um cliente específico
- send_material: quer enviar documento/orçamento para alguém
- configure_rule: quer mudar configuração (horário, mensagem automática)
- ignore_contact: quer que o sistema ignore um número (contato pessoal)
- list_ignored: quer ver quais contatos estão sendo ignorados
- stop_ignoring: quer voltar a acompanhar um contato que estava ignorado
- invite_user: quer convidar alguém para usar o serviço (adicionar colaborador/conexão WhatsApp)
- disconnect_user: quer desconectar/remover um colaborador do plano
- unknown: não conseguiu identificar

Extraia entidades quando possível (name do cliente, phone, date, time).
Se a data for relativa ("amanhã", "segunda"), converta para formato ISO.`;

export class AssistenteService {
  constructor(private ai: AiPort) {}

  async recognize(text: string): Promise<RecognizedIntent> {
    try {
      const sanitizedText = sanitizeForAiPrompt(text);

      const response = await this.ai.generateContent([
        INTENT_PROMPT,
        `Mensagem do usuário: "${sanitizedText}"`,
      ]);

      const parsed = JSON.parse(response);

      return {
        type: parsed.type as IntentType,
        confidence: parsed.confidence || 0.5,
        entities: parsed.entities || {},
        originalText: text,
      };
    } catch {
      return this.recognizeFallback(text);
    }
  }

  private recognizeFallback(text: string): RecognizedIntent {
    const lower = text.toLowerCase();

    const patterns: Array<{ keywords: string[]; type: IntentType }> = [
      { keywords: ['leads', 'clientes', 'contatos', 'lista', 'mostra'], type: 'list_leads' },
      { keywords: ['hoje', 'novos', 'novo', 'chegou'], type: 'leads_today' },
      { keywords: ['sem resposta', 'pendente', 'devendo', 'não respondeu'], type: 'no_reply' },
      { keywords: ['quente', 'quentes', 'engajado', 'oportunidade'], type: 'hot_leads' },
      { keywords: ['agenda', 'lembrete', 'retorno', 'lembra'], type: 'schedule_followup' },
      { keywords: ['como tá', 'status', 'novidade', 'e o'], type: 'lead_status' },
      { keywords: ['manda', 'envia', 'material', 'orçamento', 'catálogo', 'apresentação'], type: 'send_material' },
      { keywords: ['configura', 'muda', 'horário', 'automática'], type: 'configure_rule' },
      { keywords: ['ignora', 'pessoal', 'não é cliente', 'exclui'], type: 'ignore_contact' },
      { keywords: ['ignorados', 'excluídos', 'quem tá ignorado'], type: 'list_ignored' },
      { keywords: ['volta a acompanhar', 'para de ignorar', 'desbloqueia'], type: 'stop_ignoring' },
      { keywords: ['convida', 'adiciona conexão', 'convite', 'adicionar whatsapp', 'novo colaborador'], type: 'invite_user' },
      { keywords: ['desconecta', 'remove conexão', 'tira acesso', 'desvincula'], type: 'disconnect_user' },
    ];

    for (const pattern of patterns) {
      if (pattern.keywords.some((kw) => lower.includes(kw))) {
        return { type: pattern.type, confidence: 0.6, entities: {}, originalText: text };
      }
    }

    return { type: 'unknown', confidence: 0, entities: {}, originalText: text };
  }
}
