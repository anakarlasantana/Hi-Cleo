import { initMercadoPago, createCardToken, getInstallments } from "@mercadopago/sdk-react"

const MERCADO_PAGO_PUBLIC_KEY = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || ""

let initialized = false

export function initializeMercadoPago() {
  if (!initialized && MERCADO_PAGO_PUBLIC_KEY) {
    initMercadoPago(MERCADO_PAGO_PUBLIC_KEY)
    initialized = true
  }
}

export interface CardTokenParams {
  cardholderName: string
  identificationType: string
  identificationNumber: string
}

/**
 * Gera um token seguro do cartão via SDK do Mercado Pago.
 * Os dados do cartão são capturados pelos Secure Fields (nunca passam pelo nosso backend).
 */
export async function generateCardToken(params: CardTokenParams): Promise<string | null> {
  try {
    const tokenResponse = await createCardToken({
      cardholderName: params.cardholderName,
      identificationType: params.identificationType,
      identificationNumber: params.identificationNumber,
    })
    return (tokenResponse as any)?.id || null
  } catch {
    return null
  }
}

/**
 * Busca parcelas disponíveis para um cartão com base no BIN (6 primeiros dígitos).
 */
export async function fetchAvailableInstallments(bin: string, amount: number) {
  try {
    const installmentOptions = await getInstallments({
      amount: String(amount),
      bin,
      locale: "pt-BR",
    })
    return installmentOptions
  } catch {
    return null
  }
}
