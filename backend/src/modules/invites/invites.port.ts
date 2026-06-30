import type { Invite } from '../../shared/types/index.js';

export interface InviteRepository {
  create(data: { ownerUserId: string; phone: string; token: string; expiresAt: Date }): Promise<Invite>;
  findByToken(token: string): Promise<Invite | null>;
  markAccepted(token: string, collaboratorUserId: string): Promise<void>;
  markCancelled(token: string): Promise<void>;
  listByOwner(ownerUserId: string): Promise<Invite[]>;
  countActiveByOwner(ownerUserId: string): Promise<number>;
}
