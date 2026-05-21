import { supabase } from '../../shared/config/supabase.js';
import type { TermsConsent, TermsConsentRepository } from './terms.port.js';

export class SupabaseTermsConsentRepository implements TermsConsentRepository {
  async getLatestConsent(userId: string): Promise<TermsConsent | null> {
    const { data, error } = await supabase
      .from('terms_consent')
      .select('*')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      // No rows found
      return null;
    }
    if (error) throw new Error(`Erro ao buscar consentimento: ${error.message}`);

    return data as TermsConsent;
  }

  async insertConsent(userId: string, termsVersion: string, ipAddress?: string): Promise<void> {
    const { error } = await supabase
      .from('terms_consent')
      .insert({
        user_id: userId,
        terms_version: termsVersion,
        ip_address: ipAddress || null,
      });

    if (error) throw new Error(`Erro ao registrar consentimento: ${error.message}`);
  }

  async getConsentHistory(userId: string): Promise<TermsConsent[]> {
    const { data, error } = await supabase
      .from('terms_consent')
      .select('*')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false });

    if (error) throw new Error(`Erro ao buscar histórico de consentimento: ${error.message}`);
    return (data || []) as TermsConsent[];
  }
}
