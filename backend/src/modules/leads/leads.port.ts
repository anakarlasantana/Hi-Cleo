import type { Lead, LeadStatus } from '../../shared/types/index.js';

export interface LeadRepository {
  findByUserAndPhone(userId: string, phone: string): Promise<Lead | null>;
  create(userId: string, phone: string, name?: string): Promise<Lead>;
  listByStatus(userId: string, status: LeadStatus): Promise<Lead[]>;
  listToday(userId: string): Promise<Lead[]>;
  listNoReply(userId: string, hoursThreshold?: number): Promise<Lead[]>;
  updateStatus(leadId: string, status: LeadStatus): Promise<void>;
  updateLastInteraction(leadId: string): Promise<void>;
  searchByName(userId: string, name: string): Promise<Lead[]>;
}
