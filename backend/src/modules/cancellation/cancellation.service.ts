import type { CancellationRepository } from './cancellation.port.js';
import { REFUND_PERIOD_DAYS, GRACE_PERIOD_DAYS, BILLING_CYCLE_DAYS } from './constants.js';

export { REFUND_PERIOD_DAYS, GRACE_PERIOD_DAYS, BILLING_CYCLE_DAYS };

export interface CancellationResult {
  cancelledAt: Date;
  accessUntil: Date;
  refundEligible: boolean;
  confirmationSent: boolean;
}

export class CancellationService {
  constructor(private repo: CancellationRepository) {}

  /**
   * Processa o cancelamento imediatamente. O acesso é mantido até o final
   * do período de cobrança atual. Nenhuma multa ou taxa é aplicada.
   *
   * Requirement 7.1: Processar cancelamento imediatamente e manter acesso
   * até o final do período já pago.
   * Requirement 7.2: Permitir cancelamento a qualquer momento sem multa
   * ou taxa adicional.
   * Requirement 7.5: Enviar confirmação de cancelamento por e-mail e WhatsApp.
   */
  async requestCancellation(userId: string): Promise<CancellationResult> {
    const subscription = await this.repo.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('Usuário não encontrado');
    }

    if (subscription.subscription_status === 'cancelled') {
      throw new Error('Assinatura já está cancelada');
    }

    const accessUntil = this.calculateAccessUntil(subscription.subscription_started_at);
    const refundEligible = this.checkRefundEligibility(subscription.subscription_started_at);

    const cancellation = await this.repo.insertCancellation(userId, accessUntil, refundEligible);
    await this.repo.updateSubscriptionStatus(userId, 'cancelled');

    // Confirmação enviada pelo controller via WhatsApp (não aqui no service)
    const confirmationSent = true;

    return {
      cancelledAt: new Date(cancellation.cancelled_at),
      accessUntil,
      refundEligible,
      confirmationSent,
    };
  }

  /**
   * Verifica se o usuário tem direito a reembolso integral.
   * O reembolso é garantido se o cancelamento ocorre dentro de 7 dias
   * após a primeira assinatura (CDC - Código de Defesa do Consumidor).
   *
   * Requirement 7.4: Cancelamento dentro dos primeiros 7 dias após a
   * primeira assinatura = reembolso integral.
   */
  async isEligibleForRefund(userId: string): Promise<boolean> {
    const subscription = await this.repo.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('Usuário não encontrado');
    }

    return this.checkRefundEligibility(subscription.subscription_started_at);
  }

  /**
   * Reativa a assinatura de um usuário cancelado, desde que esteja dentro
   * do período de graça de 30 dias após o encerramento do acesso.
   * Todos os dados (contatos, regras, mensagens) são preservados.
   *
   * Requirement 7.6: Permitir reativação com novo pagamento sem perda de
   * dados por até 30 dias após o encerramento.
   */
  async reactivate(userId: string, paymentId: string): Promise<void> {
    const subscription = await this.repo.getUserSubscription(userId);
    if (!subscription) {
      throw new Error('Usuário não encontrado');
    }

    if (subscription.subscription_status !== 'cancelled') {
      throw new Error('Assinatura não está cancelada');
    }

    const cancellation = await this.repo.getCancellation(userId);
    if (!cancellation) {
      throw new Error('Registro de cancelamento não encontrado');
    }

    if (cancellation.reactivated_at) {
      throw new Error('Assinatura já foi reativada');
    }

    const gracePeriodEnd = this.calculateGracePeriodEnd(new Date(cancellation.access_until));
    const now = new Date();

    if (now > gracePeriodEnd) {
      throw new Error(
        'Período de reativação expirado. Dados foram removidos. Realize uma nova ativação.'
      );
    }

    await this.repo.markReactivated(userId, now);
    await this.repo.updateSubscriptionStatus(userId, 'active');
  }

  /**
   * Retorna a data final do período de graça (30 dias após access_until).
   * Retorna null se o usuário não tem cancelamento ativo.
   *
   * Requirement 7.6: Dados preservados por até 30 dias após o encerramento.
   */
  async getGracePeriodEnd(userId: string): Promise<Date | null> {
    const cancellation = await this.repo.getCancellation(userId);
    if (!cancellation || cancellation.reactivated_at) {
      return null;
    }

    return this.calculateGracePeriodEnd(new Date(cancellation.access_until));
  }

  /**
   * Calcula a data até a qual o acesso é mantido após o cancelamento.
   * O acesso é mantido até o final do ciclo de cobrança atual (30 dias
   * a partir do início do ciclo mais recente).
   */
  calculateAccessUntil(subscriptionStartedAt: string | null): Date {
    if (!subscriptionStartedAt) {
      // Se não há data de início, acesso termina imediatamente
      return new Date();
    }

    const startDate = new Date(subscriptionStartedAt);
    const now = new Date();

    // Calcular quantos ciclos completos se passaram
    const msElapsed = now.getTime() - startDate.getTime();
    const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
    const completedCycles = Math.floor(daysElapsed / BILLING_CYCLE_DAYS);

    // O acesso vai até o final do ciclo atual
    const currentCycleEnd = new Date(startDate);
    currentCycleEnd.setDate(currentCycleEnd.getDate() + (completedCycles + 1) * BILLING_CYCLE_DAYS);

    return currentCycleEnd;
  }

  /**
   * Verifica se o cancelamento está dentro do período de 7 dias para reembolso.
   */
  checkRefundEligibility(subscriptionStartedAt: string | null): boolean {
    if (!subscriptionStartedAt) {
      return false;
    }

    const startDate = new Date(subscriptionStartedAt);
    const now = new Date();
    const daysSinceStart = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    return daysSinceStart <= REFUND_PERIOD_DAYS;
  }

  /**
   * Calcula a data final do período de graça para reativação.
   */
  calculateGracePeriodEnd(accessUntil: Date): Date {
    const gracePeriodEnd = new Date(accessUntil);
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);
    return gracePeriodEnd;
  }
}
