"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

interface ConviteOnboardingProps {
  onComplete: (data: { name: string; businessHoursStart: string; businessHoursEnd: string }) => Promise<void>
}

export function ConviteOnboarding({ onComplete }: ConviteOnboardingProps) {
  const [name, setName] = useState("")
  const [businessHoursStart, setBusinessHoursStart] = useState("08:00")
  const [businessHoursEnd, setBusinessHoursEnd] = useState("18:00")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !termsAccepted) return

    setIsSubmitting(true)
    await onComplete({ name: name.trim(), businessHoursStart, businessHoursEnd })
    setIsSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
          Seu nome
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Como quer ser chamado?"
          className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="hours-start" className="block text-sm font-medium text-foreground mb-2">
            Início do expediente
          </label>
          <input
            id="hours-start"
            type="time"
            value={businessHoursStart}
            onChange={(event) => setBusinessHoursStart(event.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label htmlFor="hours-end" className="block text-sm font-medium text-foreground mb-2">
            Fim do expediente
          </label>
          <input
            id="hours-end"
            type="time"
            value={businessHoursEnd}
            onChange={(event) => setBusinessHoursEnd(event.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex items-start gap-3">
        <input
          id="terms"
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => setTermsAccepted(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-border"
          required
        />
        <label htmlFor="terms" className="text-sm text-muted-foreground">
          Li e aceito os{" "}
          <a href="/termos" target="_blank" className="text-primary underline">
            Termos de Uso e Política de Privacidade
          </a>
        </label>
      </div>

      <Button
        type="submit"
        disabled={!name.trim() || !termsAccepted || isSubmitting}
        className="w-full"
        size="lg"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          "Continuar para conexão"
        )}
      </Button>
    </form>
  )
}
