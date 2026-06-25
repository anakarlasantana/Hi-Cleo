import { initMercadoPago, createCardToken, getInstallments, getPaymentMethods } from "@mercadopago/sdk-react"

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
 * Retorna o token ID.
 */
export async function generateCardToken(params: CardTokenParams): Promise<string | null> {
  try {
    const tokenResponse = await createCardToken({
      cardholderName: params.cardholderName,
      identificationType: params.identificationType,
      identificationNumber: params.identificationNumber,
    })
    const response = tokenResponse as any
    return response?.id || null
  } catch (error) {
    console.error("[MercadoPago] Falha ao gerar card token:", error)
    return null
  }
}

/**
 * Detecta a bandeira do cartão (visa, master, elo, etc.) a partir do BIN (6 primeiros dígitos).
 */
export async function detectCardBrand(bin: string): Promise<string | null> {
  try {
    const methods = await getPaymentMethods({ bin })
    const results = methods as any
    // getPaymentMethods retorna array de payment methods compatíveis com o BIN
    if (Array.isArray(results) && results.length > 0) {
      return results[0].id || null
    }
    // Algumas versões retornam { results: [...] }
    if (results?.results && results.results.length > 0) {
      return results.results[0].id || null
    }
    return null
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
