"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { fetchInstallmentOptions, type InstallmentOption } from "@/services/payment.service"

interface InstallmentSelectorProps {
  planName: string
  billingPeriod: "monthly" | "yearly"
  selectedInstallments: number
  onSelect: (installments: number) => void
}

export function InstallmentSelector({
  planName,
  billingPeriod,
  selectedInstallments,
  onSelect,
}: InstallmentSelectorProps) {
  const [options, setOptions] = useState<InstallmentOption[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    fetchInstallmentOptions(planName, billingPeriod)
      .then((fetchedOptions) => {
        setOptions(fetchedOptions)
        // Se o selecionado atual não existe nas opções, resetar para 1
        if (!fetchedOptions.find((opt) => opt.installments === selectedInstallments)) {
          onSelect(1)
        }
      })
      .catch(() => setOptions([{ installments: 1, label: "1x (à vista)", hasInterest: false }]))
      .finally(() => setIsLoading(false))
  }, [planName, billingPeriod]) // eslint-disable-line react-hooks/exhaustive-deps

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
