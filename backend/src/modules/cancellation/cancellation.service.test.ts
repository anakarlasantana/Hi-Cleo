import { describe, it, expect, beforeEach } from 'vitest';
import {
  CancellationService,
  REFUND_PERIOD_DAYS,
  GRACE_PERIOD_DAYS,
  BILLING_CYCLE_DAYS,
} from './cancellation.service.js';
import type { Cancellation, CancellationRepository, UserSubscription } from './cancellation.port.js';

/**
 * In-memory implementation of CancellationRepository for testing.
 */
class InMemoryCancellationRepository implements CancellationRepository {
  private cancellations: Cancellation[] = [];
  private users: UserSubscription[] = [];

  async getCancellation(userId: string): Promise<Cancellation | null> {
    const userCancellations = this.cancellations
      .filter((c) => c.user_id === userId)
      .sort(
        (a, b) => new Date(b.cancelled_at).getTime() - new Date(a.cancelled_at).getTime()
      );

    return userCancellations[0] || null;
  }

  async insertCancellation(
    userId: string,
    accessUntil: Date,
    refundEligible: boolean
  ): Promise<Cancellation> {
    const cancellation: Cancellation = {
      id: crypto.randomUUID(),
      user_id: userId,
      cancelled_at: new Date().toISOString(),
      access_until: accessUntil.toISOString(),
      refund_eligible: refundEligible,
      refund_processed: false,
      reactivated_at: null,
    };
    this.cancellations.push(cancellation);
    return cancellation;
  }

  async markReactivated(userId: string, reactivatedAt: Date): Promise<void> {
    const cancellation = this.cancellations
      .filter((c) => c.user_id === userId && !c.reactivated_at)
      .sort(
        (a, b) => new Date(b.cancelled_at).getTime() - new Date(a.cancelled_at).getTime()
      )[0];

    if (cancellation) {
      cancellation.reactivated_at = reactivatedAt.toISOString();
    }
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    return this.users.find((u) => u.id === userId) || null;
  }

  async updateSubscriptionStatus(userId: string, status: string): Promise<void> {
    const user = this.users.find((u) => u.id === userId);
    if (user) {
      user.subscription_status = status;
    }
  }

  async disconnectAllSessions(userId: string): Promise<void> {
    // No-op for in-memory tests
  }

  // Helpers for tests
  seedUser(user: UserSubscription): void {
    this.users.push(user);
  }

  seedCancellation(cancellation: Cancellation): void {
    this.cancellations.push(cancellation);
  }
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

describe('CancellationService', () => {
  let repo: InMemoryCancellationRepository;
  let service: CancellationService;

  beforeEach(() => {
    repo = new InMemoryCancellationRepository();
    service = new CancellationService(repo);
  });

  describe('requestCancellation', () => {
    it('processes cancellation and returns result with access until end of billing period', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(15),
      });

      const result = await service.requestCancellation('user-1');

      expect(result.cancelledAt).toBeInstanceOf(Date);
      expect(result.accessUntil).toBeInstanceOf(Date);
      expect(result.accessUntil.getTime()).toBeGreaterThan(Date.now());
      expect(result.confirmationSent).toBe(true);
    });

    it('sets refundEligible to true when cancelled within 7 days', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(3),
      });

