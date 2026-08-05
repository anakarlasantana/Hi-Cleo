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
  messaging?: { sendText(options: { instance: string; to: string; text: string }): Promise<void> };
  monitorInstance?: string;
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

    // Se pagamento aprovado na hora (cartão), processar imediatamente
    let activationCode: string | undefined;
    let isRenewal = false;
    if (order.status === 'processed' && this.webhookDeps) {
      try {
        const result = await this.handleApprovedPayment(email, planName, billingPeriod, order.orderId, price.finalPrice, record.id);
        activationCode = result.activationCode;
        isRenewal = result.isRenewal;
      } catch (err: any) {
        console.error('[Payment] Erro ao processar pagamento aprovado:', err.message, err.stack);
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
      isRenewal,
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

          // Se foi aprovado agora via polling, processar pagamento (caso webhook ainda não tenha chegado)
          if (details.status === 'processed' && details.statusDetail === 'accredited' && this.webhookDeps) {
            try {
              const result = await this.handleApprovedPayment(
                record.user_email,
                record.plan_name,
                record.billing_period as 'monthly' | 'yearly',
                record.external_order_id,
                record.amount_cents,
                record.id
              );
              return { status: details.status, statusDetail: details.statusDetail, isRenewal: result.isRenewal };
            } catch { /* fallback: retorna sem isRenewal */ }
          }

          return { status: details.status, statusDetail: details.statusDetail };
        }
      } catch { /* fallback: retorna status do banco */ }
    }

    // Para pagamentos já processados, verificar se é renovação (sem activation_code_id)
    const isRenewal = record.status === 'processed' && !record.activation_code_id;
    return { status: record.status, statusDetail: record.status, isRenewal };
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
   * Centraliza a lógica pós-pagamento aprovado.
   * - Se user já existe e já tem phone (ativação completa) → é RENOVAÇÃO:
   *   apenas renova subscription e notifica via WhatsApp. Sem código novo.
   * - Se user é novo ou nunca completou ativação → gera código de ativação.
   */
  private async handleApprovedPayment(
    email: string,
    planName: string,
    billingPeriod: 'monthly' | 'yearly',
    orderId: string,
    amountCents: number,
    paymentRecordId: string,
  ): Promise<{ activationCode?: string; isRenewal: boolean }> {
    if (!this.webhookDeps) throw new Error('WebhookDeps not configured');

    // Verificar se é user existente que já completou ativação (tem phone)
    const existingUser = await this.webhookDeps.userRepo.findByEmail(email);

    if (existingUser && existingUser.phone) {
      // RENOVAÇÃO — user já existe e já ativou. Apenas renovar subscription.
      await this.webhookDeps.subscriptionService.activate(email, orderId, billingPeriod, amountCents);

      // Atualizar plano se mudou (upgrade/downgrade)
      if (existingUser.plan !== planName) {
        const { supabase } = await import('../../shared/config/supabase.js');
        await supabase.from('users').update({ plan: planName }).eq('id', existingUser.id);
      }

      // Notificar via WhatsApp que a renovação foi confirmada
      if (this.webhookDeps.messaging && this.webhookDeps.monitorInstance) {
        try {
          const periodLabel = billingPeriod === 'monthly' ? 'mensal' : 'anual';
          await this.webhookDeps.messaging.sendText({
            instance: this.webhookDeps.monitorInstance,
            to: existingUser.phone,
            text: `✅ *Pagamento confirmado!*\n\nSua assinatura do plano *${planName}* (${periodLabel}) foi renovada com sucesso.\n\nTudo continua funcionando normalmente. Pode contar comigo! 💙`,
          });
        } catch {
          // Não bloquear o fluxo se o envio falhar
        }
      }

      return { isRenewal: true };
    }

    // PRIMEIRA ATIVAÇÃO — criar/buscar user e gerar código
    const user = await this.createUserOnPayment(email, planName, billingPeriod, orderId, amountCents);
    const code = await this.webhookDeps.activationService.generateCode(orderId, planName, user.id, email);
    await this.repo.linkActivationCode(paymentRecordId, code.id);

    return { activationCode: code.code, isRenewal: false };
  }

  /**
   * Processa notificação do webhook do Mercado Pago.
   * Idempotente: ignora orders já processadas.
   * Se o user já existe e já completou ativação (tem phone), é renovação:
   * apenas renova subscription e notifica via WhatsApp.
   */
  async processWebhook(orderId: string): Promise<void> {
    const existing = await this.repo.findByExternalOrderId(orderId);
    if (!existing || existing.status === 'processed') return;

    const order = await this.mp.getOrder(orderId);
    const payment = order.payments[0];

    if (order.status === 'processed' && order.statusDetail === 'accredited') {
      await this.repo.updateStatus(existing.id, 'processed', payment?.id);

      if (this.webhookDeps) {
        await this.handleApprovedPayment(
          existing.user_email,
          existing.plan_name,
          existing.billing_period as 'monthly' | 'yearly',
          orderId,
          existing.amount_cents,
          existing.id
        );
      }
    } else if (['rejected', 'cancelled'].includes(order.status)) {
      await this.repo.updateStatus(existing.id, order.status as any);
    }
  }
}
