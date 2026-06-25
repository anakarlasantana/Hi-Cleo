import { randomUUID } from 'crypto';
import type { MercadoPagoPort, PaymentRepository } from './payment.port.js';
import type { PlanRepository } from '../plans/plans.port.js';
import { calculatePrice, type PlanName, type BillingPeriod } from './price-calculator.js';

interface CreatePaymentParams {
  planName: PlanName;
  billingPeriod: BillingPeriod;
  email: string;
  method: 'pix' | 'credit_card';
  cardToken?: string;
  cardBrand?: string;
  installments?: number;
  cpf?: string;
}

// Ports injetados via container (não no constructor para manter simples)
interface WebhookDeps {
  subscriptionService: { activate(email: string, orderId: string, period: 'monthly' | 'yearly', amount: number): Promise<void> };
  activationService: { generateCode(paymentId: string, plan: string): Promise<{ id: string; code: string }> };
}

export class PaymentService {
  private webhookDeps?: WebhookDeps;

  constructor(
    private mp: MercadoPagoPort,
    private repo: PaymentRepository,
    private planRepo: PlanRepository
  ) {}

  setWebhookDeps(deps: WebhookDeps) {
    this.webhookDeps = deps;
  }

  async createPayment(params: CreatePaymentParams) {
    const { planName, billingPeriod, email, method, cardToken, cardBrand, installments = 1, cpf } = params;

    const plan = await this.planRepo.getPlanLimit(planName);
    if (!plan) throw new Error(`Plano "${planName}" não encontrado`);

    const basePrice = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly_total;

    const price = calculatePrice({
      basePrice,
      monthlyPrice: plan.price_monthly,
      billingPeriod,
      paymentMethod: method,
      installments,
    });
    const externalReference = `hicleo_${randomUUID()}`;

    const paymentMethod = method === 'pix'
      ? { id: 'pix', type: 'bank_transfer' }
      : { id: cardBrand || 'visa', type: 'credit_card', token: cardToken!, installments };

    const order = await this.mp.createOrder({
      amount: price.mpAmount,
      paymentMethod,
      payerEmail: email,
      payerIdentification: cpf ? { type: 'CPF', number: cpf } : undefined,
      externalReference,
      idempotencyKey: randomUUID(),
    });

    const record = await this.repo.create({
      external_order_id: order.orderId,
      external_payment_id: order.paymentId,
      user_email: email,
      plan_name: planName,
      billing_period: billingPeriod,
      payment_method: method,
      installments,
      amount_cents: price.finalPrice,
      status: order.status === 'processed' ? 'processed' : 'pending',
      pix_qr_code: order.pixQrCode,
      pix_qr_code_base64: order.pixQrCodeBase64,
    });

    // Se pagamento aprovado na hora (cartão), gerar código de ativação imediatamente
    let activationCode: string | undefined;
    if (order.status === 'processed' && this.webhookDeps) {
      try {
        const code = await this.webhookDeps.activationService.generateCode(order.orderId, planName);
        await this.repo.linkActivationCode(record.id, code.id);
        activationCode = code.code;

        // Ativar subscription (pode não encontrar user em sandbox — não bloqueia)
        await this.webhookDeps.subscriptionService.activate(email, order.orderId, billingPeriod, price.finalPrice);
      } catch (err: any) {
        console.error('[Payment] Erro ao gerar código de ativação:', err.message, err.stack);
      }
    }

    return {
      paymentId: record.id,
      orderId: order.orderId,
      status: order.status,
      statusDetail: order.statusDetail,
      qrCode: order.pixQrCode,
      qrCodeBase64: order.pixQrCodeBase64,
      activationCode,
      ...price,
    };
  }

  async getStatus(orderId: string) {
    const record = await this.repo.findByExternalOrderId(orderId);
    if (!record) return null;

    if (record.status === 'pending') {
      try {
        const details = await this.mp.getOrder(record.external_order_id);
        if (details.status !== 'pending') {
          await this.repo.updateStatus(record.id, details.status as any, details.payments[0]?.id);
          return { status: details.status, statusDetail: details.statusDetail };
        }
      } catch { /* fallback: retorna status do banco */ }
    }

    return { status: record.status, statusDetail: record.status };
  }

  /**
   * Processa notificação do webhook do Mercado Pago.
   * Idempotente: ignora orders já processadas.
   */
  async processWebhook(orderId: string): Promise<void> {
    const existing = await this.repo.findByExternalOrderId(orderId);
    if (!existing || existing.status === 'processed') return;

    const order = await this.mp.getOrder(orderId);
    const payment = order.payments[0];

    if (order.status === 'processed' && order.statusDetail === 'accredited') {
      await this.repo.updateStatus(existing.id, 'processed', payment?.id);

      if (this.webhookDeps) {
        await this.webhookDeps.subscriptionService.activate(
          existing.user_email,
          orderId,
          existing.billing_period as 'monthly' | 'yearly',
          existing.amount_cents
        );

        const code = await this.webhookDeps.activationService.generateCode(orderId, existing.plan_name);
        await this.repo.linkActivationCode(existing.id, code.id);
      }
    } else if (['rejected', 'cancelled'].includes(order.status)) {
      await this.repo.updateStatus(existing.id, order.status as any);
    }
  }
}
