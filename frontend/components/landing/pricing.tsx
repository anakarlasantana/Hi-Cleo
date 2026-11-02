"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Check, ArrowRight } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { fetchAvailablePlans } from "@/services/plans.service"

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Catálogo de planos da landing.
 *
 * Os VALORES vêm da API (/api/activation/plans), única fonte de verdade — o
 * banco guarda os preços em centavos. Se a API falhar, usamos estes valores de
 * fallback (em reais) apenas para não quebrar a vitrine.
 */
const PLAN_CATALOG = [
  {
    key: "solo",
    name: "Solo",
    description: "1 usuário",
    fallbackMonthly: 89.9,
    fallbackYearlyTotal: 899,
    features: [
      "Contatos ilimitados",
      "Entende áudio e texto",
      "Acompanhamento automático",
      "Respostas inteligentes",
    ],
    highlighted: true,
  },
  {
    key: "equipe",
    name: "Equipe",
    description: "Até 3 usuários",
    fallbackMonthly: 239.9,
    fallbackYearlyTotal: 2399,
    features: [
      "Tudo do Solo",
      "Até 3 usuários conectados",
      "Contatos ilimitados",
      "Suporte prioritário",
    ],
    highlighted: false,
  },
  {
    key: "empresa",
    name: "Empresa",
    description: "Até 8 usuários",
    fallbackMonthly: 629.9,
    fallbackYearlyTotal: 6299,
    features: [
      "Tudo do Equipe",
      "Até 8 usuários conectados",
      "Contatos ilimitados",
      "Suporte dedicado",
    ],
    highlighted: false,
  },
]

interface DisplayPlan {
  name: string
  description: string
  monthlyPrice: number
  yearlyTotal: number
  yearlyInstallment: number
  features: string[]
  highlighted: boolean
}

function toDisplayPlan(catalog: typeof PLAN_CATALOG[number], apiPrice?: { monthlyCents: number; yearlyCents: number }): DisplayPlan {
  const monthlyPrice = apiPrice ? apiPrice.monthlyCents / 100 : catalog.fallbackMonthly
  const yearlyTotal = apiPrice ? apiPrice.yearlyCents / 100 : catalog.fallbackYearlyTotal
  return {
    name: catalog.name,
    description: catalog.description,
    monthlyPrice,
    yearlyTotal,
    yearlyInstallment: yearlyTotal / 12,
    features: catalog.features,
    highlighted: catalog.highlighted,
  }
}

