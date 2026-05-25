import { supabase } from '../../shared/config/supabase.js';
import type { ExclusionRepository } from './exclusion.port.js';

export class SupabaseExclusionRepository implements ExclusionRepository {
  async isExcluded(userId: string, phone: string): Promise<boolean> {
    const { data } = await supabase
      .from('excluded_contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('phone', phone)
      .single();

    return !!data;
  }

  async add(userId: string, phone: string, name?: string): Promise<void> {
    await supabase
      .from('excluded_contacts')
      .upsert({ user_id: userId, phone: phone, name: name || phone }, { onConflict: 'user_id,phone' });
  }

  async remove(userId: string, phone: string): Promise<void> {
    await supabase.from('excluded_contacts').delete().eq('user_id', userId).eq('phone', phone);
  }

  async list(userId: string): Promise<Array<{ phone: string; name: string }>> {
    const { data } = await supabase.from('excluded_contacts').select('phone, name').eq('user_id', userId);
    return (data || []) as Array<{ phone: string; name: string }>;
  }
}
