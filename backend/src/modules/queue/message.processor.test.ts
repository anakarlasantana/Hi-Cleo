import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (hoisted para o vi.mock enxergar) ────────────────────────────────

const { sendText, messageRepo, leadService, sessionRepo, userRepo, assistenteService } = vi.hoisted(() => ({
  sendText: vi.fn(),
  messageRepo: { save: vi.fn(), saveWithMedia: vi.fn(), getByLead: vi.fn(), getMediaMessages: vi.fn() },
  leadService: {
    findOrCreate: vi.fn(),
    updateLastInteraction: vi.fn(),
    findByPhone: vi.fn(),
    searchByName: vi.fn(),
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
    exclusionRepo: { isExcluded: vi.fn().mockResolvedValue(false) },
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

// Nós de IA que dependem de rede — não são o alvo destes testes
vi.mock('../ai/nodes/transcribe-audio.js', () => ({ transcribeAudio: vi.fn().mockResolvedValue('') }));
vi.mock('../ai/nodes/interpret-confirmation.js', () => ({ interpretConfirmation: vi.fn() }));
vi.mock('../ai/nodes/generate-client-reply.js', () => ({ generateClientReply: vi.fn() }));

import type { Logger } from '../../shared/logger/logger.js';
import { generateClientReply } from '../ai/nodes/generate-client-reply.js';
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
    exclusionRepo: { isExcluded: vi.fn().mockResolvedValue(false) },
    ruleEngine: { evaluate: vi.fn().mockResolvedValue(null) },
    trialService: { checkTrialStatus: vi.fn().mockReturnValue({ isValid: true }) },
    trialRepo: { findByPhone: vi.fn().mockResolvedValue(null), incrementResponses: vi.fn() },
  } as any;
}

function jobData(overrides: Record<string, unknown> = {}) {
  return {
    phone: '5511999998888',
    instance: 'user-user-123',
    text: 'quem tá sem resposta?',
    isSecretaryInstance: false,
    timestamp: Date.now(),
    remoteJid: '5511999998888@s.whatsapp.net',
    messageKey: 'msg-1',
    webhookKey: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'msg-1' },
    ...overrides,
  } as any;
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe('MessageProcessor — mensagens na instância do usuário', () => {
  let processor: ReturnType<typeof createMessageProcessor>;
  let container: any;

  beforeEach(() => {
    vi.clearAllMocks();
    container = buildContainer();
    processor = createMessageProcessor(container, logger);

    sessionRepo.findByInstance.mockResolvedValue({ user_id: 'user-123' });
    userRepo.findById.mockResolvedValue({
      id: 'user-123',
      name: 'Ana',
      phone: '5511999998888', // mesmo número conectado (dono)
      subscription_status: 'active',
    });
    leadService.findOrCreate.mockResolvedValue({ id: 'lead-1', created_at: new Date(Date.now() - 60_000) });
    messageRepo.save.mockResolvedValue(undefined);
  });

  it('ignores messages for unknown instances', async () => {
    sessionRepo.findByInstance.mockResolvedValue(null);

    await processor(jobData());

    expect(leadService.findOrCreate).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  // BUG: o dono mandando mensagem no próprio número conectado virava "lead" e
  // recebia resposta de atendimento ao cliente ("o responsável vai te responder").
  it('does not treat the owner as a client lead', async () => {
    assistenteService.recognize.mockResolvedValue({ type: 'unknown', entities: {}, confidence: 0.2 });
    assistenteService.generateConversationalReply.mockResolvedValue('Oi Ana! Aqui é a Cleo, sua secretária.');

    await processor(jobData({ text: 'oi cleo' }));

    // O lead criado é o de auditoria do dono, não um cliente
    expect(leadService.findOrCreate).toHaveBeenCalledWith('user-123', '5511999998888', 'Ana');
    // Não passou pelo gerador de resposta para cliente
    expect(generateClientReply).not.toHaveBeenCalled();
  });

  it('replies to the owner through the instance that received the message', async () => {
    assistenteService.recognize.mockResolvedValue({ type: 'unknown', entities: {}, confidence: 0.2 });
    assistenteService.generateConversationalReply.mockResolvedValue('Oi Ana! Aqui é a Cleo, sua secretária.');

    await processor(jobData({ text: 'oi cleo' }));

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][0]).toMatchObject({
      instance: 'user-user-123', // NÃO 'secretary'
      to: '5511999998888',
    });
  });

  it('matches the owner phone even when stored without country code', async () => {
    userRepo.findById.mockResolvedValue({
      id: 'user-123', name: 'Ana', phone: '11999998888', subscription_status: 'active',
    });
    assistenteService.recognize.mockResolvedValue({ type: 'unknown', entities: {}, confidence: 0.2 });
    assistenteService.generateConversationalReply.mockResolvedValue('Oi Ana! Tudo certo por aqui.');

    await processor(jobData({ text: 'oi cleo' }));

    expect(generateClientReply).not.toHaveBeenCalled();
    expect(sendText.mock.calls[0][0].instance).toBe('user-user-123');
  });

  it('persists the owner reply before sending (persist-then-dispatch)', async () => {
    assistenteService.recognize.mockResolvedValue({ type: 'unknown', entities: {}, confidence: 0.2 });
    assistenteService.generateConversationalReply.mockResolvedValue('Oi Ana! Aqui é a Cleo.');

    await processor(jobData({ text: 'oi cleo' }));

    expect(messageRepo.save).toHaveBeenCalledWith('lead-1', 'Oi Ana! Aqui é a Cleo.', 'outbound');
    const saveOrder = messageRepo.save.mock.invocationCallOrder.at(-1)!;
    const sendOrder = sendText.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(sendOrder);
  });

  it('still treats a real client as a lead', async () => {
    userRepo.getBusiness.mockResolvedValue(null); // onboarding incompleto → não responde
    leadService.findOrCreate.mockResolvedValue({ id: 'lead-client', created_at: new Date(Date.now() - 60_000) });

    await processor(jobData({ phone: '5521988887777', text: 'oi, tudo bem?' }));

    expect(leadService.findOrCreate).toHaveBeenCalledWith('user-123', '5521988887777', undefined);
    expect(sendText).not.toHaveBeenCalled();
  });
});
