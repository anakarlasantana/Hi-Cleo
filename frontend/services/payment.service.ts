import { apiRequest } from "@/lib/api-client"

export interface CreatePixPaymentParams {
  planName: string
  billingPeriod: "monthly" | "yearly"
  email: string
}

export interface CreateCardPaymentParams {
  planName: string
  billingPeriod: "monthly" | "yearly"
  email: string
  cardToken: string
  cardBrand: string
  installments: number
}

export interface PixPaymentResponse {
  paymentId: string
  orderId: string
  qrCode: string
  qrCodeBase64: string
  status: string
  formattedTotal: string
}

export interface CardPaymentResponse {
  paymentId: string
  orderId: string
  status: string
  statusDetail: string
  formattedTotal: string
}

export interface PaymentStatusResponse {
  status: string
  statusDetail: string
}

export async function createPixPayment(params: CreatePixPaymentParams): Promise<PixPaymentResponse> {
  return apiRequest<PixPaymentResponse>("/api/payments", {
    method: "POST",
    body: { ...params, method: "pix" },
  })
}

export async function createCardPayment(params: CreateCardPaymentParams): Promise<CardPaymentResponse> {
  return apiRequest<CardPaymentResponse>("/api/payments", {
    method: "POST",
    body: { ...params, method: "credit_card" },
  })
}

export async function fetchPaymentStatus(orderId: string): Promise<PaymentStatusResponse> {
  return apiRequest<PaymentStatusResponse>(`/api/payments/${orderId}/status`)
}
