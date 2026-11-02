import { eq, and, desc, count, inArray } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { planLimits, whatsappSessions, users } from '../../shared/schema.js';
import type { PlanLimit, PlanRepository } from './plans.port.js';

/**
 * Ordem canônica da vitrine: **Solo (1) → Equipe (2) → Empresa (3)**.
 *
 * Por que existe: sem `ORDER BY` o Postgres devolve a ordem física do heap, que
 * muda a cada UPSERT de preço — a API chegou a listar `empresa` antes de `solo`.
 * Exportada para o teste de regressão (`plans-order.test.ts`) e para que qualquer
 * consulta futura reutilize a mesma regra.
 */
export const PLAN_ORDER_BY = [planLimits.sortOrder, planLimits.planName] as const;

/**
 * Consulta de TODOS os planos com a ordem canônica aplicada.
 *
 * Recebe `database` por parâmetro para o teste de regressão inspecionar o
 * `ORDER BY` sem precisar de banco (o builder do Drizzle não expõe `toSQL()`
 * nesta versão). Sem o `ORDER BY`, o Postgres devolve a ordem física do heap —
 * foi assim que a API passou a listar `empresa, solo, equipe`.
 */
export function buildAllPlansQuery(database: typeof db = db) {
  return database.select().from(planLimits).orderBy(...PLAN_ORDER_BY);
}

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
    const data = await buildAllPlansQuery();
    return data.map(this.toPlanLimit);
  }

  private toPlanLimit(data: typeof planLimits.$inferSelect): PlanLimit {
    return {
      id: data.id,
      plan_name: data.planName,
      display_name: data.displayName ?? '',
      description: data.description ?? '',
      max_users: data.maxUsers,
      // Valores já estão em CENTAVOS no banco (ver migration 0003 e
      // docs/produto/regras-de-negocio.md). Não multiplicar aqui — isso causava
      // divergência de 100x entre a vitrine e o valor cobrado no pagamento.
      price_monthly: data.priceMonthly,
      price_yearly_total: data.priceYearlyTotal,
      features: data.features ?? [],
      highlighted: data.highlighted ?? false,
      sort_order: data.sortOrder ?? 0,
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