function PlanCard({ plan, isYearly, index }: { plan: DisplayPlan; isYearly: boolean; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.2 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
      )}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className={cn(
        "relative rounded-3xl p-7 h-full transition-all duration-300",
        plan.highlighted
          ? "bg-gradient-to-b from-primary to-[#128C7E] text-white shadow-2xl shadow-primary/30 md:scale-105"
          : "bg-background border border-border hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1"
      )}>
        {plan.highlighted && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <span className="bg-white text-primary text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
              ⭐ Mais popular
            </span>
          </div>
        )}

        {/* Header */}
        <div className="mb-6">
          <h3 className={cn("text-2xl font-bold mb-1", plan.highlighted ? "text-white" : "text-foreground")}>
            {plan.name}
          </h3>
          <p className={cn("text-sm", plan.highlighted ? "text-white/70" : "text-muted-foreground")}>
            {plan.description}
          </p>
        </div>

        {/* Preço */}
        <div className="mb-6">
          {isYearly ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className={cn("text-sm", plan.highlighted ? "text-white/70" : "text-muted-foreground")}>R$</span>
                <span className={cn("text-5xl font-bold tracking-tight", plan.highlighted ? "text-white" : "text-foreground")}>
                  {formatBRL(plan.yearlyTotal)}
                </span>
              </div>
              <p className={cn("text-sm mt-2", plan.highlighted ? "text-white/70" : "text-muted-foreground")}>
                à vista ou até 12x de R$ {formatBRL(plan.yearlyInstallment)}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1">
                <span className={cn("text-sm", plan.highlighted ? "text-white/70" : "text-muted-foreground")}>R$</span>
                <span className={cn("text-5xl font-bold tracking-tight", plan.highlighted ? "text-white" : "text-foreground")}>
                  {formatBRL(plan.monthlyPrice)}
                </span>
                <span className={cn("text-sm", plan.highlighted ? "text-white/70" : "text-muted-foreground")}>/mês</span>
              </div>
              <p className={cn("text-xs mt-2", plan.highlighted ? "text-white/50" : "text-muted-foreground")}>
                Cobrado mensalmente
              </p>
            </>
          )}
        </div>

        {/* Divider */}
        <div className={cn("h-px mb-6", plan.highlighted ? "bg-white/20" : "bg-border")} />

        {/* Features */}
        <ul className="space-y-3 mb-8">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                plan.highlighted ? "bg-white/20" : "bg-primary/10"
              )}>
                <Check className={cn("w-3 h-3", plan.highlighted ? "text-white" : "text-primary")} strokeWidth={3} />
              </div>
              <span className={cn("text-sm", plan.highlighted ? "text-white/90" : "text-muted-foreground")}>
                {feature}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Button
          asChild
          className={cn(
            "w-full py-6 text-base font-semibold group",
            plan.highlighted
              ? "bg-white text-primary hover:bg-white/90 shadow-md"
              : ""
          )}
          variant={plan.highlighted ? "secondary" : "default"}
        >
          <Link href={`/checkout?plan=${plan.name.toLowerCase()}&billing=${isYearly ? "yearly" : "monthly"}`}>
            Assinar agora
            <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function Pricing() {
  const [isYearly, setIsYearly] = useState(false)
  const [apiPrices, setApiPrices] = useState<Record<string, { monthlyCents: number; yearlyCents: number }>>({})

  // Preços vêm da API (fonte única). Falha silenciosa → fallback do catálogo.
  useEffect(() => {
    let cancelled = false

    fetchAvailablePlans()
      .then((plansMap) => {
        if (cancelled) return
        const prices: Record<string, { monthlyCents: number; yearlyCents: number }> = {}
        for (const [key, plan] of Object.entries(plansMap)) {
          prices[key] = { monthlyCents: plan.priceMonthly, yearlyCents: plan.yearlyTotal }
        }
        setApiPrices(prices)
      })
      .catch(() => { /* mantém fallback */ })

    return () => { cancelled = true }
  }, [])

  const plans: DisplayPlan[] = PLAN_CATALOG.map((catalog) =>
    toDisplayPlan(catalog, apiPrices[catalog.key]),
  )

  return (
    <section id="planos" className="py-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/20 to-background" />
      <div className="absolute top-1/3 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/3 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
            Escolha seu plano
          </h2>

          {/* Toggle */}
          <div className="inline-flex items-center bg-muted/80 backdrop-blur-sm rounded-full p-1.5 border border-border/50">
            <button
              onClick={() => setIsYearly(false)}
              className={cn(
                "px-7 py-3 rounded-full text-sm font-semibold transition-all duration-300",
                !isYearly
                  ? "bg-primary text-white shadow-lg shadow-primary/25"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={cn(
                "px-7 py-3 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2",
                isYearly
                  ? "bg-primary text-white shadow-lg shadow-primary/25"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Anual
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-bold",
                isYearly ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
              )}>
                economize 2 meses
              </span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
          {plans.map((plan, index) => (
            <PlanCard key={index} plan={plan} isYearly={isYearly} index={index} />
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 space-y-2">
          <p className="text-sm text-muted-foreground">
            Todos os planos incluem: contatos ilimitados, áudios, acompanhamento automático, respostas inteligentes
          </p>
          <p className="text-sm text-muted-foreground">
            Precisa de mais usuários?{" "}
            <a
              href="https://wa.me/5585991870847"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium underline hover:text-primary/80"
            >
              Fale conosco
            </a>
          </p>
        </div>
      </div>
    </section>
  )
}
