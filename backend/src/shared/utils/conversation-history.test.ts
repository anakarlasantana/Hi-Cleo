import { describe, it, expect } from 'vitest';
import { repeatsSentence } from './conversation-history.js';

/**
 * Regressão do E2E (2026-11-02): o guard de repetição comparava só a resposta
 * INTEIRA, então a Cleo repetia a mesma frase-chave em respostas diferentes
 * (“Vou anotar seu interesse e o dono entra em contato em breve” aparecia em
 * todas as respostas do cliente, com outro começo).
 */
describe('repeatsSentence', () => {
  const anterior =
    'Oi, Ana! Vou anotar seu interesse no corte e o Dono Teste entra em contato em breve.';

  it('detecta a mesma frase no meio de uma resposta diferente', () => {
    const nova =
      'Perfeito! Vou anotar seu interesse no corte e o Dono Teste entra em contato em breve.';

    expect(repeatsSentence(nova, anterior)).toBe(true);
  });

  it('ignora diferenças de caixa, acento e pontuação', () => {
    const nova =
      'VOU ANOTAR SEU INTERESSE NO CORTE E O DONO TESTE ENTRA EM CONTATO EM BREVE!!';

    expect(repeatsSentence(nova, anterior)).toBe(true);
  });

  it('não acusa repetição quando a resposta é realmente nova', () => {
    const nova = 'Temos horário amanhã às 10h ou às 15h. Qual prefere?';

    expect(repeatsSentence(nova, anterior)).toBe(false);
  });

  it('ignora frases curtas (evita falso positivo em "Tudo bem?")', () => {
    const nova = 'Tudo bem? Temos horário amanhã às 10h.';

    expect(repeatsSentence(nova, 'Tudo bem?')).toBe(false);
  });

  it('sem resposta anterior não há repetição', () => {
    expect(repeatsSentence('qualquer coisa', undefined)).toBe(false);
  });
});
