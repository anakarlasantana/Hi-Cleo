import { eq, and, desc, ne } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { whatsappSessions } from '../../shared/schema.js';
import type { SessionRepository } from './webhooks.port.js';

export class DrizzleSessionRepository implements SessionRepository {
  async findByInstance(instanceName: string): Promise<{ user_id: string } | null> {
    const [data] = await db
      .select({ user_id: whatsappSessions.userId })
      .from(whatsappSessions)
      .where(and(eq(whatsappSessions.instanceName, instanceName), eq(whatsappSessions.status, 'active')))
      // Sem UNIQUE em instance_name: se houver duplicatas (reconexões/testes),
      // preferir a sessão ativa mais recente em vez de uma linha arbitrária.
      .orderBy(desc(whatsappSessions.connectedAt))
      .limit(1);

    if (!data || !data.user_id) return null;
    return { user_id: data.user_id };
  }

  async findByUserId(userId: string): Promise<{ instance_name: string; user_id: string } | null> {
    const [data] = await db
      .select({ instance_name: whatsappSessions.instanceName, user_id: whatsappSessions.userId })
      .from(whatsappSessions)
      .where(and(eq(whatsappSessions.userId, userId), eq(whatsappSessions.status, 'active')))
      .limit(1);

    if (!data || !data.user_id) return null;
    return { instance_name: data.instance_name, user_id: data.user_id };
  }

  async listActiveSessions(): Promise<Array<{ user_id: string; instance_name: string }>> {
    const data = await db
      .select({ user_id: whatsappSessions.userId, instance_name: whatsappSessions.instanceName })
      .from(whatsappSessions)
      .where(eq(whatsappSessions.status, 'active'));

    return data.filter((d): d is { user_id: string; instance_name: string } => d.user_id !== null);
  }

  /**
   * Marca a instância como conectada e vinculada ao usuário.
   *
   * Fluxo que isso destrava: sem uma linha `active` em whatsapp_sessions,
   * `findByInstance` (usado no processamento de mensagens) retorna null e a
   * Cleo não responde a nenhum cliente. Também é o que alimenta a contagem de
   * slots do plano (Solo = 1, Equipe = 3, Empresa = 8).
   *
   * Idempotente: o webhook e o SSE podem chamar em paralelo; o índice único
   * parcial (instance_name WHERE status='active') impede duplicata e o
   * ON CONFLICT atualiza a linha existente.
   */
  async activateSession(params: { userId: string; instanceName: string }): Promise<void> {
    const { userId, instanceName } = params;

    // Fecha qualquer sessão ativa anterior da MESMA instância gravada para
    // outro usuário (reconexão de número / resquício de tentativa anterior).
    await db
      .update(whatsappSessions)
      .set({ status: 'disconnected', disconnectedAt: new Date() })
      .where(
        and(
          eq(whatsappSessions.instanceName, instanceName),
          eq(whatsappSessions.status, 'active'),
          ne(whatsappSessions.userId, userId),
        ),
      );

    await db
      .insert(whatsappSessions)
      .values({
        userId,
        instanceName,
        status: 'active',
        connectedAt: new Date(),
        lastCheck: new Date(),
      })
      .onConflictDoUpdate({
        target: whatsappSessions.instanceName,
        targetWhere: eq(whatsappSessions.status, 'active'),
        set: { status: 'active', userId, connectedAt: new Date(), disconnectedAt: null, lastCheck: new Date() },
      });
  }

  async markDisconnected(instanceName: string): Promise<void> {
    await db
      .update(whatsappSessions)
      .set({ status: 'disconnected', disconnectedAt: new Date() })
      .where(and(eq(whatsappSessions.instanceName, instanceName), eq(whatsappSessions.status, 'active')));
  }
}
