import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const { sendText, messageRepo, leadService, sessionRepo, userRepo, assistenteService } = vi.hoisted(() => ({
  sendText: vi.fn(),
  messageRepo: { save: vi.fn(), saveWithMedia: vi.fn(), getByLead: vi.fn(), getMediaMessages: vi.fn() },
  leadService: {
    findOrCreate: vi.fn(),
    updateLastInteraction: vi.fn(),
    findByPhone: vi.fn(),
    searchByName: vi.fn(),
    listByStatus: vi.fn(),
    listToday: vi.fn(),
    listNoReply: vi.fn(),
  },
  sessionRepo: { findByInstance: vi.fn(), findByUserId: vi.fn() },
  userRepo: { findById: vi.fn(), getBusiness: vi.fn() },
  assistenteService: { recognize: vi.fn(), generateConversationalReply: vi.fn() },
}));

vi.mock('../../container.js', () => ({
  container: {
    logger: {
      child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    },
    messaging: { sendText },
    messageRepo,
    leadService,
    sessionRepo,
    userRepo,
    assistenteService,
    exclusionRepo: { isExcluded: vi.fn().mockResolvedValue(false), list: vi.fn(), remove: vi.fn() },
    ruleEngine: { evaluate: vi.fn().mockResolvedValue(null) },
    trialService: { checkTrialStatus: vi.fn().mockReturnValue({ isValid: true }) },
    trialRepo: { findByPhone: vi.fn().mockResolvedValue(null), incrementResponses: vi.fn() },
  },
}));

vi.mock('../../shared/config/env.js', () => ({
  env: {
    MONITOR_INSTANCE: 'secretary',
    CHECKOUT_URL: 'https://hicleo.com.br/checkout',
    SITE_URL: 'https://hicleo.com.br',
    NODE_ENV: 'test',
  },
}));

vi.mock('../ai/nodes/transcribe-audio.js', () => ({ transcribeAudio: vi.fn().mockResolvedValue('') }));
vi.mock('../ai/nodes/interpret-confirmation.js', () => ({ interpretConfirmation: vi.fn() }));
vi.mock('../ai/nodes/generate-client-reply.js', () => ({ generateClientReply: vi.fn() }));

import type { Logger } from '../../shared/logger/logger.js';
import { createMessageProcessor } from './message.processor.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

const logger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  info: vi.fn(), warn: vi.fn(), error: vi.fn(),
} as unknown as Logger;

function buildContainer() {
  return {
    logger,
    messaging: { sendText },
    messageRepo,
    leadService,
    sessionRepo,
    userRepo,
    assistenteService,
    exclusionRepo: { isExcluded: vi.fn().mockResolvedValue(false), list: vi.fn(), remove: vi.fn() },
    ruleEngine: { evaluate: vi.fn().mockResolvedValue(null) },
    trialService: { checkTrialStatus: vi.fn().mockReturnValue({ isValid: true }) },
    trialRepo: { findByPhone: vi.fn().mockResolvedValue(null), incrementResponses: vi.fn() },
  } as any;
}

