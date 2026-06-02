import type { Message, MessageDirection, MediaType } from '../../shared/types/index.js';

export interface SaveMessageOptions {
  leadId: string;
  text: string;
  direction: MessageDirection;
  mediaType?: MediaType | null;
  mediaMimeType?: string | null;
  mediaFileName?: string | null;
  mediaKey?: string | null;
}

export interface MessageRepository {
  save(leadId: string, text: string, direction: MessageDirection): Promise<Message>;
  saveWithMedia(options: SaveMessageOptions): Promise<Message>;
  getByLead(leadId: string, limit?: number): Promise<Message[]>;
  getLastMessage(leadId: string): Promise<Message | null>;
  getMediaMessages(leadId: string, mediaType?: MediaType): Promise<Message[]>;
}
