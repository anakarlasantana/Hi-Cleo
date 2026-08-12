import { MercadoPagoConfig, Order } from 'mercadopago';
import crypto from 'crypto';
import type { MercadoPagoPort, CreateOrderParams, OrderResult, OrderDetails } from './payment.port.js';

export class MercadoPagoAdapter implements MercadoPagoPort {
  private orderApi: Order;

  constructor(accessToken: string) {
    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 10000 } });
    this.orderApi = new Order(client);
  }

  async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const { amount, paymentMethod, payerEmail, payerFirstName, payerIdentification, externalReference, idempotencyKey, description } = params;

    const payer: Record<string, unknown> = { email: payerEmail };
    if (payerFirstName) {
      payer.first_name = payerFirstName;
    }
    if (payerIdentification) {
      payer.identification = payerIdentification;
    }

    const body = {
      type: 'online',
      processing_mode: 'automatic',
      total_amount: amount,
      external_reference: externalReference,
      description: description || 'Assinatura Hi Cleo',
      payer,
      transactions: {
        payments: [{ amount, payment_method: paymentMethod }],
      },
    };

    console.log('[MercadoPago] createOrder body:', JSON.stringify(body, null, 2));

    try {
      const res = await this.orderApi.create({ body, requestOptions: { idempotencyKey } } as any);
      const payment = (res as any).transactions?.payments?.[0];

      return {
        orderId: (res as any).id,
        status: (res as any).status,
        statusDetail: (res as any).status_detail,
        pixQrCode: payment?.payment_method?.qr_code,
        pixQrCodeBase64: payment?.payment_method?.qr_code_base64,
        paymentId: payment?.id,
      };
    } catch (error: any) {
      console.error('[MercadoPago] createOrder error:', JSON.stringify(error?.response?.data || error?.cause || error?.message || error));
      throw error;
    }
  }

  async getOrder(orderId: string): Promise<OrderDetails> {
    const res = await this.orderApi.get({ id: orderId } as any);
    const payments = ((res as any).transactions?.payments || []).map((p: any) => ({
      id: p.id, status: p.status, statusDetail: p.status_detail, amount: p.amount,
    }));

    return {
      id: (res as any).id,
      status: (res as any).status,
      statusDetail: (res as any).status_detail,
      externalReference: (res as any).external_reference,
      totalAmount: (res as any).total_amount,
      payments,
    };
  }

  validateWebhookSignature(xSignature: string, xRequestId: string, dataId: string, secret: string): boolean {
    let ts: string | undefined;
    let hash: string | undefined;

    for (const part of xSignature.split(',')) {
      const [key, value] = part.split('=');
      if (key?.trim() === 'ts') ts = value?.trim();
      if (key?.trim() === 'v1') hash = value?.trim();
    }

    if (!ts || !hash) return false;

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    return expected === hash;
  }
}
