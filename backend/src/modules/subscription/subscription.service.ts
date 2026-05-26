import type { SubscriptionRepository } from './subscription.port.js';

export class SubscriptionService {
  constructor(private repo: SubscriptionRepository) {}

  /**
   * Ativa ou renova assinatura após pagamento confirmado.
   * Se ainda ativo, estende a partir da expiração atual.
   * Se expirado, começa a partir de hoje.
   */
  async activate(
    userEmail: string,
    orderId: string,
    billingPeriod: 'monthly' | 'yearly',
    amountCents: number
  ): Promise<void> {
    const user = await this.repo.getUserByEmail(userEmail);
    if (!user) return;

    const now = new Date();
    const days = billingPeriod === 'monthly' ? 30 : 365;

    // Verificar se tem assinatura ativa (renovação antecipada)
    const currentExpiry = await this.repo.getUserSubscriptionExpiry(user.id);

    let expiresAt: Date;
    if (currentExpiry && new Date(currentExpiry) > now) {
      // Renovação antecipada: estende a partir da expiração atual
      expiresAt = new Date(currentExpiry);
      expiresAt.setDate(expiresAt.getDate() + days);
    } else {
      // Nova assinatura ou reativação
      expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + days);
    }

    await this.repo.updateFields(user.id, {
      payment_provider_id: orderId,
      subscription_status: 'active',
      subscription_started_at: now.toISOString(),
      subscription_expires_at: expiresAt.toISOString(),
      billing_period: billingPeriod,
    });

    await this.repo.createEvent({
      user_id: user.id,
      event_type: 'payment_approved',
      order_id: orderId,
      amount_cents: amountCents,
    });
  }

  /**
   * Marca assinaturas vencidas como "expired".
   */
  async checkExpirations(): Promise<number> {
    const expired = await this.repo.getExpired();
    let count = 0;

    for (const sub of expired) {
      await this.repo.updateFields(sub.user_id, { subscription_status: 'expired' });
      await this.repo.createEvent({
        user_id: sub.user_id,
        event_type: 'expired',
        order_id: sub.payment_provider_id || '',
        amount_cents: 0,
      });
      count++;
    }

    return count;
  }

  async getExpiringIn(days: number) {
    return this.repo.getExpiringIn(days);
  }
}
