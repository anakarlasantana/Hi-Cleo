import { describe, it, expect } from 'vitest';
import { recognizeIntent } from './recognize-intent.js';
import type { AiPort } from '../../../shared/ports/ai.port.js';

/**
 * AiPort que sempre falha — força o fallback por keywords,
 * simulando ambiente sem IA (como ocorre no E2E com Docker sem LLM).
 */
const failingAi: AiPort = {
  async generateContent(): Promise<string> {
    throw new Error('AI provider indisponível');
  },
};

/**
 * AiPort que retorna JSON de intent sem entidade phone —
 * verifica que o pós-processamento extrai o telefone do texto.
 */
function aiReturning(type: string): AiPort {
  return {
    async generateContent(): Promise<string> {
      return JSON.stringify({ type, confidence: 0.9, entities: {} });
    },
  };
}

describe('recognizeIntent — fallback por keywords (IA offline)', () => {
  describe('disconnect_user — sinônimos aceitos', () => {
    const phrases = [
      'desconecta 5548999122999',
      'remove a conexão do 5548999122999',
      'remove o acesso do 5548999122999',
      'remove o número 5548999122999',
      'desvincula o 5548999122999',
      'cancela o acesso do 5548999122999',
      'cancelar o número 5548999122999',
      'apaga a conexão do 5548999122999',
      'tira acesso do 5548999122999',
    ];

    for (const phrase of phrases) {
      it(`reconhece "${phrase}" como disconnect_user com phone extraído`, async () => {
        const intent = await recognizeIntent(failingAi, phrase);
        expect(intent.type).toBe('disconnect_user');
        expect(intent.entities.phone).toBe('5548999122999');
      });
    }
  });

  describe('invite_user — sinônimos aceitos', () => {
    const phrases = [
      'convida o 5548999122999',
      'adiciona a conexão do 5548999122999',
      'adiciona número 5548999122999',
      'adicionar número 5548999122999',
    ];

    for (const phrase of phrases) {
      it(`reconhece "${phrase}" como invite_user com phone extraído`, async () => {
        const intent = await recognizeIntent(failingAi, phrase);
        expect(intent.type).toBe('invite_user');
        expect(intent.entities.phone).toBe('5548999122999');
      });
    }
  });

  describe('extração de telefone em formatos variados', () => {
    it('extrai celular sem DDI e prefixa 55', async () => {
      const intent = await recognizeIntent(failingAi, 'desconecta o 48999122999');
      expect(intent.type).toBe('disconnect_user');
      expect(intent.entities.phone).toBe('5548999122999');
    });

    it('extrai formato com espaços/máscara: 48 99912-2999', async () => {
      const intent = await recognizeIntent(failingAi, 'desconecta 48 99912-2999');
      expect(intent.entities.phone).toBe('5548999122999');
    });

    it('extrai formato com +55 e parênteses: +55 (48) 99912-2999', async () => {
      const intent = await recognizeIntent(failingAi, 'desconecta +55 (48) 99912-2999');
      expect(intent.entities.phone).toBe('5548999122999');
    });

    it('sendo disconnect_user sem telefone, entities fica vazio (Cleo pede o número)', async () => {
      const intent = await recognizeIntent(failingAi, 'desconecta meu colaborador');
      expect(intent.type).toBe('disconnect_user');
      expect(intent.entities.phone).toBeUndefined();
    });
  });

  it('texto sem keywords retorna unknown', async () => {
    const intent = await recognizeIntent(failingAi, 'bom dia, tudo bem?');
    expect(intent.type).toBe('unknown');
    expect(intent.confidence).toBe(0);
  });
});

