import type { OnboardingState, OnboardingStep } from '../../shared/types/index.js';

export interface OnboardingRepository {
  getState(userId: string): Promise<OnboardingState | null>;
  updateStep(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void>;
  create(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void>;
}
