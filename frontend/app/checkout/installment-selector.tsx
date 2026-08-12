"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { fetchAvailableInstallments } from "@/lib/mercadopago"

interface InstallmentOption {
  installments: number
  label: string
}

interface InstallmentSelectorProps {
  bin: string
  amount: number
  selectedInstallments: number
  onSelect: (installments: number) => void
}

/**
 * Seletor de parcelas que consulta a API do Mercado Pago em tempo real.
 * Só aparece após o usuário digitar os 6 primeiros dígitos do cartão (BIN).
 * As opções refletem as condições reais (bandeira, banco emissor, config da conta MP).
 */
export function InstallmentSelector({
  bin,
  amount,
  selectedInstallments,
  onSelect,
}: InstallmentSelectorProps) {
  const [options, setOptions] = useState<InstallmentOption[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!bin || bin.length < 6 || !amount) {
      setOptions([])
      return
    }

    setIsLoading(true)
    fetchAvailableInstallments(bin, amount)
      .then((response) => {
        if (!response || !Array.isArray(response) || response.length === 0) {
          setOptions([{ installments: 1, label: "1x (à vista)" }])
          return
        }

        // getInstallments retorna Installments[] — cada item tem payer_costs
        const firstIssuer = response[0]
        const payerCosts = firstIssuer?.payer_costs || []

        if (!Array.isArray(payerCosts) || payerCosts.length === 0) {
          setOptions([{ installments: 1, label: "1x (à vista)" }])
          return
        }

        const parsed: InstallmentOption[] = payerCosts.map((cost) => ({
          installments: cost.installments,
          label: cost.recommended_message || `${cost.installments}x de R$ ${Number(cost.installment_amount).toFixed(2).replace(".", ",")}`,
        }))

        setOptions(parsed)

        // Se o selecionado atual não existe nas novas opções, resetar para 1
        if (!parsed.find((opt) => opt.installments === selectedInstallments)) {
          onSelect(1)
        }
      })
      .catch(() => {
        setOptions([{ installments: 1, label: "1x (à vista)" }])
      })
      .finally(() => setIsLoading(false))
  }, [bin, amount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Não mostra nada se não tem BIN suficiente
  if (!bin || bin.length < 6) return null

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando parcelas...</span>
      </div>
    )
  }

  if (options.length <= 1) return null

  return (
    <div className="space-y-2">
      <Label>Parcelas</Label>
      <select
        value={selectedInstallments}
        onChange={(event) => onSelect(Number(event.target.value))}
        className="w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        {options.map((option) => (
          <option key={option.installments} value={option.installments}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
