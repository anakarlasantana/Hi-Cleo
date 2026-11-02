import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { activationCodes, users, businesses } from '../../shared/schema.js';
import type {
  ActivationRepository,
  UserRepository,
} from './activation.port.js';
import type { ActivationCode, User, Business } from '../../shared/types/index.js';

export class DrizzleActivationRepository implements ActivationRepository {
  async createCode(
    code: string,
    plan: string,
    paymentId: string,
    expiresAt: Date,
    userId?: string,
    userEmail?: string,
  ): Promise<ActivationCode> {
    const insertData: Record<string, unknown> = {
      code,
      plan,
      paymentId,
      used: false,
      expiresAt,
    };

    if (userId) insertData.userId = userId;
    if (userEmail) insertData.userEmail = userEmail;

    const [data] = await db
      .insert(activationCodes)
      .values(insertData as typeof activationCodes.$inferInsert)
      .returning();

    if (!data) throw new Error('Erro ao gerar código');
    return data as unknown as ActivationCode;
  }

  async findValidCode(code: string): Promise<ActivationCode | null> {
    const [data] = await db
      .select()
      .from(activationCodes)
      .where(and(eq(activationCodes.code, code.toUpperCase()), eq(activationCodes.used, false)))
      .limit(1);

    if (!data) return null;
    if (new Date(data.expiresAt) < new Date()) return null;

    return data as unknown as ActivationCode;
  }

  async findCodeByValue(code: string): Promise<ActivationCode | null> {
    const [data] = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.code, code.toUpperCase()))
      .limit(1);

    if (!data) return null;
    return data as unknown as ActivationCode;
  }

  async findByUserId(userId: string): Promise<ActivationCode | null> {
    const [data] = await db
      .select()
      .from(activationCodes)
      .where(eq(activationCodes.userId, userId))
      .orderBy(desc(activationCodes.createdAt))
      .limit(1);

    return (data as unknown as ActivationCode) || null;
  }

  async markUsed(code: string, userId: string): Promise<void> {
    await db
      .update(activationCodes)
      .set({ used: true, usedBy: userId, activatedAt: new Date() })
      .where(eq(activationCodes.code, code.toUpperCase()));
  }
}

export class DrizzleUserRepository implements UserRepository {
  /**
   * Converte a linha do Drizzle (camelCase) para o tipo `User` (snake_case).
   *
   * Sem isso, `user.subscription_status` e `user.trial_responses_used` vinham
   * undefined: o guard do TRIAL (limite de 30 respostas / 7 dias) nunca rodava e
   * as métricas `leads_captured`/`whatsapp_connected` ficavam zeradas.
   */
  private toUser(row: typeof users.$inferSelect): User {
    return {
      id: row.id,
      name: row.name,
      plan: row.plan ?? 'solo',
      phone: row.phone,
      email: row.email,
      subscription_status: row.subscriptionStatus ?? undefined,
      subscription_started_at: row.subscriptionStartedAt?.toISOString(),
      subscription_expires_at: row.subscriptionExpiresAt?.toISOString(),
      billing_period: row.billingPeriod ?? undefined,
      payment_provider_id: row.paymentProviderId ?? undefined,
      max_connections_override: row.maxConnectionsOverride ?? null,
      owner_user_id: row.ownerUserId ?? null,
      trial_started_at: row.trialStartedAt?.toISOString() ?? null,
      trial_responses_used: row.trialResponsesUsed ?? 0,
      trial_responses_limit: row.trialResponsesLimit ?? undefined,
      trial_attempt_id: row.trialAttemptId ?? null,
      created_at: row.createdAt?.toISOString() ?? '',
    };
  }

  async findByPhone(phone: string): Promise<User | null> {
    const [data] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    return data ? this.toUser(data) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const [data] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return data ? this.toUser(data) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [data] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return data ? this.toUser(data) : null;
  }

  async create(userData: Partial<User>): Promise<User> {
    const [data] = await db
      .insert(users)
      .values(userData as typeof users.$inferInsert)
      .returning();

    if (!data) throw new Error('Erro ao criar usuário');
    return this.toUser(data);
  }

  async complementUser(userId: string, complementData: { phone: string; name: string }): Promise<User> {
    const [data] = await db
      .update(users)
      .set(complementData)
      .where(eq(users.id, userId))
      .returning();

    if (!data) throw new Error('Erro ao complementar usuário');
    return this.toUser(data);
  }

  async listAll(): Promise<User[]> {
    const data = await db.select().from(users);
    return data.map((row) => this.toUser(row));
  }

  async createBusiness(
    userId: string,
    businessData: {
      name?: string;
      services?: string;
      target_audience?: string;
      tone_of_voice?: string;
      business_hours_start?: string;
      business_hours_end?: string;
    },
  ): Promise<void> {
    // Idempotente: activation (código manual) e onboarding criam o perfil do
    // mesmo usuário — usar onConflict garante uma linha só por user_id e evita
    // erro de constraint quando os dois caminhos rodam.
    await db.insert(businesses).values({
      userId,
      name: businessData.name,
      services: businessData.services,
      targetAudience: businessData.target_audience,
      toneOfVoice: businessData.tone_of_voice,
      businessHoursStart: businessData.business_hours_start,
      businessHoursEnd: businessData.business_hours_end,
    }).onConflictDoUpdate({
      target: businesses.userId,
      set: {
        name: businessData.name,
        services: businessData.services,
        targetAudience: businessData.target_audience,
        ...(businessData.tone_of_voice ? { toneOfVoice: businessData.tone_of_voice } : {}),
        businessHoursStart: businessData.business_hours_start,
        businessHoursEnd: businessData.business_hours_end,
      },
    });
  }

  async getBusiness(userId: string): Promise<Business | null> {
    const [data] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.userId, userId))
      .limit(1);

    return (data as unknown as Business) || null;
  }
}
