/**
 * Formata um valor em centavos para moeda brasileira (R$ X.XXX,XX).
 * Ex: 4900 → "49,00" | 49900 → "499,00" | 119900 → "1.199,00"
 */
export function formatCentsToBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Formata um valor já em reais (número decimal) para moeda brasileira.
 * Ex: 49.92 → "49,92"
 */
export function formatReaisToBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
