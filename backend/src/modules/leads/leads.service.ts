import type { LeadRepository } from './leads.port.js';
import type { Lead, LeadStatus } from '../../shared/types/index.js';

export class LeadService {
  constructor(private leadRepo: LeadRepository) {}

  async findOrCreate(userId: string, phone: string, name?: string): Promise<Lead> {
    const existing = await this.leadRepo.findByUserAndPhone(userId, phone);
    if (existing) return existing;
    return this.leadRepo.create(userId, phone, name);
  }

  async listByStatus(userId: string, status: LeadStatus): Promise<Lead[]> {
    return this.leadRepo.listByStatus(userId, status);
  }

  async listToday(userId: string): Promise<Lead[]> {
    return this.leadRepo.listToday(userId);
  }

  async listNoReply(userId: string): Promise<Lead[]> {
    return this.leadRepo.listNoReply(userId);
  }

  async updateStatus(leadId: string, status: LeadStatus): Promise<void> {
    return this.leadRepo.updateStatus(leadId, status);
  }

  async updateLastInteraction(leadId: string): Promise<void> {
    return this.leadRepo.updateLastInteraction(leadId);
  }

  async searchByName(userId: string, name: string): Promise<Lead[]> {
    return this.leadRepo.searchByName(userId, name);
  }

  async findByPhone(userId: string, phone: string): Promise<Lead | null> {
    return this.leadRepo.findByUserAndPhone(userId, phone);
  }
}
