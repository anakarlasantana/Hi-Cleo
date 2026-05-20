import { supabase } from '../../shared/config/supabase.js';
import type { ExclusionRepository } from './exclusion.port.js';

export class SupabaseExclusionRepository implements ExclusionRepository {
  async isExcluded(userId: string, phone: string): Promise<boolean> {
    const { data } = await supabase
      .from('excluded_contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('telefone', phone)
      .single();

    return !!data;
  }

  async add(userId: string, phone: string, nome?: string): Promise<void> {
    await supabase
      .from('excluded_contacts')
      .upsert({ user_id: userId, telefone: phone, nome: nome || phone }, { onConflict: 'user_id,telefone' });
  }

  async remove(userId: string, phone: string): Promise<void> {
    await supabase.from('excluded_contacts').delete().eq('user_id', userId).eq('telefone', phone);
  }

  async list(userId: string): Promise<Array<{ telefone: string; nome: string }>> {
    const { data } = await supabase.from('excluded_contacts').select('telefone, nome').eq('user_id', userId);
    return (data || []) as Array<{ telefone: string; nome: string }>;
  }
}
