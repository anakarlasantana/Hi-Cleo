import { describe, it, expect } from 'vitest';
import { AssistenteService } from './assistente.service.js';
import type { AiPort } from '../../shared/ports/ai.port.js';
import type { Message } from '../../shared/types/index.js';

/**
 * AiPort que captura os prompts e devolve respostas na ordem dada.
 * O reply conversacional precisa de 1 chamada (ou 2 quando precisa variar).
 */
function aiResponding(...answers: string[]) {
  const prompts: string[][] = [];
  let index = 0;

  const ai: AiPort = {
    async generateContent(promptsArg: string[]): Promise<string> {
      prompts.push(promptsArg);
      return answers[Math.min(index++, answers.length - 1)];
    },
  };

  return { ai, prompts };
}

/** Mensagens chegam do banco em ordem DESC (mais recente primeiro). */
function msg(text: string, direction: 'inbound' | 'outbound'): Message {
  return {
    id: `${direction}-${text.slice(0, 8)}`,
    lead_id: 'lead-1',
    text,
    direction,
    timestamp: new Date().toISOString(),
  };
}

const HISTORY: Message[] = [
  msg('e aí, cadê a pizza? 🍕', 'outbound'), // última fala da Cleo
  msg('kkkk brincadeira', 'inbound'),
  msg('Oi! Tudo bem?', 'outbound'),
  msg('oi cleo', 'inbound'),
];

describe('AssistenteService — reply conversacional do dono', () => {
  it('injeta o histórico em ordem cronológica no prompt', async () => {
    const { ai, prompts } = aiResponding('Boa! 😄');
    const service = new AssistenteService(ai);

    await service.generateConversationalReply('Fernanda', 'e hoje, tudo certo?', HISTORY, {
      businessName: 'Clínica de estética',
    });

    const systemPrompt = prompts[0][0];
    expect(systemPrompt).toContain('CONVERSA ATÉ AGORA');
    expect(systemPrompt.indexOf('Fernanda: "oi cleo"')).toBeGreaterThan(-1);
    expect(systemPrompt.indexOf('Fernanda: "oi cleo"'))
      .toBeLessThan(systemPrompt.indexOf('Cleo: "Oi! Tudo bem?"'));
    expect(systemPrompt.indexOf('Cleo: "Oi! Tudo bem?"'))
      .toBeLessThan(systemPrompt.indexOf('Cleo: "e aí, cadê a pizza?'));
    // O negócio entra no prompt para a oferta ser concreta
    expect(systemPrompt).toContain('Clínica de estética');
    // A mensagem atual vai no prompt do usuário, não duplicada no histórico
    expect(prompts[0][1]).toBe('Mensagem do dono: "e hoje, tudo certo?"');
  });

  it('sem histórico não injeta bloco vazio nem quebra', async () => {
    const { ai, prompts } = aiResponding('Oi! Tudo certo por aqui.');
    const service = new AssistenteService(ai);

    const reply = await service.generateConversationalReply('Fernanda', 'oi');

    expect(reply).toBe('Oi! Tudo certo por aqui.');
    expect(prompts[0][0]).not.toContain('CONVERSA ATÉ AGORA');
  });

  it('regenera UMA vez quando a resposta repete a última fala da Cleo', async () => {
    const { ai, prompts } = aiResponding(
      'e aí, cadê a pizza? 🍕',           // repetiu o histórico
      'Tô aqui! Quer que eu veja quem tá sem resposta?',
    );
    const service = new AssistenteService(ai);

    const reply = await service.generateConversationalReply('Fernanda', 'oi de novo', HISTORY);

    expect(prompts).toHaveLength(2);
    expect(prompts[1][0]).toContain('NÃO repita');
    expect(reply).toBe('Tô aqui! Quer que eu veja quem tá sem resposta?');
  });

  it('mantém a primeira resposta se a regeneração repetir de novo', async () => {
    const { ai, prompts } = aiResponding('e aí, cadê a pizza? 🍕', 'e aí, cadê a pizza? 🍕');
    const service = new AssistenteService(ai);

    const reply = await service.generateConversationalReply('Fernanda', 'oi de novo', HISTORY);

    expect(prompts).toHaveLength(2);
    expect(reply).toBe('e aí, cadê a pizza? 🍕');
  });

  it('orienta oferta concreta e proíbe menu/repetição', async () => {
    const { ai, prompts } = aiResponding('Boa!');
    const service = new AssistenteService(ai);

    await service.generateConversationalReply('Fernanda', 'kkkk');

    const systemPrompt = prompts[0][0];
    expect(systemPrompt).toContain('algo concreto');
    expect(systemPrompt).toContain('NUNCA liste um menu de comandos');
    expect(systemPrompt).toContain('nem repita ofertas, piadas ou perguntas');
    // Só pode oferecer o que a Cleo realmente faz (bug do E2E: "playlist de chuva")
    expect(systemPrompt).toContain('NUNCA ofereça outra capacidade');
    expect(systemPrompt).toContain('agendar lembretes/retornos');
  });
});
