import { eq, desc } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { termsConsent } from '../../shared/schema.js';
import type { TermsConsent, TermsConsentRepository } from './terms.port.js';

/** Mapeia a row do Drizzle (camelCase) para o tipo da porta (snake_case) */
function toTermsConsent(row: typeof termsConsent.$inferSelect): TermsConsent {
  return {
    id: row.id,
    user_id: row.userId ?? '',
    terms_version: row.termsVersion,
    accepted_at: row.acceptedAt instanceof Date ? row.acceptedAt.toISOString() : String(row.acceptedAt),
    ip_address: row.ipAddress ?? undefined,
  };
}

export class DrizzleTermsConsentRepository implements TermsConsentRepository {
  async getLatestConsent(userId: string): Promise<TermsConsent | null> {
    const [data] = await db
      .select()
      .from(termsConsent)
      .where(eq(termsConsent.userId, userId))
      .orderBy(desc(termsConsent.acceptedAt))
      .limit(1);

    return data ? toTermsConsent(data) : null;
  }

  async insertConsent(userId: string, termsVersion: string, ipAddress?: string): Promise<void> {
    await db.insert(termsConsent).values({
      userId,
      termsVersion,
      ipAddress: ipAddress || null,
    });
  }

  async getConsentHistory(userId: string): Promise<TermsConsent[]> {
    const data = await db
      .select()
      .from(termsConsent)
      .where(eq(termsConsent.userId, userId))
      .orderBy(desc(termsConsent.acceptedAt));

    return data.map(toTermsConsent);
  }
}
