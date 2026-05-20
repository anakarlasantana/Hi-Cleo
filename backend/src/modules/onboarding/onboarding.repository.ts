import { supabase } from '../../shared/config/supabase.js';
import type { OnboardingRepository } from './onboarding.port.js';
import type { OnboardingState, OnboardingStep } from '../../shared/types/index.js';

export class SupabaseOnboardingRepository implements OnboardingRepository {
  async getState(userId: string): Promise<OnboardingState | null> {
    const { data } = await supabase
      .from('onboarding_states')
      .select('*')
      .eq('user_id', userId)
      .single();

    return (data as OnboardingState) || null;
  }

  async updateStep(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void> {
    await supabase
      .from('onboarding_states')
      .update({ step, data, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  }

  async create(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void> {
    await supabase.from('onboarding_states').insert({ user_id: userId, step, data });
  }
}
