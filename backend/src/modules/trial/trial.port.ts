export interface TrialAttempt {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  email_normalized?: string | null;
  business_type?: string | null;
  city?: string | null;
  state?: string | null;
  referral_source?: string | null;
  ip_address?: string | null;
  device_fingerprint?: string | null;
  user_agent?: string | null;
  status: 'started' | 'activated' | 'expired' | 'converted' | 'blocked';
  blocked_reason?: string | null;
  trial_user_id?: string | null;
  responses_used: number;
  leads_captured: number;
  whatsapp_connected: boolean;
  onboarding_completed: boolean;
  last_activity_at?: string | null;
  prospection_attempts: number;
  last_prospection_at?: string | null;
  prospection_status: 'pending' | 'contacted' | 'interested' | 'not_interested' | 'converted';
  created_at: string;
  activated_at?: string | null;
  expired_at?: string | null;
  converted_at?: string | null;
}

export interface CreateTrialAttemptData {
  name: string;
  phone: string;
  ip_address?: string;
  user_agent?: string;
}

export interface TrialRepository {
  create(data: CreateTrialAttemptData): Promise<TrialAttempt>;
  findByPhone(phone: string): Promise<TrialAttempt | null>;
  findRecentByPhone(phone: string, withinDays: number): Promise<TrialAttempt | null>;
  findRecentByIp(ip: string, withinHours: number): Promise<number>;
  findByDeviceFingerprint(fingerprint: string): Promise<TrialAttempt | null>;
  updateStatus(id: string, status: TrialAttempt['status'], fields?: Record<string, unknown>): Promise<void>;
  updateProspectionStatus(id: string, status: TrialAttempt['prospection_status']): Promise<void>;
  linkUser(id: string, userId: string): Promise<void>;
  incrementResponses(userId: string): Promise<number>;
}
