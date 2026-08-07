import { describe, it, expect, beforeEach } from 'vitest';
import { OnboardingService } from './onboarding.service.js';
import type { OnboardingRepository } from './onboarding.port.js';
import type { RuleRepository } from '../rules/rules.port.js';
import type { OnboardingState, OnboardingStep, Rule } from '../../shared/types/index.js';

class InMemoryOnboardingRepository implements OnboardingRepository {
  private states: Map<string, OnboardingState> = new Map();

  async getState(userId: string): Promise<OnboardingState | null> {
    return this.states.get(userId) || null;
  }

  async updateStep(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void> {
    const existing = this.states.get(userId);
    if (existing) {
      this.states.set(userId, { ...existing, step, data, updated_at: new Date().toISOString() });
    }
  }

  async create(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void> {
    this.states.set(userId, {
      id: crypto.randomUUID(),
      user_id: userId,
      step,
      data,
      updated_at: new Date().toISOString(),
    });
  }

  seed(userId: string, state: OnboardingState): void {
    this.states.set(userId, state);
  }
}

class InMemoryRuleRepository implements RuleRepository {
  private rules: Rule[] = [];

  async listActive(userId: string): Promise<Rule[]> {
    return this.rules.filter((r) => r.user_id === userId && r.active);
  }

  async create(userId: string, condition: string, response: string): Promise<Rule> {
    const rule: Rule = { id: crypto.randomUUID(), user_id: userId, condition, response, active: true };
    this.rules.push(rule);
    return rule;
  }

  async insertMany(rules: Array<{ user_id: string; condition: string; response: string; active: boolean }>): Promise<void> {
    for (const r of rules) {
      this.rules.push({ id: crypto.randomUUID(), ...r });
    }
  }
}

describe('OnboardingService', () => {
  let onboardingRepo: InMemoryOnboardingRepository;
  let ruleRepo: InMemoryRuleRepository;
  let service: OnboardingService;

  beforeEach(() => {
    onboardingRepo = new InMemoryOnboardingRepository();
    ruleRepo = new InMemoryRuleRepository();
    service = new OnboardingService(onboardingRepo, ruleRepo, { generateContent: async () => '{"valid": true, "extractedData": {"nome_confirmado": "test"}}' });
  });

  describe('confirm_name step', () => {
    it('asks about business type after confirming name', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'confirm_name',
        data: {}, updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', 'João');

      expect(response).toContain('João');
      expect(response).toContain('me conta o que você faz');
      const state = await onboardingRepo.getState('user-1');
      expect(state?.step).toBe('business_type');
    });
  });

  describe('business_type step', () => {
    it('asks about target audience after business type', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'business_type',
        data: { nome_confirmado: 'João' }, updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', 'Corretor de imóveis, venda e aluguel');

      expect(response).toContain('quem são seus clientes');
      const state = await onboardingRepo.getState('user-1');
      expect(state?.step).toBe('target_audience');
      expect(state?.data.negocio).toBe('Corretor de imóveis, venda e aluguel');
    });
  });

  describe('tone_of_voice step', () => {
    it('parses option 1 as formal', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'tone_of_voice',
        data: { nome_confirmado: 'João', negocio: 'Corretor', publico_alvo: 'Casais' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      await service.processMessage('user-1', '1');

      const state = await onboardingRepo.getState('user-1');
      expect(state?.data.tom_de_voz).toBe('formal');
    });

    it('parses option 2 as friendly_professional', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'tone_of_voice',
        data: { nome_confirmado: 'João', negocio: 'Corretor', publico_alvo: 'Casais' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      await service.processMessage('user-1', '2');

      const state = await onboardingRepo.getState('user-1');
      expect(state?.data.tom_de_voz).toBe('friendly_professional');
    });
  });

  describe('business_hours step', () => {
    it('parses time range from message', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'business_hours',
        data: { nome_confirmado: 'João', negocio: 'Corretor', publico_alvo: 'Casais', tom_de_voz: 'friendly_professional' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      await service.processMessage('user-1', 'Seg-Sáb 8h-20h');

      const state = await onboardingRepo.getState('user-1');
      expect(state?.data.horario_inicio).toBe('08:00');
      expect(state?.data.horario_fim).toBe('20:00');
    });
  });

  describe('confirm_summary step', () => {
    it('completes onboarding on confirmation', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'confirm_summary',
        data: {
          nome_confirmado: 'João', negocio: 'Corretor', publico_alvo: 'Casais',
          tom_de_voz: 'friendly_professional', horario_inicio: '08:00', horario_fim: '18:00',
          fora_horario: 'notify', fora_horario_mensagem: '',
        },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', 'ok');

      expect(response).toContain('configurado');
      expect(response).toContain('QR Code');
      expect(response).toContain('Dispositivos Vinculados');
      const state = await onboardingRepo.getState('user-1');
      expect(state?.step).toBe('completed');
    });

    it('restarts if user wants to adjust', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'confirm_summary',
        data: { nome_confirmado: 'João', negocio: 'Corretor', publico_alvo: 'Casais', tom_de_voz: 'formal', horario_inicio: '08:00', horario_fim: '18:00', fora_horario: 'notify', fora_horario_mensagem: '' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', 'quero mudar o horário');

      expect(response).toContain('refazer');
      const state = await onboardingRepo.getState('user-1');
      expect(state?.step).toBe('business_type');
    });
  });
});
