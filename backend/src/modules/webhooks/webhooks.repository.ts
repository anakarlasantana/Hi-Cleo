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

  async findByUserId(userId: string): Promise<{ instance_name: string; user_id: string } | null> {
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('instance_name, user_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    return data || null;
  }

  async listActiveSessions(): Promise<Array<{ user_id: string; instance_name: string }>> {
    const { data } = await supabase
      .from('whatsapp_sessions')
      .select('user_id, instance_name')
      .eq('status', 'active');

    return data || [];
  }

  async markDisconnected(instanceName: string): Promise<void> {
    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
      .eq('instance_name', instanceName)
      .eq('status', 'active');
  }
}
