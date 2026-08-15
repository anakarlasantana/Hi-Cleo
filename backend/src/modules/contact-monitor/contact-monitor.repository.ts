import { eq, count, sql } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { leads } from '../../shared/schema.js';
import type { ContactMonitorRepository } from './contact-monitor.port.js';

export class DrizzleContactMonitorRepository implements ContactMonitorRepository {
  async getContactCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(leads)
      .where(eq(leads.userId, userId));

    return result?.count || 0;
  }

  async getTotalContacts(): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(leads);

    return result?.count || 0;
  }

  async getContactCountPerUser(): Promise<Array<{ userId: string; count: number }>> {
    const data = await db
      .select({
        userId: leads.userId,
        count: count(),
      })
      .from(leads)
      .groupBy(leads.userId);

    return data.map((row) => ({
      userId: row.userId as string,
      count: row.count,
    }));
  }
}
