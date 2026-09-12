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