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

    return data as unknown as Message[];
  }
}