describe('recognizeIntent — pós-processamento após IA (phone ausente no JSON)', () => {
  it('injeta phone extraído do texto original quando a IA não retornou a entidade', async () => {
    const intent = await recognizeIntent(aiReturning('disconnect_user'), 'desconecta 5548999122999');
    expect(intent.type).toBe('disconnect_user');
    expect(intent.entities.phone).toBe('5548999122999');
  });

  it('mantém phone retornado pela IA (não sobrescreve)', async () => {
    const ai: AiPort = {
      async generateContent(): Promise<string> {
        return JSON.stringify({
          type: 'disconnect_user',
          confidence: 0.9,
          entities: { phone: '5511988776655' },
        });
      },
    };
    const intent = await recognizeIntent(ai, 'desconecta 5548999122999');
    expect(intent.entities.phone).toBe('5511988776655');
  });

  it('preserva originalText em qualquer caminho', async () => {
    const text = 'desconecta 5548999122999';
    const viaFallback = await recognizeIntent(failingAi, text);
    const viaAi = await recognizeIntent(aiReturning('disconnect_user'), text);
    expect(viaFallback.originalText).toBe(text);
    expect(viaAi.originalText).toBe(text);
  });
});
/**
 * Multi-intent: o dono pede várias coisas na MESMA mensagem.
 * Bug do E2E (cenário `owner_command`): a Cleo executava só o primeiro pedido
 * e ignorava o resto — "ver clientes novos hoje e quem está sem resposta"
 * respondia apenas a lista de clientes.
 */
describe('recognizeIntent — múltiplos pedidos na mesma mensagem', () => {
  it('detects both requests via keyword fallback (IA offline)', async () => {
    const result = await recognizeIntent(
      failingAi,
      'Oi, Cleo! Vai lá ver o status dos clientes novos hoje e ver quem está sem resposta. Quer ver a agenda e os leads?',
    );

    const types = [result.type, ...(result.additionalIntents || []).map((i) => i.type)];
    expect(types).toContain('leads_today');
    expect(types).toContain('no_reply');
  });

  it('keeps the AI primary intent and adds the missing one', async () => {
    const ai: AiPort = {
      async generateContent(): Promise<string> {
        // IA entendeu só o primeiro pedido
        return JSON.stringify({ type: 'leads_today', confidence: 0.9, entities: {} });
      },
    };

    const result = await recognizeIntent(ai, 'clientes novos de hoje e quem está sem resposta');

    expect(result.type).toBe('leads_today');
    expect(result.additionalIntents?.map((i) => i.type)).toContain('no_reply');
  });

  it('uses additional_intents returned by the AI', async () => {
    const ai: AiPort = {
      async generateContent(): Promise<string> {
        return JSON.stringify({
          type: 'leads_today',
          confidence: 0.95,
          entities: {},
          additional_intents: [{ type: 'no_reply', entities: {} }, { type: 'hot_leads', entities: {} }],
        });
      },
    };

    const result = await recognizeIntent(ai, 'quem chegou hoje, quem está sem resposta e quem está quente');

    expect(result.type).toBe('leads_today');
    expect(result.additionalIntents?.map((i) => i.type)).toEqual(['no_reply', 'hot_leads']);
  });

  it('drops invalid, duplicated and unknown additional intents', async () => {
    const ai: AiPort = {
      async generateContent(): Promise<string> {
        return JSON.stringify({
          type: 'list_leads',
          confidence: 0.9,
          entities: {},
          additional_intents: [
            { type: 'list_leads', entities: {} },   // duplicada do primário
            { type: 'unknown', entities: {} },       // inválida
            { type: 'nao_existe', entities: {} },    // inexistente
            { type: 'no_reply', entities: {} },
            { type: 'no_reply', entities: {} },      // duplicada
          ],
        });
      },
    };

    const result = await recognizeIntent(ai, 'mostra os clientes e quem está sem resposta');

    expect(result.additionalIntents?.map((i) => i.type)).toEqual(['no_reply']);
  });

  it('returns an empty list for a single request', async () => {
    const result = await recognizeIntent(aiReturning('list_leads'), 'mostra meus clientes');

    expect(result.type).toBe('list_leads');
    expect(result.additionalIntents).toEqual([]);
  });
});

