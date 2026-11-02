"use client"

import { Check } from "lucide-react"
import type { Plan, PlanKey } from "./constants"
import { formatCentsToBRL } from "@/lib/formatters"

interface CheckoutSummaryProps {
  plans: Record<string, Plan>
  selectedPlan: PlanKey
  isYearly: boolean
  onSelectPlan: (plan: PlanKey) => void
  onToggleYearly: () => void
}

/**
 * Ordem de apresentação dos planos na vitrine/checkout: Solo → Equipe → Empresa.
 * Não dependemos da ordem devolvida pela API (o backend ordena por `sort_order`,
 * mas a tela não deve quebrar se isso mudar).
 */
const PLAN_DISPLAY_ORDER = ["solo", "equipe", "empresa"]

export function CheckoutSummary({ plans, selectedPlan, isYearly, onSelectPlan, onToggleYearly }: CheckoutSummaryProps) {
  const plan = plans[selectedPlan]
  if (!plan) return null

  const price = isYearly ? plan.priceYearly : plan.priceMonthly
  const savingsInCents = isYearly ? (plan.priceMonthly * 12) - plan.yearlyTotal : 0

  return (
    <div className="bg-card border border-border rounded-xl p-6 sticky top-24">
      <h2 className="text-lg font-semibold text-foreground mb-5">Resumo</h2>

      <div className="space-y-2 mb-5">
        {PLAN_DISPLAY_ORDER.filter((key) => plans[key]).map((key) => (
          <button key={key} type="button" onClick={() => onSelectPlan(key)}
            className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${selectedPlan === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
            <div>
              <p className="font-semibold text-foreground text-sm">{plans[key].displayName}</p>
              <p className="text-xs text-muted-foreground">{plans[key].users}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-foreground text-sm">R${formatCentsToBRL(isYearly ? plans[key].yearlyTotal : plans[key].priceMonthly)}</p>
              <p className="text-xs text-muted-foreground">{isYearly ? "/ano" : "/mês"}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-5">
        <span className="text-sm font-medium text-foreground">Anual</span>
        <button type="button" onClick={onToggleYearly}
          className={`relative w-11 h-6 rounded-full transition-colors ${isYearly ? "bg-primary" : "bg-border"}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isYearly ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {isYearly && savingsInCents > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 mb-5 text-center">
          <p className="text-sm text-primary font-medium">Economia de R${formatCentsToBRL(savingsInCents)}/ano</p>
        </div>
      )}

      <div className="border-t border-border pt-5 mb-5">
        <ul className="space-y-2">
          {(plan.features || []).map((feature, index) => (
            <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="w-4 h-4 text-primary flex-shrink-0" />{feature}
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-foreground font-medium">Total</span>
          <div className="text-right">
            {isYearly ? (
              <>
                <p className="text-2xl font-bold text-foreground">
                  R${formatCentsToBRL(plan.yearlyTotal)}
                </p>
                <p className="text-xs text-muted-foreground">à vista ou até 12x no cartão</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-foreground">
                R${formatCentsToBRL(price)}<span className="text-sm font-normal text-muted-foreground">/mês</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
