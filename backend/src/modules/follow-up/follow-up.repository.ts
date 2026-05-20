import { supabase } from '../../shared/config/supabase.js';
import type { FollowUpRepository } from './follow-up.port.js';
import type { FollowUp, Lead } from '../../shared/types/index.js';

export class SupabaseFollowUpRepository implements FollowUpRepository {
  async schedule(leadId: string, userId: string, date: Date): Promise<FollowUp> {
    const { data, error } = await supabase
      .from('follow_ups')
      .insert({ lead_id: leadId, user_id: userId, data_agendada: date.toISOString(), status: 'pendente' })
      .select()
      .single();

    if (error) throw new Error(`Erro ao agendar follow-up: ${error.message}`);
    return data as FollowUp;
  }

  async cancelForLead(leadId: string): Promise<void> {
    await supabase.from('follow_ups').update({ status: 'cancelado' }).eq('lead_id', leadId).eq('status', 'pendente');
  }

  async getDue(): Promise<FollowUp[]> {
    const now = new Date().toISOString();
    const { data, error } = await supabase.from('follow_ups').select('*').eq('status', 'pendente').lte('data_agendada', now);
    if (error) throw new Error(`Erro ao buscar follow-ups: ${error.message}`);
    return (data || []) as FollowUp[];
  }

  async markSent(followUpId: string): Promise<void> {
    await supabase.from('follow_ups').update({ status: 'enviado' }).eq('id', followUpId);
  }

  async checkStaleLeads(userId: string, hoursThreshold = 48): Promise<Lead[]> {
    const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('leads').select('*').eq('user_id', userId).lt('last_interaction', threshold).in('status', ['novo', 'quente']);
    return (data || []) as Lead[];
  }
}
