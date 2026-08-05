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
  cpf?: string
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
  activationCode?: string
  isRenewal?: boolean
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

export interface InstallmentOption {
  installments: number
  label: string
  hasInterest: boolean
}

interface PriceResponse {
  finalPrice: number
  installmentPrice: number
  installments: number
  interestApplied: boolean
  formattedTotal: string
  formattedInstallment: string
}

const MAX_INSTALLMENTS_MONTHLY = 1
const MAX_INSTALLMENTS_YEARLY = 12

/**
 * Busca opções de parcelamento do backend com juros calculados.
 * Planos mensais não permitem parcelamento (apenas 1x).
 */
export async function fetchInstallmentOptions(
  planName: string,
  billingPeriod: "monthly" | "yearly"
): Promise<InstallmentOption[]> {
  const maxInstallments = billingPeriod === "yearly" ? MAX_INSTALLMENTS_YEARLY : MAX_INSTALLMENTS_MONTHLY

  const requests = Array.from({ length: maxInstallments }, (_, index) => {
    const installmentCount = index + 1
    return apiRequest<PriceResponse>(
      `/api/payments/price?planName=${planName}&billingPeriod=${billingPeriod}&method=credit_card&installments=${installmentCount}`
    ).then((price) => ({
      installments: installmentCount,
      label: installmentCount === 1
        ? `1x de ${price.formattedTotal} (sem juros)`
        : `${price.formattedInstallment}${price.interestApplied ? "" : " (sem juros)"}`,
      hasInterest: price.interestApplied,
    }))
  })

  return Promise.all(requests)
}