function jobData(overrides: Record<string, unknown> = {}) {
  return {
    phone: '5511999998888',
    instance: 'user-user-123',
    text: 'clientes novos de hoje e quem está sem resposta',
    isSecretaryInstance: false,
    timestamp: Date.now(),
    remoteJid: '5511999998888@s.whatsapp.net',
    messageKey: 'msg-1',
    webhookKey: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'msg-1' },
    ...overrides,
  } as any;
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('MessageProcessor — múltiplos pedidos do dono', () => {
  let processor: ReturnType<typeof createMessageProcessor>;
  let container: any;

  beforeEach(() => {
    vi.clearAllMocks();
    container = buildContainer();
    processor = createMessageProcessor(container, logger);

    sessionRepo.findByInstance.mockResolvedValue({ user_id: 'user-123' });
    userRepo.findById.mockResolvedValue({
      id: 'user-123', name: 'Fernanda', phone: '5511999998888', subscription_status: 'active',
    });
    leadService.findOrCreate.mockResolvedValue({ id: 'lead-1', created_at: new Date(Date.now() - 60_000) });
    messageRepo.getByLead.mockResolvedValue([]);
    messageRepo.save.mockResolvedValue(undefined);
    assistenteService.generateConversationalReply.mockResolvedValue('ok, anotado por aqui!');
  });

  function lastReply(): string {
    const calls = messageRepo.save.mock.calls.filter((c: any[]) => c[2] === 'outbound');
    return calls.at(-1)?.[1] ?? '';
  }

  // Bug do E2E: "clientes novos hoje e quem está sem resposta" respondia só
  // a primeira parte; o usuário repetia e a Cleo entrava em loop.
  it('answers both requests when the owner asks two things at once', async () => {
    assistenteService.recognize.mockResolvedValue({
      type: 'leads_today',
      confidence: 0.95,
      entities: {},
      originalText: 'clientes novos de hoje e quem está sem resposta',
      additionalIntents: [{ type: 'no_reply', entities: {} }],
    });
    leadService.listToday.mockResolvedValue([{ id: 'l1', name: 'Ana', phone: '5511900000001' }]);
    leadService.listNoReply.mockResolvedValue([{ id: 'l2', name: 'Bruno', phone: '5511900000002' }]);

    await processor(jobData());

    expect(leadService.listToday).toHaveBeenCalledWith('user-123');
    expect(leadService.listNoReply).toHaveBeenCalledWith('user-123');

    const reply = lastReply();
    expect(reply).toContain('Ana');      // seção "clientes novos de hoje"
    expect(reply).toContain('Bruno');    // seção "quem está sem resposta"
  });

  it('separates the sections with real line breaks', async () => {
    assistenteService.recognize.mockResolvedValue({
      type: 'leads_today',
      confidence: 0.95,
      entities: {},
      originalText: 'clientes novos hoje e sem resposta',
      additionalIntents: [{ type: 'no_reply', entities: {} }],
    });
    leadService.listToday.mockResolvedValue([{ id: 'l1', name: 'Ana', phone: '5511900000001' }]);
    leadService.listNoReply.mockResolvedValue([{ id: 'l2', name: 'Bruno', phone: '5511900000002' }]);

    await processor(jobData());

    // Regressão: o join já usou a string literal "\\n\\n" (sem quebra real)
    expect(lastReply()).toContain('\n\n');
    expect(lastReply()).not.toContain('\\n\\n');
  });

  it('still answers a single request the same way (no additional intents)', async () => {
    assistenteService.recognize.mockResolvedValue({
      type: 'no_reply', confidence: 0.95, entities: {}, originalText: 'quem tá sem resposta',
    });
    leadService.listNoReply.mockResolvedValue([{ id: 'l2', name: 'Bruno', phone: '5511900000002' }]);

    await processor(jobData({ text: 'quem tá sem resposta' }));

    expect(leadService.listToday).not.toHaveBeenCalled();
    expect(lastReply()).toContain('Bruno');
  });

  it('keeps answering the other requests when one of them fails', async () => {
    // Par que NÃO é deduplicado (list_leads + no_reply): isola o teste de falha
    assistenteService.recognize.mockResolvedValue({
      type: 'list_leads',
      confidence: 0.95,
      entities: {},
      originalText: 'mostra meus clientes e quem está sem resposta',
      additionalIntents: [{ type: 'no_reply', entities: {} }],
    });
    leadService.listByStatus.mockRejectedValue(new Error('db down'));
    leadService.listNoReply.mockResolvedValue([{ id: 'l2', name: 'Bruno', phone: '5511900000002' }]);

    await processor(jobData({ text: 'mostra meus clientes e quem está sem resposta' }));

    expect(lastReply()).toContain('Bruno');
  });

  // Bug do E2E: "/troca_de_contato" ia para a IA conversacional, que respondia
  // com brincadeira ("Tá de sacanagem, chefe?") e um caractere de template vazado.
  it('explains unknown slash commands instead of sending them to the AI', async () => {
    await processor(jobData({ text: '/troca_de_contato' }));

    expect(assistenteService.recognize).not.toHaveBeenCalled();
    expect(assistenteService.generateConversationalReply).not.toHaveBeenCalled();

    const reply = lastReply();
    expect(reply).toContain('/troca_de_contato');
    expect(reply).toContain('sem resposta'); // sugere o que fazer em linguagem natural
  });

  // Bug do E2E: a seção de "sem resposta" aparecia DUAS vezes na mesma mensagem,
  // porque `leads_today` já cobre `no_reply` e o orquestrador rodava os dois.
  it('does not duplicate the no-reply section when both are requested', async () => {
    assistenteService.recognize.mockResolvedValue({
      type: 'leads_today',
      confidence: 0.95,
      entities: {},
      originalText: 'clientes novos hoje e sem resposta',
      additionalIntents: [{ type: 'no_reply', entities: {} }],
    });
    leadService.listToday.mockResolvedValue([]);
    leadService.listNoReply.mockResolvedValue([]);

    await processor(jobData({ text: 'clientes novos hoje e sem resposta' }));

    const reply = lastReply();
    expect(reply.split('Sem resposta').length - 1).toBe(1);
    expect(reply.split('Clientes novos de hoje').length - 1).toBe(1);
  });

  // Bug do E2E: as duas listas saíam coladas ("1. *Fernanda*\\n✅ Retorno...").
  it('separates the two lists with a visible divider', async () => {
    assistenteService.recognize.mockResolvedValue({
      type: 'leads_today',
      confidence: 0.95,
      entities: {},
      originalText: 'quantos novos teve hoje e quem está sem resposta',
      additionalIntents: [{ type: 'no_reply', entities: {} }],
    });
    leadService.listToday.mockResolvedValue([{ id: 'l1', name: 'Ana', phone: '5511900000001' }]);
    leadService.listNoReply.mockResolvedValue([]);

    await processor(jobData({ text: 'quantos novos teve hoje e quem está sem resposta' }));

    const reply = lastReply();
    expect(reply).toContain('Clientes novos de hoje');
    expect(reply).toContain('Sem resposta');
    expect(reply).toContain('———');
  });

  // Bug do E2E: o lead de auditoria do dono (mesmo telefone dele) entrava nas
  // listas e a Cleo anunciava a própria dona como "cliente novo de hoje".
  it('never lists the owner as one of their own clients', async () => {
    assistenteService.recognize.mockResolvedValue({
      type: 'leads_today',
      confidence: 0.95,
      entities: {},
      originalText: 'quantos clientes novos eu tive hoje',
    });
    leadService.listToday.mockResolvedValue([
      { id: 'owner-lead', name: 'Fernanda', phone: '5511999998888' }, // o próprio dono
      { id: 'l1', name: 'Ana', phone: '5511900000001' },
    ]);

    await processor(jobData({ text: 'quantos clientes novos eu tive hoje' }));

    const reply = lastReply();
    expect(reply).toContain('Ana');
    expect(reply).not.toContain('Fernanda');
  });

  // Sem histórico a Cleo repetia a mesma piada/pergunta a cada mensagem vaga
  // (visto no E2E, cenário edge_case).
  it('passa o histórico da conversa para o reply conversacional do dono', async () => {
    assistenteService.recognize.mockResolvedValue({ type: 'unknown', confidence: 0.2, entities: {} });
    assistenteService.generateConversationalReply.mockResolvedValue('Boa! Quer ver quem tá sem resposta?');
    messageRepo.getByLead.mockResolvedValue([
      { id: 'm2', direction: 'inbound', text: 'kkkk brincadeira', timestamp: new Date().toISOString() },
      { id: 'm1', direction: 'outbound', text: 'Oi! Tudo bem?', timestamp: new Date().toISOString() },
    ]);

    await processor(jobData({ text: 'kkkk brincadeira' }));

    expect(messageRepo.getByLead).toHaveBeenCalledWith('lead-1', 6);
    const history = assistenteService.generateConversationalReply.mock.calls[0][2];
    expect(history).toHaveLength(1); // a inbound atual não se repete no histórico
    expect(history[0].text).toBe('Oi! Tudo bem?');
  });

  it('separates independent query sections with a visible divider', async () => {
    assistenteService.recognize.mockResolvedValue({
      type: 'list_leads',
      confidence: 0.95,
      entities: {},
      originalText: 'mostra os clientes e os quentes',
      additionalIntents: [{ type: 'hot_leads', entities: {} }],
    });
    leadService.listByStatus.mockImplementation(async (_userId: string, status: string) =>
      status === 'new'
        ? [{ id: 'l1', name: 'Ana', phone: '5511900000001' }]
        : [{ id: 'l3', name: 'Carla', phone: '5511900000003' }],
    );

    await processor(jobData({ text: 'mostra os clientes e os quentes' }));

    const reply = lastReply();
    expect(reply).toContain('Ana');
    expect(reply).toContain('Carla');
    expect(reply).toContain('———');
  });
});
