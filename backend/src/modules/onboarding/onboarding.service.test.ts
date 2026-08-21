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

  /**
   * Mock de IA que simula o comportamento real: retorna JSON correto por step.
   * O prompt enviado para generateContent contém o step name, então usamos isso
   * para retornar a resposta adequada baseada na mensagem do usuário.
   */
  const aiMock = {
    generateContent: async (prompts: string[]) => {
      const systemPrompt = prompts[0] || '';
      const userMessage = prompts[1] || '';

      // Extrair a mensagem real do usuário (remove o wrapper "Resposta do usuário: ")
      const msgMatch = userMessage.match(/Resposta do usuário: "(.+)"/);
      const msg = msgMatch ? msgMatch[1] : userMessage;
      const lower = msg.toLowerCase();

      // confirm_name
      if (systemPrompt.includes('Step: nome/apelido')) {
        if (msg.length < 2) return JSON.stringify({ valid: false, extractedData: {}, retryMessage: 'Me diz seu nome!' });
        return JSON.stringify({ valid: true, extractedData: { nome_confirmado: msg.trim() } });
      }

      // business_type
      if (systemPrompt.includes('Step: profissão/negócio')) {
        if (msg.length < 3) return JSON.stringify({ valid: false, extractedData: {}, retryMessage: 'Me conta o que você faz!' });
        return JSON.stringify({ valid: true, extractedData: { negocio: msg.trim() } });
      }

      // target_audience
      if (systemPrompt.includes('Step: público-alvo')) {
        return JSON.stringify({ valid: true, extractedData: { publico_alvo: msg.trim() } });
      }

      // tone_of_voice
      if (systemPrompt.includes('Step: tom de comunicação')) {
        if (lower === '1' || lower.includes('formal')) {
          return JSON.stringify({ valid: true, extractedData: { tom_de_voz: 'formal' } });
        }
        if (lower === '2' || lower.includes('descontraíd') || lower.includes('profissional')) {
          return JSON.stringify({ valid: true, extractedData: { tom_de_voz: 'friendly_professional' } });
        }
        if (lower === '3' || lower.includes('informal')) {
          return JSON.stringify({ valid: true, extractedData: { tom_de_voz: 'casual' } });
        }
        return JSON.stringify({ valid: false, extractedData: {}, retryMessage: 'Escolhe 1, 2 ou 3!' });
      }

      // business_hours
      if (systemPrompt.includes('Step: dias da semana')) {
        const timePattern = /(\d{1,2})[:h]?(\d{2})?\s*[-aàáeé]+\s*(\d{1,2})[:h]?(\d{2})?/i;
        const match = msg.match(timePattern);
        if (match) {
          return JSON.stringify({
            valid: true,
            extractedData: {
              horario_inicio: `${match[1].padStart(2, '0')}:${match[2] || '00'}`,
              horario_fim: `${match[3].padStart(2, '0')}:${match[4] || '00'}`,
              horario_descricao: msg.trim(),
            },
          });
        }
        return JSON.stringify({ valid: false, extractedData: {}, retryMessage: 'Me diz o horário!' });
      }

      // outside_hours_behavior
      if (systemPrompt.includes('Step: comportamento fora do horário')) {
        if (lower === '2' || lower.includes('não respond')) {
          return JSON.stringify({ valid: true, extractedData: { fora_horario: 'silent' } });
        }
        return JSON.stringify({ valid: true, extractedData: { fora_horario: 'notify', fora_horario_mensagem: '' } });
      }

      // confirm_summary
      if (systemPrompt.includes('Step: confirmação de resumo')) {
        const confirms = ['ok', 'sim', 'confirma', 'perfeito', 'bom', 'isso'];
        const isConfirm = confirms.some(w => lower.includes(w));
        return JSON.stringify({ valid: true, extractedData: { confirmed: isConfirm ? 'true' : 'false' } });
      }

      // Default
      return JSON.stringify({ valid: true, extractedData: {} });
    },
  };

  beforeEach(() => {
    onboardingRepo = new InMemoryOnboardingRepository();
    ruleRepo = new InMemoryRuleRepository();
    service = new OnboardingService(onboardingRepo, ruleRepo, aiMock);
  });

  describe('confirm_name step', () => {
    it('asks about business type after confirming name', async () => {
      onboardingRepo.seed('user-1', {
        id: 'state-1', user_id: 'user-1', step: 'confirm_name',
        data: {}, updated_at: '2025-01-01T00:00:00Z',
      });

      const response = await service.processMessage('user-1', 'João');

      expect(response).toContain('João');
      expect(response.toLowerCase()).toContain('me conta o que você faz');
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

      expect(response.toLowerCase()).toContain('quem são seus clientes');
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

      expect(response).toContain('salvas');
      expect(response).toContain('/conectar');
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

      // Edição parcial: volta apenas para o step do horário, não reseta tudo
      expect(response).toContain('horário');
      const state = await onboardingRepo.getState('user-1');
      expect(state?.step).toBe('business_hours');
      expect(state?.data._editing).toBe('true');
      // Dados anteriores preservados
      expect(state?.data.negocio).toBe('Corretor');
      expect(state?.data.publico_alvo).toBe('Casais');
    });
  });
});
