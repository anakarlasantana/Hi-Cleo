import type { Message, MessageDirection } from '../../shared/types/index.js';

export interface MessageRepository {
  save(leadId: string, text: string, direction: MessageDirection): Promise<Message>;
  getByLead(leadId: string, limit?: number): Promise<Message[]>;
  getLastMessage(leadId: string): Promise<Message | null>;
}
