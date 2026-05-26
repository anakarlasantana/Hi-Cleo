/**
 * Aplica máscara de telefone brasileiro: (XX) XXXXX-XXXX
 */
export function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Aplica máscara de número de cartão de crédito: XXXX XXXX XXXX XXXX
 */
export function applyCardNumberMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim()
}

/**
 * Aplica máscara de validade do cartão: MM/AA
 */
export function applyExpiryMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

/**
 * Aplica máscara de CVV: 3-4 dígitos
 */
export function applyCvvMask(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4)
}
