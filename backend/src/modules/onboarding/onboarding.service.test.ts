import { describe, it, expect, beforeEach } from 'vitest';
import { OnboardingService } from './onboarding.service.js';
import type { OnboardingRepository } from './onboarding.port.js';
import type { RuleRepository } from '../rules/rules.port.js';
import type { OnboardingState, OnboardingStep, Rule } from '../../shared/types/index.js';

const PIN_MESSAGE = "💡 Dica: Fixe a Cleo no topo do seu WhatsApp para nunca perder uma mensagem! Segure a conversa e toque em 'Fixar'. Assim ela fica sempre acessível.";

/**
 * In-memory implementation of OnboardingRepository for testing.
 */
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

  // Helper for tests
  seed(userId: string, state: OnboardingState): void {
    this.states.set(userId, state);
  }
}

/**
 * In-memory implementation of RuleRepository for testing.
 */
class InMemoryRuleRepository implements RuleRepository {
  private rules: Rule[] = [];

  async listActive(userId: string): Promise<Rule[]> {
    return this.rules.filter((r) => r.user_id === userId && r.active);
  }

  async create(userId: string, condition: string, response: string): Promise<Rule> {
    const rule: Rule = {
      id: crypto.randomUUID(),
      user_id: userId,
      condition,
      response,
      active: true,
    };
    this.rules.push(rule);
    return rule;
  }

  async insertMany(rules: Array<{ user_id: string; condition: string; response: string; active: boolean }>): Promise<void> {
    for (const r of rules) {
      this.rules.push({
        id: crypto.randomUUID(),
        user_id: r.user_id,
        condition: r.condition,
        response: r.response,
        active: r.active,
      });
    }
  }
}

describe('OnboardingService - Pin Message', () => {
  let onboardingRepo: InMemoryOnboardingRepository;
  let ruleRepo: InMemoryRuleRepository;
  let service: OnboardingService;

  beforeEach(() => {
    onboardingRepo = new InMemoryOnboardingRepository();
    ruleRepo = new InMemoryRuleRepository();
    service = new OnboardingService(onboardingRepo, ruleRepo);
  });

  describe('handleForaHorario - pin message on completion', () => {
    it('includes pin message when onboarding completes for the first time', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'João', boas_vindas: 'ativa' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', '1');

      expect(response).toContain(PIN_MESSAGE);
    });

    it('does not include pin message if already sent (pin_message_sent flag is true)', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'João', boas_vindas: 'ativa', pin_message_sent: 'true' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', '1');

      expect(response).not.toContain(PIN_MESSAGE);
    });

    it('stores pin_message_sent flag in state data after sending', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'João', boas_vindas: 'desativada' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      await service.processMessage('user-1', '2');

      const state = await onboardingRepo.getState('user-1');
      expect(state?.data.pin_message_sent).toBe('true');
    });

    it('transitions to concluido step after handling fora_horario', async () => {
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

    it('pin message uses the exact required text from requirements', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1',
        user_id: 'user-1',
        step: 'configurar_fora_horario',
        data: { nome_confirmado: 'Ana', boas_vindas: 'desativada' },
        updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', '2');

      expect(response).toContain("💡 Dica: Fixe a Cleo no topo do seu WhatsApp para nunca perder uma mensagem! Segure a conversa e toque em 'Fixar'. Assim ela fica sempre acessível.");
    });
  });
});
