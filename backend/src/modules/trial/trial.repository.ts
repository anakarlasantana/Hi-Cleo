import { eq, and, ne, gte, desc, count, sql } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { trialAttempts, users } from '../../shared/schema.js';
import type { TrialRepository, TrialAttempt, CreateTrialAttemptData } from './trial.port.js';

export class DrizzleTrialRepository implements TrialRepository {
  /**
   * Converte a linha do Drizzle (camelCase) para o formato do port (snake_case).
   *
   * Sem isso, `trialAttempt.prospection_status` vinha `undefined` — a Cleo nunca
   * entrava no fluxo de prospecção (o E2E respondia como se fosse comando de
   * dono) e qualquer leitura de `responses_used`/`trial_user_id` também falhava.
   */
  private toTrialAttempt(row: typeof trialAttempts.$inferSelect): TrialAttempt {
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email ?? null,
      email_normalized: row.emailNormalized ?? null,
      business_type: row.businessType ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      referral_source: row.referralSource ?? null,
      ip_address: row.ipAddress ?? null,
      device_fingerprint: row.deviceFingerprint ?? null,
      user_agent: row.userAgent ?? null,
      status: (row.status ?? 'started') as TrialAttempt['status'],
      blocked_reason: row.blockedReason ?? null,
      trial_user_id: row.trialUserId ?? null,
      responses_used: row.responsesUsed ?? 0,
      leads_captured: row.leadsCaptured ?? 0,
      whatsapp_connected: row.whatsappConnected ?? false,
      onboarding_completed: row.onboardingCompleted ?? false,
      last_activity_at: row.lastActivityAt?.toISOString() ?? null,
      prospection_attempts: row.prospectionAttempts ?? 0,
      last_prospection_at: row.lastProspectionAt?.toISOString() ?? null,
      prospection_status: (row.prospectionStatus ?? 'pending') as TrialAttempt['prospection_status'],
      created_at: row.createdAt?.toISOString() ?? '',
      activated_at: row.activatedAt?.toISOString() ?? null,
      expired_at: row.expiredAt?.toISOString() ?? null,
      converted_at: row.convertedAt?.toISOString() ?? null,
    };
  }

  async create(data: CreateTrialAttemptData): Promise<TrialAttempt> {
    const [attempt] = await db
      .insert(trialAttempts)
      .values({
        name: data.name,
        phone: data.phone,
        ipAddress: data.ip_address || null,
        userAgent: data.user_agent || null,
      })
      .returning();

    if (!attempt) throw new Error('Erro ao criar trial attempt');
    return this.toTrialAttempt(attempt);
  }

  async findByPhone(phone: string): Promise<TrialAttempt | null> {
    const [data] = await db
      .select()
      .from(trialAttempts)
      .where(and(eq(trialAttempts.phone, phone), ne(trialAttempts.status, 'blocked')))
      .orderBy(desc(trialAttempts.createdAt))
      .limit(1);

    return data ? this.toTrialAttempt(data) : null;
  }

  async findRecentByPhone(phone: string, withinDays: number): Promise<TrialAttempt | null> {
    const since = new Date();
    since.setDate(since.getDate() - withinDays);

    const [data] = await db
      .select()
      .from(trialAttempts)
      .where(
        and(
          eq(trialAttempts.phone, phone),
          ne(trialAttempts.status, 'blocked'),
          gte(trialAttempts.createdAt, since),
        ),
      )
      .orderBy(desc(trialAttempts.createdAt))
      .limit(1);

    return data ? this.toTrialAttempt(data) : null;
  }

  async findRecentByIp(ip: string, withinHours: number): Promise<number> {
    const since = new Date();
    since.setHours(since.getHours() - withinHours);

    const [result] = await db
      .select({ count: count() })
      .from(trialAttempts)
      .where(and(eq(trialAttempts.ipAddress, ip), gte(trialAttempts.createdAt, since)));

    return result?.count || 0;
  }

  async findByDeviceFingerprint(fingerprint: string): Promise<TrialAttempt | null> {
    const [data] = await db
      .select()
      .from(trialAttempts)
      .where(and(eq(trialAttempts.deviceFingerprint, fingerprint), ne(trialAttempts.status, 'blocked')))
      .orderBy(desc(trialAttempts.createdAt))
      .limit(1);

    return data ? this.toTrialAttempt(data) : null;
  }

  async updateStatus(id: string, status: TrialAttempt['status'], fields?: Record<string, unknown>): Promise<void> {
    const update: Record<string, unknown> = { status, ...fields };
    await db
      .update(trialAttempts)
      .set(update)
      .where(eq(trialAttempts.id, id));
  }

  async updateProspectionStatus(id: string, status: TrialAttempt['prospection_status']): Promise<void> {
    await db
      .update(trialAttempts)
      .set({ prospectionStatus: status, lastProspectionAt: new Date() })
      .where(eq(trialAttempts.id, id));
  }

  async linkUser(id: string, userId: string): Promise<void> {
    await db
      .update(trialAttempts)
      .set({ trialUserId: userId, status: 'activated', activatedAt: new Date() })
      .where(eq(trialAttempts.id, id));
  }

  async incrementResponses(userId: string): Promise<number> {
    // Increment trial_responses_used atomically on the user
    const [user] = await db
      .update(users)
      .set({ trialResponsesUsed: sql`${users.trialResponsesUsed} + 1` })
      .where(eq(users.id, userId))
      .returning({ trialResponsesUsed: users.trialResponsesUsed });

    const next = user?.trialResponsesUsed || 1;

    // Update also on trial_attempts
    await db
      .update(trialAttempts)
      .set({ responsesUsed: next, lastActivityAt: new Date() })
      .where(eq(trialAttempts.trialUserId, userId));

    return next;
  }
}
