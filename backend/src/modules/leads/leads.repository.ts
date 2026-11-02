import { eq, and, gte, lt, ne, ilike, sql, isNull } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { leads, messages } from '../../shared/schema.js';
import type { LeadRepository } from './leads.port.js';
import type { Lead, LeadStatus } from '../../shared/types/index.js';

export class DrizzleLeadRepository implements LeadRepository {
  /**
   * Converte a linha do Drizzle (camelCase) para o tipo `Lead` (snake_case).
   *
   * Sem isso, `lead.created_at` vinha undefined — o aviso de “cliente novo” ao
   * dono nunca disparava e a métrica `leads_captured` do trial ficava zerada.
   */
  private toLead(row: typeof leads.$inferSelect): Lead {
    return {
      id: row.id,
      user_id: row.userId ?? '',
      name: row.name,
      phone: row.phone,
      status: (row.status ?? 'new') as LeadStatus,
      last_interaction: row.lastInteraction?.toISOString(),
      created_at: row.createdAt?.toISOString() ?? '',
    };
  }

  async findByUserAndPhone(userId: string, phone: string): Promise<Lead | null> {
    const [data] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.userId, userId), eq(leads.phone, phone)))
      .limit(1);

    return data ? this.toLead(data) : null;
  }

  async create(userId: string, phone: string, name?: string): Promise<Lead> {
    const [data] = await db
      .insert(leads)
      .values({
        userId,
        phone,
        name: name || phone,
        status: 'new',
      })
      .returning();

    if (!data) throw new Error('Erro ao criar lead');
    return this.toLead(data);
  }

  async listByStatus(userId: string, status: LeadStatus): Promise<Lead[]> {
    const data = await db
      .select()
      .from(leads)
      .where(and(eq(leads.userId, userId), eq(leads.status, status)))
      .orderBy(sql`${leads.lastInteraction} DESC`);

    return data.map((row) => this.toLead(row));
  }

  async listToday(userId: string): Promise<Lead[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data = await db
      .select()
      .from(leads)
      .where(and(eq(leads.userId, userId), gte(leads.createdAt, today)));

    return data.map((row) => this.toLead(row));
  }

  async listNoReply(userId: string, hoursThreshold = 48): Promise<Lead[]> {
    const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);

    // Equivalent of get_leads_sem_resposta RPC:
    // Leads where last_interaction < threshold, not closed/lost,
    // and where the last message direction is 'outgoing' (no reply from lead)
    const data = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.userId, userId),
          lt(leads.lastInteraction, threshold),
          ne(leads.status, 'closed'),
          ne(leads.status, 'lost'),
        ),
      );

    return data.map((row) => this.toLead(row));
  }

  async updateStatus(leadId: string, status: LeadStatus): Promise<void> {
    const result = await db
      .update(leads)
      .set({ status })
      .where(eq(leads.id, leadId));

    if (result.rowCount === 0) throw new Error('Erro ao atualizar lead');
  }

  async updateLastInteraction(leadId: string): Promise<void> {
    const result = await db
      .update(leads)
      .set({ lastInteraction: new Date() })
      .where(eq(leads.id, leadId));

    if (result.rowCount === 0) throw new Error('Erro ao atualizar interação');
  }

  async searchByName(userId: string, name: string): Promise<Lead[]> {
    const data = await db
      .select()
      .from(leads)
      .where(and(eq(leads.userId, userId), ilike(leads.name, `%${name}%`)))
      .limit(5);

    return data.map((row) => this.toLead(row));
  }
}
