export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled';

export interface SubscriptionRepository {
  updateFields(userId: string, fields: Record<string, unknown>): Promise<void>;
  getUserByEmail(email: string): Promise<{ id: string; phone: string; plan: string } | null>;
  getUserSubscriptionExpiry(userId: string): Promise<string | null>;
  getExpiringIn(days: number): Promise<ExpiringSubscription[]>;
  getExpired(): Promise<ExpiredSubscription[]>;
  createEvent(event: SubscriptionEvent): Promise<void>;
  disconnectAllSessionsByOwner(userId: string): Promise<number>;
}

export interface ExpiringSubscription {
  user_id: string;
  phone: string;
  plan_name: string;
  subscription_expires_at: string;
  billing_period: 'monthly' | 'yearly';
}

export interface ExpiredSubscription {
  user_id: string;
  payment_provider_id: string;
  subscription_status: string;
}

export interface SubscriptionEvent {
  user_id: string;
  event_type: 'payment_approved' | 'expired' | 'reactivated' | 'reminder_sent';
  order_id: string;
  amount_cents: number;
  metadata?: Record<string, unknown>;
}
