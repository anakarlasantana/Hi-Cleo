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
    service = new OnboardingService(onboardingRepo, ruleRepo);
  });

  describe('handleForaHorario - completion message', () => {
    it('includes pin message when onboarding completes', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'João', boas_vindas: 'ativa' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', '1');

      expect(response).toContain('Fixe a Cleo no topo do seu WhatsApp');
    });

    it('includes orientation to go back to computer for QR Code', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'João', boas_vindas: 'ativa' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', '1');

      expect(response).toContain('Volte para a tela no seu computador');
    });

    it('transitions to concluido step', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'Maria', boas_vindas: 'ativa' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      await service.processMessage('user-1', '1');

      const state = await onboardingRepo.getState('user-1');
      expect(state?.step).toBe('concluido');
    });

    it('mentions WhatsApp Web comparison', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'Ana', boas_vindas: 'desativada' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', '2');

      expect(response).toContain('WhatsApp Web');
    });
  });
});
