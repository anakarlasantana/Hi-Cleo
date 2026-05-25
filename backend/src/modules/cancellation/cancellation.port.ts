export interface Cancellation {
  id: string;
  user_id: string;
  cancelled_at: string;
  access_until: string;
  refund_eligible: boolean;
  refund_processed: boolean;
  reactivated_at: string | null;
}

export interface UserSubscription {
  id: string;
  subscription_status: string;
  subscription_started_at: string | null;
}

export interface CancellationRepository {
  getCancellation(userId: string): Promise<Cancellation | null>;
  insertCancellation(
    userId: string,
    accessUntil: Date,
    refundEligible: boolean
  ): Promise<Cancellation>;
  markReactivated(userId: string, reactivatedAt: Date): Promise<void>;
  getUserSubscription(userId: string): Promise<UserSubscription | null>;
  updateSubscriptionStatus(userId: string, status: string): Promise<void>;
  disconnectAllSessions(userId: string): Promise<void>;
  findExpiredSubscriptions(): Promise<Cancellation[]>;
  findPastGracePeriod(graceDays: number): Promise<Cancellation[]>;
  purgeUserData(userId: string): Promise<void>;
}
