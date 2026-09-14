import { eq, and, desc } from 'drizzle-orm';
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

  async markDisconnected(instanceName: string): Promise<void> {
    await db
      .update(whatsappSessions)
      .set({ status: 'disconnected', disconnectedAt: new Date() })
      .where(and(eq(whatsappSessions.instanceName, instanceName), eq(whatsappSessions.status, 'active')));
  }
}
