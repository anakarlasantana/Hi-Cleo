import { describe, it, expect, vi } from 'vitest';
import { ActivationService } from './activation.service.js';

function createMockActivationRepo() {
  return {
    createCode: vi.fn(),
    findValidCode: vi.fn().mockResolvedValue({ code: 'ATIVAR-TEST', plan: 'solo', used: false }),
    markUsed: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockUserRepo() {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'user-123',
      name: 'Maria',
      phone: '5511999999999',
      plan: 'solo',
    }),
    createBusiness: vi.fn().mockResolvedValue(undefined),
    findByPhone: vi.fn(),
    findById: vi.fn(),
  };
}

function createMockOnboardingRepo() {
  return {
    create: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAi() {
  return {
    generateContent: vi.fn().mockResolvedValue(JSON.stringify({
      nome: 'Maria',
      negocio: 'Salão',
      servicos: 'Corte',
      horario_inicio: '09:00',
      horario_fim: '18:00',
    })),
  };
}

function createMockTermsConsentService() {
  return {
    requiresConsent: vi.fn().mockResolvedValue(true),
    recordConsent: vi.fn().mockResolvedValue(undefined),
    getConsentHistory: vi.fn().mockResolvedValue([]),
  };
}

describe('ActivationService - Terms Consent Integration', () => {
  it('should throw TERMS_CONSENT_REQUIRED when termsConsentService is provided and termsAccepted is false', async () => {
    const service = new ActivationService(
      createMockActivationRepo() as any,
      createMockUserRepo() as any,
      createMockOnboardingRepo() as any,
      createMockAi() as any,
      createMockTermsConsentService() as any,
    );

    await expect(
      service.activateUser('ATIVAR-TEST', '5511999999999', 'ATIVAR-TEST | Maria | Salão | Corte | 09:00-18:00'),
    ).rejects.toThrow('TERMS_CONSENT_REQUIRED');
  });

  it('should throw TERMS_CONSENT_REQUIRED when termsAccepted is explicitly false', async () => {
    const service = new ActivationService(
      createMockActivationRepo() as any,
      createMockUserRepo() as any,
      createMockOnboardingRepo() as any,
      createMockAi() as any,
      createMockTermsConsentService() as any,
    );

    await expect(
      service.activateUser('ATIVAR-TEST', '5511999999999', 'ATIVAR-TEST | Maria', false),
    ).rejects.toThrow('TERMS_CONSENT_REQUIRED');
  });

  it('should activate successfully when termsAccepted is true', async () => {
    const termsService = createMockTermsConsentService();
    const userRepo = createMockUserRepo();
    const service = new ActivationService(
      createMockActivationRepo() as any,
      userRepo as any,
      createMockOnboardingRepo() as any,
      createMockAi() as any,
      termsService as any,
    );

    const user = await service.activateUser(
      'ATIVAR-TEST', '5511999999999', 'ATIVAR-TEST | Maria | Salão | Corte | 09:00-18:00', true,
    );

    expect(user).toBeDefined();
    expect(user.id).toBe('user-123');
    expect(termsService.recordConsent).toHaveBeenCalledWith('user-123', '1.0.0');
  });

  it('should activate without consent check when termsConsentService is not provided', async () => {
    const userRepo = createMockUserRepo();
    const service = new ActivationService(
      createMockActivationRepo() as any,
      userRepo as any,
      createMockOnboardingRepo() as any,
      createMockAi() as any,
      // No termsConsentService
    );

    const user = await service.activateUser(
      'ATIVAR-TEST', '5511999999999', 'ATIVAR-TEST | Maria | Salão | Corte | 09:00-18:00',
    );

    expect(user).toBeDefined();
    expect(user.id).toBe('user-123');
  });

  it('should record consent with CURRENT_TERMS_VERSION after successful activation', async () => {
    const termsService = createMockTermsConsentService();
    const service = new ActivationService(
      createMockActivationRepo() as any,
      createMockUserRepo() as any,
      createMockOnboardingRepo() as any,
      createMockAi() as any,
      termsService as any,
    );

    await service.activateUser(
      'ATIVAR-TEST', '5511999999999', 'ATIVAR-TEST | Maria | Salão | Corte | 09:00-18:00', true,
    );

    expect(termsService.recordConsent).toHaveBeenCalledTimes(1);
    expect(termsService.recordConsent).toHaveBeenCalledWith('user-123', '1.0.0');
  });
});

/**
 * Regressão encontrada no E2E de qualidade (cenário `onboarding`).
 *
 * A IA pode responder JSON válido mas SEM os campos extraídos. O onboarding
 * então começava sem nome, e a Cleo saudava "Oi, Carla Mendes!" e em seguida
 * perguntava "como posso te chamar?" — quebra de contexto na primeira conversa.
 */
describe('ActivationService — extração do formato ATIVAR-XXXX | ...', () => {
  const MESSAGE = 'ATIVAR-D29R | Carla Mendes | Salão de beleza | Corte e manicure | Seg-Sex 9h-18h';

  function buildService(aiResponse: string) {
    const onboardingRepo = createMockOnboardingRepo();
    const ai = { generateContent: vi.fn().mockResolvedValue(aiResponse) };
    const service = new ActivationService(
      createMockActivationRepo() as any,
      createMockUserRepo() as any,
      onboardingRepo as any,
      ai as any,
    );
    return { service, onboardingRepo };
  }

  it('falls back to the deterministic parser when the AI returns empty fields', async () => {
    const { service, onboardingRepo } = buildService(JSON.stringify({
      nome: '', negocio: '', servicos: '', horario_inicio: '', horario_fim: '',
    }));

    await service.activateUser('ATIVAR-D29R', '5548999100000', MESSAGE, true);

    const savedData = onboardingRepo.create.mock.calls[0][2];
    expect(savedData.nome).toBe('Carla Mendes');
    expect(savedData.negocio).toBe('Salão de beleza');
    expect(savedData.servicos).toBe('Corte e manicure');
    expect(savedData.horario_inicio).toBe('09:00');
    expect(savedData.horario_fim).toBe('18:00');
  });

  it('falls back to the deterministic parser when the AI throws', async () => {
    const onboardingRepo = createMockOnboardingRepo();
    const ai = { generateContent: vi.fn().mockRejectedValue(new Error('AI offline')) };
    const svc = new ActivationService(
      createMockActivationRepo() as any,
      createMockUserRepo() as any,
      onboardingRepo as any,
      ai as any,
    );

    await svc.activateUser('ATIVAR-D29R', '5548999100000', MESSAGE, true);

    const savedData = onboardingRepo.create.mock.calls[0][2];
    expect(savedData.nome).toBe('Carla Mendes');
    expect(savedData.negocio).toBe('Salão de beleza');
  });

  it('prefers the AI result when it extracted data', async () => {
    const { service, onboardingRepo } = buildService(JSON.stringify({
      nome: 'Carla', negocio: 'Salão', servicos: 'Corte', horario_inicio: '10:00', horario_fim: '19:00',
    }));

    await service.activateUser('ATIVAR-D29R', '5548999100000', MESSAGE, true);

    const savedData = onboardingRepo.create.mock.calls[0][2];
    expect(savedData.horario_inicio).toBe('10:00');
    expect(savedData.horario_fim).toBe('19:00');
  });
});
