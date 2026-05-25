import { supabase } from '../../shared/config/supabase.js';
import type { LeadRepository } from './leads.port.js';
import type { Lead, LeadStatus } from '../../shared/types/index.js';

export class SupabaseLeadRepository implements LeadRepository {
  async findByUserAndPhone(userId: string, phone: string): Promise<Lead | null> {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .eq('phone', phone)
      .single();

    return (data as Lead) || null;
  }

  async create(userId: string, phone: string, name?: string): Promise<Lead> {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        phone: phone,
        name: name || phone,
        status: 'new',
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar lead: ${error.message}`);
    return data as Lead;
  }

  async listByStatus(userId: string, status: LeadStatus): Promise<Lead[]> {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status)
      .order('last_interaction', { ascending: false });

    if (error) throw new Error(`Erro ao listar leads: ${error.message}`);
    return (data || []) as Lead[];
  }

  async listToday(userId: string): Promise<Lead[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', today.toISOString());

    if (error) throw new Error(`Erro ao listar leads de hoje: ${error.message}`);
    return (data || []) as Lead[];
  }

  async listNoReply(userId: string, hoursThreshold = 48): Promise<Lead[]> {
    const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase.rpc('get_leads_sem_resposta', {
      p_user_id: userId,
      p_threshold: threshold,
    });

    if (error) {
      const { data: fallback } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userId)
        .lt('last_interaction', threshold)
        .neq('status', 'closed')
        .neq('status', 'lost');

      return (fallback || []) as Lead[];
    }

    return (data || []) as Lead[];
  }

  async updateStatus(leadId: string, status: LeadStatus): Promise<void> {
    const { error } = await supabase.from('leads').update({ status }).eq('id', leadId);
    if (error) throw new Error(`Erro ao atualizar lead: ${error.message}`);
  }

  async updateLastInteraction(leadId: string): Promise<void> {
    const { error } = await supabase
      .from('leads')
      .update({ last_interaction: new Date().toISOString() })
      .eq('id', leadId);

    if (error) throw new Error(`Erro ao atualizar interação: ${error.message}`);
  }
}
