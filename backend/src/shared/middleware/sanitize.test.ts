import { describe, it, expect } from 'vitest';
import { stripThinkingTags } from './sanitize.js';

/**
 * O modelo local vazou lixo de template na resposta do dono:
 * "Quer trocar de contato? Tá de sacanagem, chefe! 😜】"
 * (encontrado no E2E de qualidade, cenário owner_command).
 */
describe('stripThinkingTags', () => {
  it('removes vazamento de delimitador no fim da frase', () => {
    expect(stripThinkingTags('Tudo certo, chefe! 😜】'))
      .toBe('Tudo certo, chefe! 😜');
  });

  it('removes decorative delimiters anywhere', () => {
    expect(stripThinkingTags('【Resposta】 seus clientes estão ok')).toBe('Resposta seus clientes estão ok');
  });

  it('keeps thinking blocks out of the reply', () => {
    expect(stripThinkingTags('<think>analisando o pedido</think>Pronto, anotei!'))
      .toBe('Pronto, anotei!');
  });

  it('drops a Reasoning: preamble', () => {
    expect(stripThinkingTags('Reasoning: o dono quer a lista\nPronto, aqui está!'))
      .toBe('Pronto, aqui está!');
  });

  it('does not corrupt normal messages', () => {
    const msg = 'Oi! Seus clientes novos de hoje:\n1. *Ana*\n\n⚠️ Sem resposta:\n1. *Bruno*';
    expect(stripThinkingTags(msg)).toBe(msg);
  });

  it('handles empty input', () => {
    expect(stripThinkingTags('')).toBe('');
  });
});
