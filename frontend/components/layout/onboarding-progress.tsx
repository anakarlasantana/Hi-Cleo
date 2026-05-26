"use client"

import { Check } from "lucide-react"

const ONBOARDING_STEPS = [
  { key: "pagamento", label: "Pagamento" },
  { key: "ativacao", label: "Ativação" },
  { key: "termos", label: "Termo" },
  { key: "conexao", label: "Conexão" },
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]["key"]

interface OnboardingProgressProps {
  currentStep: OnboardingStep
}

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  const currentIndex = ONBOARDING_STEPS.findIndex((step) => step.key === currentStep)

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 mb-10">
      {ONBOARDING_STEPS.map((step, index) => {
        const isCompleted = index < currentIndex
        const isCurrent = index === currentIndex
        const isPending = index > currentIndex

        return (
          <div key={step.key} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold transition-colors ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : index + 1}
              </div>
              <span
                className={`text-xs sm:text-sm hidden sm:inline ${
                  isCompleted
                    ? "text-primary font-medium"
                    : isCurrent
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < ONBOARDING_STEPS.length - 1 && (
              <div
                className={`w-6 sm:w-10 h-0.5 ${
                  index < currentIndex ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
