export type PaymentStatus = 'pending' | 'processed' | 'rejected' | 'cancelled' | 'refunded';

export interface PaymentRecord {
  id: string;
  external_order_id: string;
  external_payment_id?: string;
  user_email: string;
  plan_name: string;
  billing_period: 'monthly' | 'yearly';
  payment_method: 'pix' | 'credit_card';
  installments: number;
  amount_cents: number;
  status: PaymentStatus;
  pix_qr_code?: string;
  pix_qr_code_base64?: string;
  activation_code_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRepository {
  create(record: Omit<PaymentRecord, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentRecord>;
  findByExternalOrderId(orderId: string): Promise<PaymentRecord | null>;
  updateStatus(id: string, status: PaymentStatus, externalPaymentId?: string): Promise<void>;
  linkActivationCode(id: string, activationCodeId: string): Promise<void>;
}

export interface MercadoPagoPort {
  createOrder(params: CreateOrderParams): Promise<OrderResult>;
  getOrder(orderId: string): Promise<OrderDetails>;
  validateWebhookSignature(xSignature: string, xRequestId: string, dataId: string, secret: string): boolean;
}

export interface CreateOrderParams {
  amount: string;
  paymentMethod: { id: string; type: string; token?: string; installments?: number };
  payerEmail: string;
  payerFirstName?: string;
  payerIdentification?: { type: string; number: string };
  externalReference: string;
  idempotencyKey: string;
  description?: string;
}

export interface OrderResult {
  orderId: string;
  status: string;
  statusDetail: string;
  pixQrCode?: string;
  pixQrCodeBase64?: string;
  paymentId?: string;
}

export interface OrderDetails {
  id: string;
  status: string;
  statusDetail: string;
  externalReference: string;
  totalAmount: string;
  payments: Array<{ id: string; status: string; statusDetail: string; amount: string }>;
}
