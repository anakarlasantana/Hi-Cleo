import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { invites } from '../../shared/schema.js';
import type { InviteRepository } from './invites.port.js';
import type { Invite } from '../../shared/types/index.js';

export class DrizzleInviteRepository implements InviteRepository {
  async create(data: { ownerUserId: string; phone: string; token: string; expiresAt: Date }): Promise<Invite> {
    const [invite] = await db
      .insert(invites)
      .values({
        ownerUserId: data.ownerUserId,
        phone: data.phone,
        token: data.token,
        expiresAt: data.expiresAt,
      })
      .returning();

    if (!invite) throw new Error('Erro ao criar convite');
    return invite as unknown as Invite;
  }

  async findByToken(token: string): Promise<Invite | null> {
    const [data] = await db
      .select()
      .from(invites)
      .where(eq(invites.token, token))
      .limit(1);

    return (data as unknown as Invite) || null;
  }

  async markAccepted(token: string, collaboratorUserId: string): Promise<void> {
    await db
      .update(invites)
      .set({ status: 'accepted', usedByUserId: collaboratorUserId })
      .where(eq(invites.token, token));
  }

  async markCancelled(token: string): Promise<void> {
    await db
      .update(invites)
      .set({ status: 'cancelled' })
      .where(eq(invites.token, token));
  }

  async listByOwner(ownerUserId: string): Promise<Invite[]> {
    const data = await db
      .select()
      .from(invites)
      .where(eq(invites.ownerUserId, ownerUserId))
      .orderBy(desc(invites.createdAt));

    return data as unknown as Invite[];
  }

  async countActiveByOwner(ownerUserId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(invites)
      .where(and(eq(invites.ownerUserId, ownerUserId), eq(invites.status, 'pending')));

    return result?.count || 0;
  }
}
