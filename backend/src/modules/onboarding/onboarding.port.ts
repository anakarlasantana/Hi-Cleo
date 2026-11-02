import type { OnboardingState, OnboardingStep } from '../../shared/types/index.js';

export interface OnboardingRepository {
  getState(userId: string): Promise<OnboardingState | null>;
  updateStep(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void>;
  create(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void>;
  /**
   * Nome de tratamento já conhecido do perfil (criado no pagamento/trial).
   * Usado para não perguntar o nome logo após cumprimentar a pessoa por ele.
   * Retorna '' quando não há nome utilizável (ex: campo vazio ou só telefone).
   */
  getUserDisplayName(userId: string): Promise<string>;
}
