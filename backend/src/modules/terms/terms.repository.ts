import { eq, desc } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { termsConsent } from '../../shared/schema.js';
import type { TermsConsent, TermsConsentRepository } from './terms.port.js';

export class DrizzleTermsConsentRepository implements TermsConsentRepository {
  async getLatestConsent(userId: string): Promise<TermsConsent | null> {
    const [data] = await db
      .select()
      .from(termsConsent)
      .where(eq(termsConsent.userId, userId))
      .orderBy(desc(termsConsent.acceptedAt))
      .limit(1);

    return (data as unknown as TermsConsent) || null;
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

    return data as unknown as TermsConsent[];
  }
}
