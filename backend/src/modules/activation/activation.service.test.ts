import { describe, it, expect, vi } from 'vitest';
import { ActivationService } from './activation.service.js';

function createMockActivationRepo() {
  return {
    createCode: vi.fn(),
    findValidCode: vi.fn().mockResolvedValue({ code: 'ATIVAR-TEST', plano: 'solo', used: false }),
    markUsed: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockUserRepo() {
  return {
    create: vi.fn().mockResolvedValue({
      id: 'user-123',
      nome: 'Maria',
      telefone: '5511999999999',
      plano: 'solo',
    }),
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
