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
  activationService: { generateCode(paymentId: string, plan: string, userId?: string, userEmail?: string): Promise<{ id: string; code: string }> };
  userRepo: { findByEmail(email: string): Promise<any>; create(data: any): Promise<any> };
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
        // Criar user no banco vinculado ao pagamento
        const user = await this.createUserOnPayment(email, planName, billingPeriod, order.orderId, price.finalPrice);

        const code = await this.webhookDeps.activationService.generateCode(order.orderId, planName, user.id, email);
        await this.repo.linkActivationCode(record.id, code.id);
        activationCode = code.code;
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
   * Cria user no banco no momento do pagamento (com email + plan + subscription).
   * Se o user já existir pelo email, reutiliza (idempotente para retries).
   * Retry: até 3 tentativas em caso de falha.
   */
  private async createUserOnPayment(
    email: string,
    planName: string,
    billingPeriod: 'monthly' | 'yearly',
    orderId: string,
    amountCents: number,
  ): Promise<{ id: string }> {
    if (!this.webhookDeps) throw new Error('WebhookDeps not configured');

    const MAX_PAYMENT_USER_CREATION_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_PAYMENT_USER_CREATION_RETRIES; attempt++) {
      try {
        // Verificar se user já existe (idempotência)
        const existingUser = await this.webhookDeps.userRepo.findByEmail(email);
        if (existingUser) {
          // Ativar subscription no user existente
          await this.webhookDeps.subscriptionService.activate(email, orderId, billingPeriod, amountCents);
          return { id: existingUser.id };
        }

        // Criar user com email + plan (sem phone/name — será complementado na ativação)
        const now = new Date();
        const days = billingPeriod === 'monthly' ? 30 : 365;
        const expiresAt = new Date(now);
        expiresAt.setDate(expiresAt.getDate() + days);

        const user = await this.webhookDeps.userRepo.create({
          email,
          plan: planName,
          subscription_status: 'active',
          subscription_started_at: now.toISOString(),
          subscription_expires_at: expiresAt.toISOString(),
          billing_period: billingPeriod,
          payment_provider_id: orderId,
        });

        return { id: user.id };
      } catch (err: any) {
        if (attempt === MAX_PAYMENT_USER_CREATION_RETRIES) {
          console.error(`[Payment] Falha ao criar user após ${MAX_PAYMENT_USER_CREATION_RETRIES} tentativas:`, err.message);
          throw err;
        }
        // Aguarda antes de retry (backoff simples)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error('createUserOnPayment: unreachable');
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
        // Criar user vinculado ao pagamento
        const user = await this.createUserOnPayment(
          existing.user_email,
          existing.plan_name,
          existing.billing_period as 'monthly' | 'yearly',
          orderId,
          existing.amount_cents
        );

        const code = await this.webhookDeps.activationService.generateCode(orderId, existing.plan_name, user.id, existing.user_email);
        await this.repo.linkActivationCode(existing.id, code.id);
      }
    } else if (['rejected', 'cancelled'].includes(order.status)) {
      await this.repo.updateStatus(existing.id, order.status as any);
    }
  }
}
