import { supabase } from '../../shared/config/supabase.js';
import type { InviteRepository } from './invites.port.js';
import type { Invite } from '../../shared/types/index.js';

export class SupabaseInviteRepository implements InviteRepository {
  async create(data: { ownerUserId: string; phone: string; token: string; expiresAt: Date }): Promise<Invite> {
    const { data: invite, error } = await supabase
      .from('invites')
      .insert({
        owner_user_id: data.ownerUserId,
        phone: data.phone,
        token: data.token,
        expires_at: data.expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar convite: ${error.message}`);
    return invite as Invite;
  }

  async findByToken(token: string): Promise<Invite | null> {
    const { data } = await supabase
      .from('invites')
      .select('*')
      .eq('token', token)
      .single();

    return (data as Invite) || null;
  }

  async markAccepted(token: string, collaboratorUserId: string): Promise<void> {
    const { error } = await supabase
      .from('invites')
      .update({ status: 'accepted', used_by_user_id: collaboratorUserId })
      .eq('token', token);

    if (error) throw new Error(`Erro ao aceitar convite: ${error.message}`);
  }

  async markCancelled(token: string): Promise<void> {
    const { error } = await supabase
      .from('invites')
      .update({ status: 'cancelled' })
      .eq('token', token);

    if (error) throw new Error(`Erro ao cancelar convite: ${error.message}`);
  }

  async listByOwner(ownerUserId: string): Promise<Invite[]> {
    const { data } = await supabase
      .from('invites')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .order('created_at', { ascending: false });

    return (data || []) as Invite[];
  }

  async countActiveByOwner(ownerUserId: string): Promise<number> {
    const { count } = await supabase
      .from('invites')
      .select('*', { count: 'exact', head: true })
      .eq('owner_user_id', ownerUserId)
      .eq('status', 'pending');

    return count || 0;
  }
}
