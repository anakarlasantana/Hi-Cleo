import { eq, and, lte, lt, inArray } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { followUps, leads } from '../../shared/schema.js';
import type { FollowUpRepository } from './follow-up.port.js';
import type { FollowUp, Lead } from '../../shared/types/index.js';

export class DrizzleFollowUpRepository implements FollowUpRepository {
  async schedule(leadId: string, userId: string, date: Date): Promise<FollowUp> {
    const [data] = await db
      .insert(followUps)
      .values({ leadId, userId, scheduledAt: date, status: 'pending' })
      .returning();

    if (!data) throw new Error('Erro ao agendar follow-up');
    return data as unknown as FollowUp;
  }

  async cancelForLead(leadId: string): Promise<void> {
    await db
      .update(followUps)
      .set({ status: 'cancelled' })
      .where(and(eq(followUps.leadId, leadId), eq(followUps.status, 'pending')));
  }

  async getDue(): Promise<FollowUp[]> {
    const now = new Date();
    const data = await db
      .select()
      .from(followUps)
      .where(and(eq(followUps.status, 'pending'), lte(followUps.scheduledAt, now)));

    return data as unknown as FollowUp[];
  }

  async markSent(followUpId: string): Promise<void> {
    await db
      .update(followUps)
      .set({ status: 'sent' })
      .where(eq(followUps.id, followUpId));
  }

  async checkStaleLeads(userId: string, hoursThreshold = 48): Promise<Lead[]> {
    const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
    const data = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.userId, userId),
          lt(leads.lastInteraction, threshold),
          inArray(leads.status, ['new', 'hot']),
        ),
      );

    return data as unknown as Lead[];
  }
}
