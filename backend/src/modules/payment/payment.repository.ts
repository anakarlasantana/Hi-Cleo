import { eq } from 'drizzle-orm';
import { db } from '../../shared/config/database.js';
import { payments } from '../../shared/schema.js';
import type { PaymentRepository, PaymentRecord, PaymentStatus } from './payment.port.js';

export class DrizzlePaymentRepository implements PaymentRepository {
  async create(record: Omit<PaymentRecord, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentRecord> {
    const [data] = await db
      .insert(payments)
      .values({
        externalOrderId: record.external_order_id,
        externalPaymentId: record.external_payment_id,
        userEmail: record.user_email,
        planName: record.plan_name,
        billingPeriod: record.billing_period,
        paymentMethod: record.payment_method,
        installments: record.installments,
        amountCents: record.amount_cents,
        status: record.status,
        pixQrCode: record.pix_qr_code,
        pixQrCodeBase64: record.pix_qr_code_base64,
        activationCodeId: record.activation_code_id,
      })
      .returning();

    if (!data) throw new Error('Erro ao criar pagamento');
    return {
      id: data.id,
      external_order_id: data.externalOrderId,
      external_payment_id: data.externalPaymentId ?? undefined,
      user_email: data.userEmail,
      plan_name: data.planName,
      billing_period: data.billingPeriod as 'monthly' | 'yearly',
      payment_method: data.paymentMethod as 'pix' | 'credit_card',
      installments: data.installments,
      amount_cents: data.amountCents,
      status: data.status as PaymentStatus,
      pix_qr_code: data.pixQrCode ?? undefined,
      pix_qr_code_base64: data.pixQrCodeBase64 ?? undefined,
      activation_code_id: data.activationCodeId ?? undefined,
      created_at: data.createdAt.toISOString(),
      updated_at: data.updatedAt.toISOString(),
    };
  }

  async findByExternalOrderId(orderId: string): Promise<PaymentRecord | null> {
    const [data] = await db
      .select()
      .from(payments)
      .where(eq(payments.externalOrderId, orderId))
      .limit(1);

    if (!data) return null;
    return {
      id: data.id,
      external_order_id: data.externalOrderId,
      external_payment_id: data.externalPaymentId ?? undefined,
      user_email: data.userEmail,
      plan_name: data.planName,
      billing_period: data.billingPeriod as 'monthly' | 'yearly',
      payment_method: data.paymentMethod as 'pix' | 'credit_card',
      installments: data.installments,
      amount_cents: data.amountCents,
      status: data.status as PaymentStatus,
      pix_qr_code: data.pixQrCode ?? undefined,
      pix_qr_code_base64: data.pixQrCodeBase64 ?? undefined,
      activation_code_id: data.activationCodeId ?? undefined,
      created_at: data.createdAt.toISOString(),
      updated_at: data.updatedAt.toISOString(),
    };
  }

  async updateStatus(id: string, status: PaymentStatus, externalPaymentId?: string): Promise<void> {
    const update: Record<string, unknown> = { status, updatedAt: new Date() };
    if (externalPaymentId) update.externalPaymentId = externalPaymentId;

    await db
      .update(payments)
      .set(update)
      .where(eq(payments.id, id));
  }

  async linkActivationCode(id: string, activationCodeId: string): Promise<void> {
    await db
      .update(payments)
      .set({ activationCodeId, updatedAt: new Date() })
      .where(eq(payments.id, id));
  }
}
