import { describe, it, expect, beforeEach } from 'vitest';
import { TermsConsentService, CURRENT_TERMS_VERSION } from './terms.service.js';
import type { TermsConsent, TermsConsentRepository } from './terms.port.js';

/**
 * In-memory implementation of TermsConsentRepository for testing.
 */
class InMemoryTermsConsentRepository implements TermsConsentRepository {
  private consents: TermsConsent[] = [];

  async getLatestConsent(userId: string): Promise<TermsConsent | null> {
    const userConsents = this.consents
      .filter((c) => c.user_id === userId)
      .sort((a, b) => new Date(b.accepted_at).getTime() - new Date(a.accepted_at).getTime());

    return userConsents[0] || null;
  }

  async insertConsent(userId: string, termsVersion: string, ipAddress?: string): Promise<void> {
    this.consents.push({
      id: crypto.randomUUID(),
      user_id: userId,
      terms_version: termsVersion,
      accepted_at: new Date().toISOString(),
      ip_address: ipAddress,
    });
  }

  async getConsentHistory(userId: string): Promise<TermsConsent[]> {
    return this.consents
      .filter((c) => c.user_id === userId)
      .sort((a, b) => new Date(b.accepted_at).getTime() - new Date(a.accepted_at).getTime());
  }

  // Helper for tests
  seed(consents: TermsConsent[]): void {
    this.consents = [...consents];
  }
}

describe('TermsConsentService', () => {
  let repo: InMemoryTermsConsentRepository;
  let service: TermsConsentService;

  beforeEach(() => {
    repo = new InMemoryTermsConsentRepository();
    service = new TermsConsentService(repo);
  });

  describe('requiresConsent', () => {
    it('returns true when user has no consent records', async () => {
      const result = await service.requiresConsent('user-1');
      expect(result).toBe(true);
    });

    it('returns false when user has accepted the current terms version', async () => {
      repo.seed([
        {
          id: 'consent-1',
          user_id: 'user-1',
          terms_version: CURRENT_TERMS_VERSION,
          accepted_at: '2025-01-01T00:00:00Z',
        },
      ]);

      const result = await service.requiresConsent('user-1');
      expect(result).toBe(false);
    });

    it('returns true when user accepted an older terms version', async () => {
      repo.seed([
        {
          id: 'consent-1',
          user_id: 'user-1',
          terms_version: '0.9.0',
          accepted_at: '2025-01-01T00:00:00Z',
        },
      ]);

      const result = await service.requiresConsent('user-1');
      expect(result).toBe(true);
    });

    it('uses the most recent consent record for comparison', async () => {
      repo.seed([
        {
          id: 'consent-1',
          user_id: 'user-1',
          terms_version: '0.9.0',
          accepted_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'consent-2',
          user_id: 'user-1',
          terms_version: CURRENT_TERMS_VERSION,
          accepted_at: '2025-06-01T00:00:00Z',
        },
      ]);

      const result = await service.requiresConsent('user-1');
      expect(result).toBe(false);
    });
  });

  describe('recordConsent', () => {
    it('stores consent with user id and terms version', async () => {
      await service.recordConsent('user-1', CURRENT_TERMS_VERSION);

      const history = await service.getConsentHistory('user-1');
      expect(history).toHaveLength(1);
      expect(history[0].user_id).toBe('user-1');
      expect(history[0].terms_version).toBe(CURRENT_TERMS_VERSION);
      expect(history[0].accepted_at).toBeDefined();
    });

    it('stores consent with optional ip address', async () => {
      await service.recordConsent('user-1', CURRENT_TERMS_VERSION, '192.168.1.1');

      const history = await service.getConsentHistory('user-1');
      expect(history[0].ip_address).toBe('192.168.1.1');
    });

    it('allows multiple consent records for the same user', async () => {
      await service.recordConsent('user-1', '0.9.0');
      await service.recordConsent('user-1', CURRENT_TERMS_VERSION);

      const history = await service.getConsentHistory('user-1');
      expect(history).toHaveLength(2);
    });
  });

  describe('getConsentHistory', () => {
    it('returns empty array for user with no consents', async () => {
      const history = await service.getConsentHistory('user-1');
      expect(history).toEqual([]);
    });

    it('returns all consent records for a user', async () => {
      repo.seed([
        {
          id: 'consent-1',
          user_id: 'user-1',
          terms_version: '0.9.0',
          accepted_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'consent-2',
          user_id: 'user-1',
          terms_version: CURRENT_TERMS_VERSION,
          accepted_at: '2025-06-01T00:00:00Z',
        },
        {
          id: 'consent-3',
          user_id: 'user-2',
          terms_version: CURRENT_TERMS_VERSION,
          accepted_at: '2025-06-01T00:00:00Z',
        },
      ]);

      const history = await service.getConsentHistory('user-1');
      expect(history).toHaveLength(2);
      expect(history.every((c) => c.user_id === 'user-1')).toBe(true);
    });

    it('returns records ordered by most recent first', async () => {
      repo.seed([
        {
          id: 'consent-1',
          user_id: 'user-1',
          terms_version: '0.9.0',
          accepted_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'consent-2',
          user_id: 'user-1',
          terms_version: CURRENT_TERMS_VERSION,
          accepted_at: '2025-06-01T00:00:00Z',
        },
      ]);

      const history = await service.getConsentHistory('user-1');
      expect(history[0].terms_version).toBe(CURRENT_TERMS_VERSION);
      expect(history[1].terms_version).toBe('0.9.0');
    });
  });

  describe('CURRENT_TERMS_VERSION', () => {
    it('is a valid semver string', () => {
      expect(CURRENT_TERMS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
