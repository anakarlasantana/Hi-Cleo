export interface TermsConsent {
  id: string;
  user_id: string;
  terms_version: string;
  accepted_at: string;
  ip_address?: string;
}

export interface TermsConsentRepository {
  getLatestConsent(userId: string): Promise<TermsConsent | null>;
  insertConsent(userId: string, termsVersion: string, ipAddress?: string): Promise<void>;
  getConsentHistory(userId: string): Promise<TermsConsent[]>;
}
