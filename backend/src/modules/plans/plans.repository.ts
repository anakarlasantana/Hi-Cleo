import { eq, and, desc, count, inArray } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { planLimits, whatsappSessions, users } from '../../shared/schema.js';
import type { PlanLimit, PlanRepository } from './plans.port.js';

export class DrizzlePlanRepository implements PlanRepository {
  async getPlanLimit(planName: string): Promise<PlanLimit | null> {
    const [data] = await db
      .select()
      .from(planLimits)
      .where(eq(planLimits.planName, planName))
      .limit(1);

    if (!data) return null;
    return this.toPlanLimit(data);
  }

  async getAllPlanLimits(): Promise<PlanLimit[]> {
    const data = await db.select().from(planLimits);
    return data.map(this.toPlanLimit);
  }

  private toPlanLimit(data: typeof planLimits.$inferSelect): PlanLimit {
    return {
      id: data.id,
      plan_name: data.planName,
      display_name: data.displayName ?? '',
      description: data.description ?? '',
      max_users: data.maxUsers,
      price_monthly: data.priceMonthly * 100,
      price_yearly_total: data.priceYearlyTotal * 100,
      features: data.features ?? [],
      highlighted: data.highlighted ?? false,
      created_at: data.createdAt?.toISOString() ?? '',
    };
  }

  async countActiveUsers(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(whatsappSessions)
      .where(and(eq(whatsappSessions.userId, userId), eq(whatsappSessions.status, 'active')));

    return result?.count || 0;
  }

  async getUserPlan(userId: string): Promise<string | null> {
    const [data] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return data?.plan || null;
  }

  async getUserMaxConnections(userId: string): Promise<number> {
    const [user] = await db
      .select({ plan: users.plan, maxConnectionsOverride: users.maxConnectionsOverride })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) throw new Error('Usuário não encontrado');

    // Se tem override customizado, usa ele
    if (user.maxConnectionsOverride != null) {
      return user.maxConnectionsOverride;
    }

    // Senão, busca o limite padrão do plano
    const planLimit = await this.getPlanLimit(user.plan);
    return planLimit?.max_users ?? 1;
  }

  async disconnectExcessUsers(userId: string, maxUsers: number): Promise<number> {
    // Get all active sessions ordered by connected_at (most recent first)
    const sessions = await db
      .select({ id: whatsappSessions.id })
      .from(whatsappSessions)
      .where(and(eq(whatsappSessions.userId, userId), eq(whatsappSessions.status, 'active')))
      .orderBy(desc(whatsappSessions.connectedAt));

    if (sessions.length <= maxUsers) return 0;

    // Disconnect the excess sessions (keep the oldest ones, disconnect newest)
    const sessionsToDisconnect = sessions.slice(maxUsers);
    const idsToDisconnect = sessionsToDisconnect.map((s) => s.id);

    await db
      .update(whatsappSessions)
      .set({ status: 'disconnected' })
      .where(inArray(whatsappSessions.id, idsToDisconnect));

    return idsToDisconnect.length;
  }
}
