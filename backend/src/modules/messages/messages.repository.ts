import { eq, and, desc, isNotNull } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { messages } from '../../shared/schema.js';
import type { MessageRepository, SaveMessageOptions } from './messages.port.js';
import type { Message, MessageDirection, MediaType } from '../../shared/types/index.js';

export class DrizzleMessageRepository implements MessageRepository {
  async save(leadId: string, text: string, direction: MessageDirection): Promise<Message> {
    const [data] = await db
      .insert(messages)
      .values({ leadId, text, direction })
      .returning();

    if (!data) throw new Error('Erro ao salvar mensagem');
    return data as unknown as Message;
  }

  async saveWithMedia(options: SaveMessageOptions): Promise<Message> {
    const { leadId, text, direction, mediaType, mediaMimeType, mediaFileName, mediaKey } = options;

    const [data] = await db
      .insert(messages)
      .values({
        leadId,
        text,
        direction,
        mediaType: mediaType || null,
        mediaMimeType: mediaMimeType || null,
        mediaFileName: mediaFileName || null,
        mediaKey: mediaKey || null,
      })
      .returning();

    if (!data) throw new Error('Erro ao salvar mensagem com mídia');
    return data as unknown as Message;
  }

  async getByLead(leadId: string, limit = 20): Promise<Message[]> {
    const data = await db
      .select()
      .from(messages)
      .where(eq(messages.leadId, leadId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);

    return data as unknown as Message[];
  }

  async getLastMessage(leadId: string): Promise<Message | null> {
    const [data] = await db
      .select()
      .from(messages)
      .where(eq(messages.leadId, leadId))
      .orderBy(desc(messages.timestamp))
      .limit(1);

    return (data as unknown as Message) || null;
  }

  async getMediaMessages(leadId: string, mediaType?: MediaType): Promise<Message[]> {
    const conditions = [eq(messages.leadId, leadId), isNotNull(messages.mediaType)];

    if (mediaType) {
      conditions.push(eq(messages.mediaType, mediaType));
    }

    const data = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.timestamp));

    // Drizzle devolve camelCase; o tipo `Message` (e quem consome, ex.: o
    // encaminhamento de material) usa snake_case. Sem este mapa, `media_key`
    // vinha undefined e a Cleo respondia “não consegui reenviar esse material”.
    return data.map((row) => ({
      id: row.id,
      lead_id: row.leadId ?? '',
      text: row.text,
      direction: row.direction as Message['direction'],
      timestamp: row.timestamp?.toISOString() ?? '',
      media_type: (row.mediaType ?? null) as Message['media_type'],
      media_mime_type: row.mediaMimeType ?? null,
      media_file_name: row.mediaFileName ?? null,
      media_key: row.mediaKey ?? null,
    }));
  }
}
