import type { TermsConsent, TermsConsentRepository } from './terms.port.js';
import { CURRENT_TERMS_VERSION } from './constants.js';

export { CURRENT_TERMS_VERSION };

export class TermsConsentService {
  constructor(private repo: TermsConsentRepository) {}

  /**
   * Verifica se o usuário precisa aceitar os termos (novo aceite necessário).
   * Retorna true se não há consentimento ou se a versão aceita é anterior
   * à versão atual dos termos.
   *
   * Requirement 3.2: Exigir aceite explícito dos termos para prosseguir
   * com a ativação.
   * Requirement 3.4: Quando termos são atualizados, solicitar novo aceite.
   */
  async requiresConsent(userId: string): Promise<boolean> {
    const latestConsent = await this.repo.getLatestConsent(userId);

    if (!latestConsent) {
      return true;
    }

    return latestConsent.terms_version !== CURRENT_TERMS_VERSION;
  }

  /**
   * Registra o aceite dos termos pelo usuário com data, hora e versão.
   *
   * Requirement 3.3: Armazenar registro de aceite com data, hora e versão
   * do documento aceito.
   */
  async recordConsent(userId: string, termsVersion: string, ipAddress?: string): Promise<void> {
    await this.repo.insertConsent(userId, termsVersion, ipAddress);
  }

  /**
   * Retorna o histórico completo de consentimentos do usuário,
   * ordenado do mais recente para o mais antigo.
   */
  async getConsentHistory(userId: string): Promise<TermsConsent[]> {
    return this.repo.getConsentHistory(userId);
  }
}
