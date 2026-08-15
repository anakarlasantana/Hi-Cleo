import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { excludedContacts } from '../../shared/schema.js';
import type { ExclusionRepository } from './exclusion.port.js';

export class DrizzleExclusionRepository implements ExclusionRepository {
  async isExcluded(userId: string, phone: string): Promise<boolean> {
    const [data] = await db
      .select({ id: excludedContacts.id })
      .from(excludedContacts)
      .where(and(eq(excludedContacts.userId, userId), eq(excludedContacts.phone, phone)))
      .limit(1);

    return !!data;
  }

  async add(userId: string, phone: string, name?: string): Promise<void> {
    await db
      .insert(excludedContacts)
      .values({ userId, phone, name: name || phone })
      .onConflictDoUpdate({
        target: [excludedContacts.userId, excludedContacts.phone],
        set: { name: name || phone },
      });
  }

  async remove(userId: string, phone: string): Promise<void> {
    await db
      .delete(excludedContacts)
      .where(and(eq(excludedContacts.userId, userId), eq(excludedContacts.phone, phone)));
  }

  async list(userId: string): Promise<Array<{ phone: string; name: string }>> {
    const data = await db
      .select({ phone: excludedContacts.phone, name: excludedContacts.name })
      .from(excludedContacts)
      .where(eq(excludedContacts.userId, userId));

    return data as Array<{ phone: string; name: string }>;
  }
}
