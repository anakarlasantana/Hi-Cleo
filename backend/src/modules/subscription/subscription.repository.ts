import { supabase } from '../../shared/config/supabase.js';
import type { SubscriptionRepository, ExpiringSubscription, ExpiredSubscription, SubscriptionEvent } from './subscription.port.js';

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  async updateFields(userId: string, fields: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('users').update(fields).eq('id', userId);
    if (error) throw new Error(`Erro ao atualizar assinatura: ${error.message}`);
  }

  async getUserByEmail(email: string): Promise<{ id: string; phone: string; plan: string } | null> {
    const { data } = await supabase.from('users').select('id, phone, plan').eq('email', email).single();
    return data || null;
  }

  async getUserSubscriptionExpiry(userId: string): Promise<string | null> {
    const { data } = await supabase
      .from('users')
      .select('subscription_expires_at')
      .eq('id', userId)
      .eq('subscription_status', 'active')
      .single();
    return data?.subscription_expires_at || null;
  }

  async getExpiringIn(days: number): Promise<ExpiringSubscription[]> {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + days);

    const { data } = await supabase
      .from('users')
      .select('id, phone, plan, subscription_expires_at, billing_period')
      .eq('subscription_status', 'active')
      .gte('subscription_expires_at', now.toISOString())
      .lte('subscription_expires_at', future.toISOString());

    return (data || []).map((r: any) => ({
      user_id: r.id,
      phone: r.phone,
      plan_name: r.plan,
      subscription_expires_at: r.subscription_expires_at,
      billing_period: r.billing_period,
    }));
  }

  async getExpired(): Promise<ExpiredSubscription[]> {
    const { data } = await supabase
      .from('users')
      .select('id, payment_provider_id, subscription_status')
      .eq('subscription_status', 'active')
      .lt('subscription_expires_at', new Date().toISOString());

    return (data || []).map((r: any) => ({
      user_id: r.id,
      payment_provider_id: r.payment_provider_id,
      subscription_status: r.subscription_status,
    }));
  }

  async createEvent(event: SubscriptionEvent): Promise<void> {
    const { error } = await supabase.from('subscription_events').insert(event);
    if (error) throw new Error(`Erro ao criar evento: ${error.message}`);
  }

  async disconnectAllSessionsByOwner(userId: string): Promise<number> {
    // Desconectar sessões do owner
    const { data: ownerSessions } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active');

    // Desconectar sessões dos colaboradores vinculados ao owner
    const { data: collaborators } = await supabase
      .from('users')
      .select('id')
      .eq('owner_user_id', userId);

    const collaboratorIds = (collaborators || []).map((c: any) => c.id);
    const allUserIds = [userId, ...collaboratorIds];

    const { error, count } = await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
      .in('user_id', allUserIds)
      .eq('status', 'active');

    if (error) throw new Error(`Erro ao desconectar sessões: ${error.message}`);
    return count || 0;
  }
}
