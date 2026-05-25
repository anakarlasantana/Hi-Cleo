import { supabase } from '../../shared/config/supabase.js';
import type { SessionRepository } from './webhooks.port.js';

export class SupabaseSessionRepository implements SessionRepository {
  async findByInstance(instanceName: string): Promise<{ user_id: string } | null> {
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('instance_name', instanceName)
      .eq('status', 'active')
      .single();

    return data || null;
  }
}
