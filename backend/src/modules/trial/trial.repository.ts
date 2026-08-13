import { supabase } from '../../shared/config/supabase.js';
import type { TrialRepository, TrialAttempt, CreateTrialAttemptData } from './trial.port.js';

export class SupabaseTrialRepository implements TrialRepository {
  async create(data: CreateTrialAttemptData): Promise<TrialAttempt> {
    const { data: attempt, error } = await supabase
      .from('trial_attempts')
      .insert({
        name: data.name,
        phone: data.phone,
        ip_address: data.ip_address || null,
        user_agent: data.user_agent || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar trial attempt: ${error.message}`);
    return attempt;
  }

  async findByPhone(phone: string): Promise<TrialAttempt | null> {
    const { data } = await supabase
      .from('trial_attempts')
      .select()
      .eq('phone', phone)
      .neq('status', 'blocked')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data || null;
  }

  async findRecentByPhone(phone: string, withinDays: number): Promise<TrialAttempt | null> {
    const since = new Date();
    since.setDate(since.getDate() - withinDays);

    const { data } = await supabase
      .from('trial_attempts')
      .select()
      .eq('phone', phone)
      .neq('status', 'blocked')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data || null;
  }

  async findRecentByIp(ip: string, withinHours: number): Promise<number> {
    const since = new Date();
    since.setHours(since.getHours() - withinHours);

    const { count } = await supabase
      .from('trial_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', since.toISOString());

    return count || 0;
  }

  async findByDeviceFingerprint(fingerprint: string): Promise<TrialAttempt | null> {
    const { data } = await supabase
      .from('trial_attempts')
      .select()
      .eq('device_fingerprint', fingerprint)
      .neq('status', 'blocked')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return data || null;
  }

  async updateStatus(id: string, status: TrialAttempt['status'], fields?: Record<string, unknown>): Promise<void> {
    const update: Record<string, unknown> = { status, ...fields };
    const { error } = await supabase.from('trial_attempts').update(update).eq('id', id);
    if (error) throw new Error(`Erro ao atualizar trial status: ${error.message}`);
  }

  async updateProspectionStatus(id: string, status: TrialAttempt['prospection_status']): Promise<void> {
    const { error } = await supabase
      .from('trial_attempts')
      .update({ prospection_status: status, last_prospection_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Erro ao atualizar prospection status: ${error.message}`);
  }

  async linkUser(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('trial_attempts')
      .update({ trial_user_id: userId, status: 'activated', activated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Erro ao vincular user ao trial: ${error.message}`);
  }

  async incrementResponses(userId: string): Promise<number> {
    // Incrementa no user
    const { data, error } = await supabase.rpc('increment_trial_responses', { p_user_id: userId });

    if (error) {
      // Fallback: update manual se RPC não existir
      const { data: user } = await supabase
        .from('users')
        .select('trial_responses_used')
        .eq('id', userId)
        .single();

      const current = user?.trial_responses_used || 0;
      const next = current + 1;

      await supabase
        .from('users')
        .update({ trial_responses_used: next })
        .eq('id', userId);

      // Atualizar também na trial_attempts
      await supabase
        .from('trial_attempts')
        .update({ responses_used: next, last_activity_at: new Date().toISOString() })
        .eq('trial_user_id', userId);

      return next;
    }

    return data;
  }
}