/**
 * Regressão do E2E (`owner_command`, 2026-11-01): a persona mandou
 * "/talvez você quer ver o status dos clientes novos hoje?" e a Cleo respondeu
 * com TRÊS blocos — "Seus clientes" + "Clientes novos de hoje" (o mesmo nome
 * duas vezes) + "Qual cliente você quer saber?". Causa: o fallback por keyword
 * casava o texto inteiro, não a oração, e cada consulta virava um pedido.
 */
describe('recognizeIntent — uma oração não vira vários pedidos', () => {
  it('não inventa pedidos extras quando a IA já entendeu a mensagem', async () => {
    const result = await recognizeIntent(
      aiReturning('list_leads'),
      '/talvez você quer ver o status dos clientes novos hoje?',
    );

    const types = [result.type, ...(result.additionalIntents ?? []).map((i) => i.type)];
    expect(result.type).toBe('leads_today');
    expect(types).not.toContain('list_leads');   // mesma lista, outro header
    expect(types).not.toContain('lead_status');  // "Qual cliente você quer saber?" sem nome
    expect(result.additionalIntents ?? []).toEqual([]);
  });

  it('mantém um único pedido quando a mensagem tem uma oração só (IA offline)', async () => {
    const result = await recognizeIntent(failingAi, 'ver o status dos clientes novos hoje');

    expect(result.type).toBe('leads_today');
    expect(result.additionalIntents ?? []).toEqual([]);
  });

  it('não pede o nome do cliente quando o dono fala de clientes em geral', async () => {
    const result = await recognizeIntent(failingAi, 'status dos clientes');

    expect(result.type).not.toBe('lead_status');
  });

  it('continua reconhecendo o status de um contato específico', async () => {
    const result = await recognizeIntent(failingAi, 'como tá o João?');

    expect(result.type).toBe('lead_status');
  });

  it('colapsa list_leads + leads_today (a mesma lista em dois headers)', async () => {
    const ai: AiPort = {
      async generateContent(): Promise<string> {
        return JSON.stringify({
          type: 'list_leads',
          confidence: 0.9,
          entities: {},
          additional_intents: [{ type: 'leads_today', entities: {} }],
        });
      },
    };

    const result = await recognizeIntent(ai, 'quantos clientes novos eu tive hoje?');

    expect(result.type).toBe('leads_today');
    expect(result.additionalIntents ?? []).toEqual([]);
  });

  it('mantém dois pedidos quando há duas orações explícitas', async () => {
    const result = await recognizeIntent(
      failingAi,
      'quantos clientes novos eu tive hoje e quem está sem resposta?',
    );

    const types = [result.type, ...(result.additionalIntents ?? []).map((i) => i.type)];
    expect(types).toEqual(['leads_today', 'no_reply']);
  });

  // Regressão: "como tá a Ana hoje?" respondia o detalhe da Ana E a lista de
  // clientes novos (o "hoje" da pergunta virava um 2º pedido).
  it('não anexa lista de clientes quando o dono pergunta de um cliente específico', async () => {
    const ai: AiPort = {
      async generateContent(): Promise<string> {
        return JSON.stringify({ type: 'lead_status', confidence: 0.92, entities: { name: 'Ana' } });
      },
    };

    const result = await recognizeIntent(ai, 'como tá a Ana hoje?');

    expect(result.type).toBe('lead_status');
    expect(result.additionalIntents ?? []).toEqual([]);
  });

  // Regressão do E2E (`edge_case`): "oi, como está? hoje tá chuvoso" recebeu
  // "Clientes novos de hoje: nenhum" porque o "hoje" da conversa casual era
  // anexado como consulta. Se a IA disse `unknown`, é conversa — não comando.
  it('não transforma conversa casual em consulta por causa de "hoje"', async () => {
    const ai: AiPort = {
      async generateContent(): Promise<string> {
        return JSON.stringify({ type: 'unknown', confidence: 0.95, entities: {} });
      },
    };

    const result = await recognizeIntent(ai, 'oi, como está? 😄 hoje tá chuvoso, tá legal? 🌧️');

    expect(result.type).toBe('unknown');
    expect(result.additionalIntents ?? []).toEqual([]);
  });
});
