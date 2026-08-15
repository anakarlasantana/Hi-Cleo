import { eq, and, gte, lte, lt, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { users, whatsappSessions, subscriptionEvents } from '../../shared/schema.js';
import type { SubscriptionRepository, ExpiringSubscription, ExpiredSubscription, SubscriptionEvent } from './subscription.port.js';

export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  async updateFields(userId: string, fields: Record<string, unknown>): Promise<void> {
    await db
      .update(users)
      .set(fields)
      .where(eq(users.id, userId));
  }

  async getUserByEmail(email: string): Promise<{ id: string; phone: string; plan: string } | null> {
    const [data] = await db
      .select({ id: users.id, phone: users.phone, plan: users.plan })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!data || !data.phone) return null;
    return { id: data.id, phone: data.phone, plan: data.plan };
  }

  async getUserSubscriptionExpiry(userId: string): Promise<string | null> {
    const [data] = await db
      .select({ subscriptionExpiresAt: users.subscriptionExpiresAt })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.subscriptionStatus, 'active')))
      .limit(1);

    return data?.subscriptionExpiresAt?.toISOString() || null;
  }

  async getExpiringIn(days: number): Promise<ExpiringSubscription[]> {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + days);

    const data = await db
      .select({
        id: users.id,
        phone: users.phone,
        plan: users.plan,
        subscriptionExpiresAt: users.subscriptionExpiresAt,
        billingPeriod: users.billingPeriod,
      })
      .from(users)
      .where(
        and(
          eq(users.subscriptionStatus, 'active'),
          gte(users.subscriptionExpiresAt, now),
          lte(users.subscriptionExpiresAt, future),
        ),
      );

    return data.map((r) => ({
      user_id: r.id,
      phone: r.phone as string,
      plan_name: r.plan,
      subscription_expires_at: r.subscriptionExpiresAt?.toISOString() || '',
      billing_period: r.billingPeriod as 'monthly' | 'yearly',
    }));
  }

  async getTrialExpiringIn(days: number): Promise<ExpiringSubscription[]> {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + days);

    const data = await db
      .select({
        id: users.id,
        phone: users.phone,
        plan: users.plan,
        subscriptionExpiresAt: users.subscriptionExpiresAt,
        billingPeriod: users.billingPeriod,
        trialResponsesUsed: users.trialResponsesUsed,
        trialResponsesLimit: users.trialResponsesLimit,
      })
      .from(users)
      .where(
        and(
          eq(users.subscriptionStatus, 'trial'),
          gte(users.subscriptionExpiresAt, now),
          lte(users.subscriptionExpiresAt, future),
        ),
      );

    return data.map((r) => ({
      user_id: r.id,
      phone: r.phone as string,
      plan_name: r.plan,
      subscription_expires_at: r.subscriptionExpiresAt?.toISOString() || '',
      billing_period: r.billingPeriod as 'monthly' | 'yearly',
      trial_responses_used: r.trialResponsesUsed ?? undefined,
      trial_responses_limit: r.trialResponsesLimit ?? undefined,
    }));
  }

  async getExpired(): Promise<ExpiredSubscription[]> {
    const data = await db
      .select({
        id: users.id,
        paymentProviderId: users.paymentProviderId,
        subscriptionStatus: users.subscriptionStatus,
      })
      .from(users)
      .where(
        and(
          inArray(users.subscriptionStatus, ['active', 'trial']),
          lt(users.subscriptionExpiresAt, new Date()),
        ),
      );

    return data.map((r) => ({
      user_id: r.id,
      payment_provider_id: r.paymentProviderId as string,
      subscription_status: r.subscriptionStatus as string,
    }));
  }

  async createEvent(event: SubscriptionEvent): Promise<void> {
    await db.insert(subscriptionEvents).values({
      userId: event.user_id,
      eventType: event.event_type,
      orderId: event.order_id,
      amountCents: event.amount_cents,
      metadata: event.metadata,
    });
  }

  async getJustExpiredTrials(): Promise<{ user_id: string; phone: string }[]> {
    // Trials que expiraram nas últimas 24h (para notificar uma única vez)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const data = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(
        and(
          eq(users.subscriptionStatus, 'expired'),
          isNotNull(users.phone),
          isNotNull(users.trialStartedAt),
          gte(users.subscriptionExpiresAt, yesterday),
          lte(users.subscriptionExpiresAt, new Date()),
        ),
      );

    return data.map((r) => ({ user_id: r.id, phone: r.phone as string }));
  }

  async disconnectAllSessionsByOwner(userId: string): Promise<number> {
    // Get collaborators linked to the owner
    const collaborators = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.ownerUserId, userId));

    const collaboratorIds = collaborators.map((c) => c.id);
    const allUserIds = [userId, ...collaboratorIds];

    const result = await db
      .update(whatsappSessions)
      .set({ status: 'disconnected', disconnectedAt: new Date() })
      .where(and(inArray(whatsappSessions.userId, allUserIds), eq(whatsappSessions.status, 'active')));

    return result.rowCount || 0;
  }
}
