import { supabase } from '../../shared/config/supabase.js';
import type { PlanLimit, PlanRepository } from './plans.port.js';

export class SupabasePlanRepository implements PlanRepository {
  async getPlanLimit(planName: string): Promise<PlanLimit | null> {
    const { data } = await supabase
      .from('plan_limits')
      .select('*')
      .eq('plan_name', planName)
      .single();

    return (data as PlanLimit) || null;
  }

  async getAllPlanLimits(): Promise<PlanLimit[]> {
    const { data } = await supabase
      .from('plan_limits')
      .select('*');

    return (data || []) as PlanLimit[];
  }

  async countActiveUsers(userId: string): Promise<number> {
    // Count active WhatsApp sessions for the user's account
    const { count, error } = await supabase
      .from('whatsapp_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw new Error(`Erro ao contar usuários ativos: ${error.message}`);
    return count || 0;
  }

  async getUserPlan(userId: string): Promise<string | null> {
    const { data } = await supabase
      .from('users')
      .select('plan')
      .eq('id', userId)
      .single();

    return data?.plan || null;
  }

  async disconnectExcessUsers(userId: string, maxUsers: number): Promise<number> {
    // Get all active sessions ordered by connected_at (most recent first)
    const { data: sessions } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('connected_at', { ascending: false });

    if (!sessions || sessions.length <= maxUsers) return 0;

    // Disconnect the excess sessions (keep the oldest ones, disconnect newest)
    const sessionsToDisconnect = sessions.slice(maxUsers);
    const idsToDisconnect = sessionsToDisconnect.map((s) => s.id);

    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected' })
      .in('id', idsToDisconnect);

    if (error) throw new Error(`Erro ao desconectar usuários: ${error.message}`);
    return idsToDisconnect.length;
  }
}
