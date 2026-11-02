import { describe, it, expect } from 'vitest';
import {
  STICKER_MARKER,
  buildLowInformationReply,
  buildOptOutReply,
  buildStickerReply,
  isEmojiOnlyMessage,
  isLowInformationMessage,
  isStickerMessage,
  wantsOptOut,
} from './client-signals.js';

/**
 * Sinais do cliente final. Todos nasceram de buracos encontrados na validação do
 * beta: figurinha era descartada pelo webhook (cliente no silêncio, lead perdido)
 * e o único opt-out existente era o da prospecção pós-trial.
 */

describe('isStickerMessage', () => {
  it('reconhece o marcador de figurinha', () => {
    expect(isStickerMessage(STICKER_MARKER)).toBe(true);
    expect(isStickerMessage(`  ${STICKER_MARKER}  `)).toBe(true);
  });

  it('não confunde texto normal com figurinha', () => {
    expect(isStickerMessage('oi')).toBe(false);
    expect(isStickerMessage('[imagem]')).toBe(false);
    expect(isStickerMessage('')).toBe(false);
  });
});

describe('isEmojiOnlyMessage', () => {
  it('detecta emoji e pontuação soltos', () => {
    expect(isEmojiOnlyMessage('👍')).toBe(true);
    expect(isEmojiOnlyMessage('😀😀😀')).toBe(true);
    expect(isEmojiOnlyMessage('...')).toBe(true);
    expect(isEmojiOnlyMessage('?')).toBe(true);
  });

  it('texto com letra (mesmo acentuada) NÃO é baixa informação', () => {
    expect(isEmojiOnlyMessage('oi')).toBe(false);
    expect(isEmojiOnlyMessage('não')).toBe(false);
    expect(isEmojiOnlyMessage('Ação')).toBe(false);
    expect(isEmojiOnlyMessage('ok 👍')).toBe(false);
    expect(isEmojiOnlyMessage('3')).toBe(false);
  });

  it('string vazia não é baixa informação (é ausência de mensagem)', () => {
    expect(isEmojiOnlyMessage('')).toBe(false);
    expect(isEmojiOnlyMessage('   ')).toBe(false);
  });
});

describe('isLowInformationMessage', () => {
  it('figurinha e emoji solto são baixa informação', () => {
    expect(isLowInformationMessage(STICKER_MARKER)).toBe(true);
    expect(isLowInformationMessage('❤️')).toBe(true);
  });

  it('pergunta real não é baixa informação', () => {
    expect(isLowInformationMessage('quanto custa o corte?')).toBe(false);
  });
});

describe('wantsOptOut', () => {
  it('reconhece pedidos explícitos de parar', () => {
    const pedidos = [
      'para de me mandar mensagem',
      'pare de enviar mensagens pra mim',
      'parem de me mandar mensagem',
      'não quero mais receber',
      'nao quero receber mensagens',
      'não me manda mais',
      'não me envie mais mensagens',
      'me tira da lista',
      'me remova dos contatos',
      'descadastra meu número',
      'cancela meu cadastro',
      'quero ser removido da lista',
    ];

    for (const pedido of pedidos) {
      expect(wantsOptOut(pedido), `deveria detectar: "${pedido}"`).toBe(true);
    }
  });

  it('NÃO reage a "para"/"não" isolados (falso positivo calaria cliente pagante)', () => {
    const normais = [
      'quanto para fazer a escova?',
      'não sei se para sábado tem vaga',
      'para sábado vocês abrem?',
      'não quero mais o corte curto, quero degradê',
      'não quero nada muito caro',
      'me tira uma dúvida sobre o preço',
      'remove o esmalte antes da unha?',
      'quanto custa o corte?',
      '',
    ];

    for (const normal of normais) {
      expect(wantsOptOut(normal), `não deveria detectar: "${normal}"`).toBe(false);
    }
  });

  it('ignora caixa alta', () => {
    expect(wantsOptOut('PARA DE ME MANDAR MENSAGEM')).toBe(true);
  });
});

describe('respostas ao cliente', () => {
  it('figurinha ganha resposta leve e convite ao texto', () => {
    const texto = buildStickerReply();
    expect(texto).toContain('figurinha');
    expect(texto).toMatch(/texto/i);
  });

  it('emoji solto ganha resposta sem inventar contexto', () => {
    expect(buildLowInformationReply()).toMatch(/texto/i);
  });

  it('opt-out confirma o pedido e deixa a porta aberta', () => {
    const texto = buildOptOutReply();
    expect(texto).toContain('Não vou mais te enviar mensagens');
    expect(texto).toMatch(/precisar/i);
  });
});
