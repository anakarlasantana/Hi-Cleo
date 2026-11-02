import { eq } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { onboardingStates, users } from '../../shared/schema.js';
import type { OnboardingRepository } from './onboarding.port.js';
import type { OnboardingState, OnboardingStep } from '../../shared/types/index.js';

export class DrizzleOnboardingRepository implements OnboardingRepository {
  async getState(userId: string): Promise<OnboardingState | null> {
    const [data] = await db
      .select()
      .from(onboardingStates)
      .where(eq(onboardingStates.userId, userId))
      .limit(1);

    return (data as unknown as OnboardingState) || null;
  }

  async updateStep(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void> {
    await db
      .update(onboardingStates)
      .set({ step, data, updatedAt: new Date() })
      .where(eq(onboardingStates.userId, userId));
  }

  async create(userId: string, step: OnboardingStep, data: Record<string, string>): Promise<void> {
    await db.insert(onboardingStates).values({ userId, step, data });
  }

  async getUserDisplayName(userId: string): Promise<string> {
    const [row] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const name = (row?.name || '').trim();
    // Telefone não serve como nome de tratamento
    if (!name || /^\+?\d[\d\s-]*$/.test(name)) return '';
    return name;
  }
}