      const result = await service.requestCancellation('user-1');
      expect(result.refundEligible).toBe(true);
    });

    it('sets refundEligible to false when cancelled after 7 days', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(10),
      });

      const result = await service.requestCancellation('user-1');
      expect(result.refundEligible).toBe(false);
    });

    it('updates subscription status to cancelled', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(5),
      });

      await service.requestCancellation('user-1');

      const subscription = await repo.getUserSubscription('user-1');
      expect(subscription?.subscription_status).toBe('cancelled');
    });

    it('throws error when user not found', async () => {
      await expect(service.requestCancellation('nonexistent')).rejects.toThrow(
        'Usuário não encontrado'
      );
    });

    it('throws error when subscription is already cancelled', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'cancelled',
        subscription_started_at: daysAgo(10),
      });

      await expect(service.requestCancellation('user-1')).rejects.toThrow(
        'Assinatura já está cancelada'
      );
    });

    it('does not apply any penalty or additional fee', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(60),
      });

      const result = await service.requestCancellation('user-1');

      // No penalty: access is maintained until end of billing period
      expect(result.accessUntil.getTime()).toBeGreaterThanOrEqual(Date.now());
    });
  });

  describe('isEligibleForRefund', () => {
    it('returns true when within 7 days of subscription start', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(5),
      });

      const eligible = await service.isEligibleForRefund('user-1');
      expect(eligible).toBe(true);
    });

    it('returns false when past 7 days of subscription start', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(8),
      });

      const eligible = await service.isEligibleForRefund('user-1');
      expect(eligible).toBe(false);
    });

    it('returns false when subscription_started_at is null', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: null,
      });

      const eligible = await service.isEligibleForRefund('user-1');
      expect(eligible).toBe(false);
    });

    it('throws error when user not found', async () => {
      await expect(service.isEligibleForRefund('nonexistent')).rejects.toThrow(
        'Usuário não encontrado'
      );
    });
  });

  describe('reactivate', () => {
    it('reactivates subscription within grace period', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'cancelled',
        subscription_started_at: daysAgo(45),
      });
      repo.seedCancellation({
        id: 'cancel-1',
        user_id: 'user-1',
        cancelled_at: daysAgo(10),
        access_until: daysFromNow(5),
        refund_eligible: false,
        refund_processed: false,
        reactivated_at: null,
      });

      await service.reactivate('user-1', 'payment-123');

      const subscription = await repo.getUserSubscription('user-1');
      expect(subscription?.subscription_status).toBe('active');
    });

    it('throws error when grace period has expired', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'cancelled',
        subscription_started_at: daysAgo(90),
      });
      repo.seedCancellation({
        id: 'cancel-1',
        user_id: 'user-1',
        cancelled_at: daysAgo(60),
        access_until: daysAgo(35),
        refund_eligible: false,
        refund_processed: false,
        reactivated_at: null,
      });

      await expect(service.reactivate('user-1', 'payment-123')).rejects.toThrow(
        'Período de reativação expirado'
      );
    });

    it('throws error when subscription is not cancelled', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(10),
      });

      await expect(service.reactivate('user-1', 'payment-123')).rejects.toThrow(
        'Assinatura não está cancelada'
      );
    });

    it('throws error when already reactivated', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'cancelled',
        subscription_started_at: daysAgo(45),
      });
      repo.seedCancellation({
        id: 'cancel-1',
        user_id: 'user-1',
        cancelled_at: daysAgo(10),
        access_until: daysFromNow(5),
        refund_eligible: false,
        refund_processed: false,
        reactivated_at: daysAgo(2),
      });

      await expect(service.reactivate('user-1', 'payment-123')).rejects.toThrow(
        'Assinatura já foi reativada'
      );
    });

    it('throws error when user not found', async () => {
      await expect(service.reactivate('nonexistent', 'payment-123')).rejects.toThrow(
        'Usuário não encontrado'
      );
    });
  });

  describe('getGracePeriodEnd', () => {
    it('returns grace period end date (30 days after access_until)', async () => {
      const accessUntil = daysFromNow(10);
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'cancelled',
        subscription_started_at: daysAgo(30),
      });
      repo.seedCancellation({
        id: 'cancel-1',
        user_id: 'user-1',
        cancelled_at: daysAgo(5),
        access_until: accessUntil,
        refund_eligible: false,
        refund_processed: false,
        reactivated_at: null,
      });

      const gracePeriodEnd = await service.getGracePeriodEnd('user-1');

      expect(gracePeriodEnd).toBeInstanceOf(Date);
      const expectedEnd = new Date(accessUntil);
      expectedEnd.setDate(expectedEnd.getDate() + GRACE_PERIOD_DAYS);
      // Allow 1 second tolerance for test execution time
      expect(Math.abs(gracePeriodEnd!.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it('returns null when no cancellation exists', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(10),
      });

      const gracePeriodEnd = await service.getGracePeriodEnd('user-1');
      expect(gracePeriodEnd).toBeNull();
    });

    it('returns null when cancellation was already reactivated', async () => {
      repo.seedUser({
        id: 'user-1',
        subscription_status: 'active',
        subscription_started_at: daysAgo(30),
      });
      repo.seedCancellation({
        id: 'cancel-1',
        user_id: 'user-1',
        cancelled_at: daysAgo(10),
        access_until: daysFromNow(5),
        refund_eligible: false,
        refund_processed: false,
        reactivated_at: daysAgo(2),
      });

      const gracePeriodEnd = await service.getGracePeriodEnd('user-1');
      expect(gracePeriodEnd).toBeNull();
    });
  });

  describe('calculateAccessUntil', () => {
    it('returns end of current billing cycle', () => {
      const startedAt = daysAgo(15);
      const accessUntil = service.calculateAccessUntil(startedAt);

      // Started 15 days ago, so current cycle ends in ~15 days
      const expectedEnd = new Date(startedAt);
      expectedEnd.setDate(expectedEnd.getDate() + BILLING_CYCLE_DAYS);

      expect(Math.abs(accessUntil.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it('handles multiple billing cycles correctly', () => {
      const startedAt = daysAgo(45);
      const accessUntil = service.calculateAccessUntil(startedAt);

      // Started 45 days ago: 1 complete cycle (30 days), currently in 2nd cycle
      // 2nd cycle ends at day 60 from start = 15 days from now
      const expectedEnd = new Date(startedAt);
      expectedEnd.setDate(expectedEnd.getDate() + 2 * BILLING_CYCLE_DAYS);

      expect(Math.abs(accessUntil.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it('returns current date when subscription_started_at is null', () => {
      const accessUntil = service.calculateAccessUntil(null);
      expect(Math.abs(accessUntil.getTime() - Date.now())).toBeLessThan(1000);
    });
  });

  describe('checkRefundEligibility', () => {
    it('returns true for subscription started less than 7 days ago', () => {
      expect(service.checkRefundEligibility(daysAgo(3))).toBe(true);
      expect(service.checkRefundEligibility(daysAgo(6))).toBe(true);
    });

    it('returns true for subscription started exactly 7 days ago', () => {
      expect(service.checkRefundEligibility(daysAgo(7))).toBe(true);
    });

    it('returns false for subscription started more than 7 days ago', () => {
      expect(service.checkRefundEligibility(daysAgo(8))).toBe(false);
      expect(service.checkRefundEligibility(daysAgo(30))).toBe(false);
    });

    it('returns false when subscription_started_at is null', () => {
      expect(service.checkRefundEligibility(null)).toBe(false);
    });
  });

  describe('calculateGracePeriodEnd', () => {
    it('returns date 30 days after access_until', () => {
      const accessUntil = new Date('2025-06-01T00:00:00Z');
      const gracePeriodEnd = service.calculateGracePeriodEnd(accessUntil);

      const expected = new Date('2025-07-01T00:00:00Z');
      expect(gracePeriodEnd.getTime()).toBe(expected.getTime());
    });
  });

  describe('constants', () => {
    it('REFUND_PERIOD_DAYS is 7 (CDC requirement)', () => {
      expect(REFUND_PERIOD_DAYS).toBe(7);
    });

    it('GRACE_PERIOD_DAYS is 30 (reactivation window)', () => {
      expect(GRACE_PERIOD_DAYS).toBe(30);
    });

    it('BILLING_CYCLE_DAYS is 30 (monthly billing)', () => {
      expect(BILLING_CYCLE_DAYS).toBe(30);
    });
  });
});
