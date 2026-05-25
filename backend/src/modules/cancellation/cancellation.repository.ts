import { supabase } from '../../shared/config/supabase.js';
import type { Cancellation, CancellationRepository, UserSubscription } from './cancellation.port.js';

export class SupabaseCancellationRepository implements CancellationRepository {
  async getCancellation(userId: string): Promise<Cancellation | null> {
    const { data, error } = await supabase
      .from('cancellations')
      .select('*')
      .eq('user_id', userId)
      .order('cancelled_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw new Error(`Erro ao buscar cancelamento: ${error.message}`);

    return data as Cancellation;
  }

  async insertCancellation(
    userId: string,
    accessUntil: Date,
    refundEligible: boolean
  ): Promise<Cancellation> {
    const { data, error } = await supabase
      .from('cancellations')
      .insert({
        user_id: userId,
        access_until: accessUntil.toISOString(),
        refund_eligible: refundEligible,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao registrar cancelamento: ${error.message}`);
    return data as Cancellation;
  }

  async markReactivated(userId: string, reactivatedAt: Date): Promise<void> {
    const { error } = await supabase
      .from('cancellations')
      .update({ reactivated_at: reactivatedAt.toISOString() })
      .eq('user_id', userId)
      .is('reactivated_at', null)
      .order('cancelled_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`Erro ao marcar reativação: ${error.message}`);
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const { data, error } = await supabase
      .from('users')
      .select('id, subscription_status, subscription_started_at')
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw new Error(`Erro ao buscar assinatura: ${error.message}`);

    return data as UserSubscription;
  }

  async updateSubscriptionStatus(userId: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ subscription_status: status })
      .eq('id', userId);

    if (error) throw new Error(`Erro ao atualizar status da assinatura: ${error.message}`);
  }

  async disconnectAllSessions(userId: string): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected' })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw new Error(`Erro ao desconectar sessões: ${error.message}`);
  }
}
