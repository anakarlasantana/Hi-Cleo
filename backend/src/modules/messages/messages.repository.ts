import { supabase } from '../../shared/config/supabase.js';
import type { MessageRepository, SaveMessageOptions } from './messages.port.js';
import type { Message, MessageDirection, MediaType } from '../../shared/types/index.js';

export class SupabaseMessageRepository implements MessageRepository {
  async save(leadId: string, text: string, direction: MessageDirection): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
      .insert({ lead_id: leadId, text, direction })
      .select()
      .single();

    if (error) throw new Error(`Erro ao salvar mensagem: ${error.message}`);
    return data as Message;
  }

  async saveWithMedia(options: SaveMessageOptions): Promise<Message> {
    const { leadId, text, direction, mediaType, mediaMimeType, mediaFileName, mediaKey } = options;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        lead_id: leadId,
        text,
        direction,
        media_type: mediaType || null,
        media_mime_type: mediaMimeType || null,
        media_file_name: mediaFileName || null,
        media_key: mediaKey || null,
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao salvar mensagem com mídia: ${error.message}`);
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

  async getMediaMessages(leadId: string, mediaType?: MediaType): Promise<Message[]> {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .not('media_type', 'is', null);

    if (mediaType) {
      query = query.eq('media_type', mediaType);
    }

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) throw new Error(`Erro ao buscar mensagens com mídia: ${error.message}`);
    return (data || []) as Message[];
  }
}
