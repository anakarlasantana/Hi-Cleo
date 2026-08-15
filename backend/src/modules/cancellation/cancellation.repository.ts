import { eq, and, desc, lte, isNull, inArray } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { cancellations, users, whatsappSessions, messages, leads, followUps, rules } from '../../shared/schema.js';
import type { Cancellation, CancellationRepository, UserSubscription } from './cancellation.port.js';

export class DrizzleCancellationRepository implements CancellationRepository {
  async getCancellation(userId: string): Promise<Cancellation | null> {
    const [data] = await db
      .select()
      .from(cancellations)
      .where(eq(cancellations.userId, userId))
      .orderBy(desc(cancellations.cancelledAt))
      .limit(1);

    return (data as unknown as Cancellation) || null;
  }

  async insertCancellation(
    userId: string,
    accessUntil: Date,
    refundEligible: boolean,
  ): Promise<Cancellation> {
    const [data] = await db
      .insert(cancellations)
      .values({
        userId,
        accessUntil,
        refundEligible,
      })
      .returning();

    if (!data) throw new Error('Erro ao registrar cancelamento');
    return data as unknown as Cancellation;
  }

  async markReactivated(userId: string, reactivatedAt: Date): Promise<void> {
    // Get the most recent non-reactivated cancellation for the user
    const [latestCancellation] = await db
      .select({ id: cancellations.id })
      .from(cancellations)
      .where(and(eq(cancellations.userId, userId), isNull(cancellations.reactivatedAt)))
      .orderBy(desc(cancellations.cancelledAt))
      .limit(1);

    if (latestCancellation) {
      await db
        .update(cancellations)
        .set({ reactivatedAt })
        .where(eq(cancellations.id, latestCancellation.id));
    }
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const [data] = await db
      .select({
        id: users.id,
        subscription_status: users.subscriptionStatus,
        subscription_started_at: users.subscriptionStartedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return (data as unknown as UserSubscription) || null;
  }

  async updateSubscriptionStatus(userId: string, status: string): Promise<void> {
    await db
      .update(users)
      .set({ subscriptionStatus: status })
      .where(eq(users.id, userId));
  }

  async disconnectAllSessions(userId: string): Promise<void> {
    await db
      .update(whatsappSessions)
      .set({ status: 'disconnected' })
      .where(and(eq(whatsappSessions.userId, userId), eq(whatsappSessions.status, 'active')));
  }

  async findExpiredSubscriptions(): Promise<Cancellation[]> {
    const now = new Date();
    const data = await db
      .select()
      .from(cancellations)
      .where(and(isNull(cancellations.reactivatedAt), lte(cancellations.accessUntil, now)));

    // Filter to only users still in 'cancelled' status (not yet 'expired')
    const results: Cancellation[] = [];
    for (const record of data) {
      const sub = await this.getUserSubscription(record.userId as string);
      if (sub && sub.subscription_status === 'cancelled') {
        results.push(record as unknown as Cancellation);
      }
    }
    return results;
  }

  async findPastGracePeriod(graceDays: number): Promise<Cancellation[]> {
    const graceDate = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
    const data = await db
      .select()
      .from(cancellations)
      .where(and(isNull(cancellations.reactivatedAt), lte(cancellations.accessUntil, graceDate)));

    // Filter to only users in 'expired' status (not yet purged)
    const results: Cancellation[] = [];
    for (const record of data) {
      const sub = await this.getUserSubscription(record.userId as string);
      if (sub && sub.subscription_status === 'expired') {
        results.push(record as unknown as Cancellation);
      }
    }
    return results;
  }

  async purgeUserData(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Get all lead IDs for this user to delete their messages
      const userLeads = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.userId, userId));

      if (userLeads.length > 0) {
        const leadIds = userLeads.map((l) => l.id);
        await tx.delete(messages).where(inArray(messages.leadId, leadIds));
      }

      await tx.delete(leads).where(eq(leads.userId, userId));
      await tx.delete(followUps).where(eq(followUps.userId, userId));
      await tx.delete(rules).where(eq(rules.userId, userId));
      await tx.delete(whatsappSessions).where(eq(whatsappSessions.userId, userId));
      await tx.delete(cancellations).where(eq(cancellations.userId, userId));
    });

    await this.updateSubscriptionStatus(userId, 'purged');
  }
}
