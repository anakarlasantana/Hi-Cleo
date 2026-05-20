import { supabase } from '../../shared/config/supabase.js';
import type { MessageRepository } from './messages.port.js';
import type { Message, MessageDirection } from '../../shared/types/index.js';

export class SupabaseMessageRepository implements MessageRepository {
  async save(leadId: string, texto: string, direcao: MessageDirection): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({ lead_id: leadId, texto, direcao })
      .select()
      .single();

    if (error) throw new Error(`Erro ao salvar mensagem: ${error.message}`);
    return data as Message;
  }

  async getByLead(leadId: string, limit = 20): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Erro ao buscar mensagens: ${error.message}`);
    return (data || []) as Message[];
  }

  async getLastMessage(leadId: string): Promise<Message | null> {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    return (data as Message) || null;
  }
}
