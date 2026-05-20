import type { AiPort } from '../../shared/ports/ai.port.js';
import type { IntentType, RecognizedIntent } from '../../shared/types/index.js';

const INTENT_PROMPT = `Você é o interpretador de intenções de um CRM via WhatsApp.
O usuário é um pequeno empresário brasileiro que fala de forma informal.

Analise a mensagem e retorne APENAS um JSON válido (sem markdown, sem backticks):
{
  "type": "tipo_da_intencao",
  "confidence": 0.0 a 1.0,
  "entities": { "nome": "...", "data": "...", "horario": "..." }
}

Intenções possíveis:
- listar_leads: quer ver todos os clientes/contatos
- leads_hoje: quer ver clientes novos de hoje
- sem_resposta: quer saber quem está sem retorno
- clientes_quentes: quer ver clientes engajados/quentes
- agendar_followup: quer agendar lembrete/retorno para alguém
- status_lead: quer saber sobre um cliente específico
- enviar_material: quer enviar documento/orçamento para alguém
- configurar_regra: quer mudar configuração (horário, mensagem automática)
- ignorar_contato: quer que o sistema ignore um número (contato pessoal)
- listar_ignorados: quer ver quais contatos estão sendo ignorados
- parar_ignorar: quer voltar a acompanhar um contato que estava ignorado
- desconhecido: não conseguiu identificar

Extraia entidades quando possível (nome do cliente, data, horário).
Se a data for relativa ("amanhã", "segunda"), converta para formato ISO.`;

export class AssistenteService {
  constructor(private ai: AiPort) {}

  async recognize(text: string): Promise<RecognizedIntent> {
    try {
      const response = await this.ai.generateContent([
        INTENT_PROMPT,
        `Mensagem do usuário: "${text}"`,
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
      { keywords: ['leads', 'clientes', 'contatos', 'lista', 'mostra'], type: 'listar_leads' },
      { keywords: ['hoje', 'novos', 'novo', 'chegou'], type: 'leads_hoje' },
      { keywords: ['sem resposta', 'pendente', 'devendo', 'não respondeu'], type: 'sem_resposta' },
      { keywords: ['quente', 'quentes', 'engajado', 'oportunidade'], type: 'clientes_quentes' },
      { keywords: ['agenda', 'lembrete', 'retorno', 'lembra'], type: 'agendar_followup' },
      { keywords: ['como tá', 'status', 'novidade', 'e o'], type: 'status_lead' },
      { keywords: ['manda', 'envia', 'material', 'orçamento', 'catálogo', 'apresentação'], type: 'enviar_material' },
      { keywords: ['configura', 'muda', 'horário', 'automática'], type: 'configurar_regra' },
      { keywords: ['ignora', 'pessoal', 'não é cliente', 'exclui'], type: 'ignorar_contato' },
      { keywords: ['ignorados', 'excluídos', 'quem tá ignorado'], type: 'listar_ignorados' },
      { keywords: ['volta a acompanhar', 'para de ignorar', 'desbloqueia'], type: 'parar_ignorar' },
    ];

    for (const pattern of patterns) {
      if (pattern.keywords.some((kw) => lower.includes(kw))) {
        return { type: pattern.type, confidence: 0.6, entities: {}, originalText: text };
      }
    }

    return { type: 'desconhecido', confidence: 0, entities: {}, originalText: text };
  }
}
