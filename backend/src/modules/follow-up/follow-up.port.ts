import type { FollowUp, Lead } from '../../shared/types/index.js';

export interface FollowUpRepository {
  schedule(leadId: string, userId: string, date: Date): Promise<FollowUp>;
  cancelForLead(leadId: string): Promise<void>;
  getDue(): Promise<FollowUp[]>;
  markSent(followUpId: string): Promise<void>;
  checkStaleLeads(userId: string, hoursThreshold?: number): Promise<Lead[]>;
}
