import { describe, it, expect } from 'vitest';
import {
  buildHandoffNotice,
  buildHandoffReply,
  buildNewLeadNotice,
  buildOptOutNotice,
  wantsHuman,
  withinServiceWindow,
  SERVICE_WINDOW_MS,
} from './owner-notices.js';

/**
 * Aviso de opt-out — antes, o único opt-out era o da prospecção pós-trial: o dono
 * nunca ficava sabendo que um cliente pediu para não receber mensagens.
 */
describe('buildOptOutNotice', () => {
  it('inclui nome, telefone e prévia do pedido', () => {
    const texto = buildOptOutNotice({
      clientName: 'Joana Prado',
      phone: '5548999887766',
      message: 'para de me mandar mensagem, por favor',
    });

    expect(texto).toContain('pediu para não receber mensagens');
    expect(texto).toContain('*Joana*');
    expect(texto).toContain('5548999887766');
    expect(texto).toContain('para de me mandar mensagem');
  });

  it('funciona sem nome (usa o telefone)', () => {
    const texto = buildOptOutNotice({ phone: '5548999887766' });
    expect(texto).toContain('*5548999887766*');
  });

  it('avisa que a Cleo parou de responder automaticamente', () => {
    const texto = buildOptOutNotice({ phone: '5548999887766' });
    expect(texto).toContain('Parei de responder automaticamente');
  });
});

/**
 * Avisos ao dono — “o dono precisa sentir valor a cada interação” e
 * “nunca deixar passar um cliente” (`docs/produto/personalidade-cleo.md`).
 * Antes destes avisos, o dono só descobria um cliente novo abrindo o WhatsApp.
 */
describe('buildNewLeadNotice', () => {
  it('inclui nome, telefone e prévia da primeira mensagem', () => {
    const texto = buildNewLeadNotice({
      clientName: 'Maria Souza',
      phone: '5548999112233',
      message: 'oi, quanto custa o corte?',
    });

    expect(texto).toContain('Novo cliente no WhatsApp');
    expect(texto).toContain('*Maria*'); // só o primeiro nome
    expect(texto).toContain('5548999112233');
    expect(texto).toContain('quanto custa o corte?');
  });

  it('funciona sem nome (usa o telefone) e sem mensagem', () => {
    const texto = buildNewLeadNotice({ phone: '5548999112233' });

    expect(texto).toContain('5548999112233');
    expect(texto).not.toContain('💬');
  });

  it('corta prévia longa para não virar textão no WhatsApp', () => {
    const texto = buildNewLeadNotice({
      clientName: 'João',
      phone: '5548999112233',
      message: 'a'.repeat(300),
    });

    expect(texto.length).toBeLessThan(400);
    expect(texto).toContain('…');
  });
});

describe('wantsHuman', () => {
  it.each([
    'quero falar com uma pessoa',
    'pode me passar para um atendente?',
    'preciso falar com o responsável',
    'tem como falar com um humano?',
    'quero atendimento humano',
  ])('reconhece pedido de humano em: %s', (mensagem) => {
    expect(wantsHuman(mensagem)).toBe(true);
  });

  it.each([
    'quanto custa o corte?',
    'vocês abrem sábado?',
    'quero agendar um horário',
    '',
  ])('não confunde pedido normal com handoff: %s', (mensagem) => {
    expect(wantsHuman(mensagem)).toBe(false);
  });
});

describe('respostas de handoff', () => {
  it('responde ao cliente citando o dono e que ele retorna', () => {
    const reply = buildHandoffReply('Ana Paula Rocha');

    expect(reply).toContain('Ana');
    expect(reply).toMatch(/avisei|responde/i);
  });

  it('avisa o dono com nome, telefone e prévia', () => {
    const texto = buildHandoffNotice({
      clientName: 'Maria Souza',
      phone: '5548999112233',
      message: 'quero falar com uma pessoa',
    });

    expect(texto).toContain('atendimento humano');
    expect(texto).toContain('*Maria*');
    expect(texto).toContain('quero falar com uma pessoa');
  });
});

describe('withinServiceWindow (janela de 24h do WhatsApp)', () => {
  const now = new Date('2026-11-02T12:00:00Z');

  it('dentro de 24h → pode enviar texto livre', () => {
    const duasHorasAtras = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(withinServiceWindow(duasHorasAtras, now)).toBe(true);
  });

  it('fora de 24h → precisaria de template aprovado', () => {
    const doisDiasAtras = new Date(now.getTime() - 2 * SERVICE_WINDOW_MS);
    expect(withinServiceWindow(doisDiasAtras, now)).toBe(false);
  });

  it('sem mensagem inbound → janela fechada', () => {
    expect(withinServiceWindow(undefined, now)).toBe(false);
    expect(withinServiceWindow(null, now)).toBe(false);
    expect(withinServiceWindow('', now)).toBe(false);
  });

  it('aceita string ISO e data no futuro não conta como dentro', () => {
    expect(withinServiceWindow('2026-11-02T11:00:00Z', now)).toBe(true);
    expect(withinServiceWindow('2026-11-03T12:00:00Z', now)).toBe(false);
  });
});
