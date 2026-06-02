"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MessageCircle, ArrowRight, AlertCircle } from "lucide-react"
import { PageShell } from "@/components/layout/page-shell"
import { Confetti } from "./confetti"
import { OnboardingProgress } from "@/components/layout/onboarding-progress"
import { SuccessHero } from "./success-hero"
import { ActivationSteps } from "./activation-steps"
import { WaitingState } from "./waiting-state"
import { InfoBadges } from "./info-badges"
import Link from "next/link"

import { fetchActivationStatus } from "@/services/activation.service"
import { validateActivationCode } from "@/lib/sanitize"

const SECRETARY_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_SECRETARY_PHONE || "5548999999999"
const FORMATTED_PHONE_NUMBER = "(48) 99999-9999"
const POLLING_INTERVAL_MS = 3000

export function ActivationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawCode = searchParams.get("code") || ""
  const activationCode = validateActivationCode(rawCode) ? rawCode.toUpperCase().trim() : ""

  const [isWaitingForActivation, setIsWaitingForActivation] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const activationMessage = `${activationCode} | Seu Nome | Seu Negócio | Serviços que oferece | Horário de atendimento`
  const whatsappActivationLink = `https://wa.me/${SECRETARY_WHATSAPP_NUMBER}?text=${encodeURIComponent(activationMessage)}`

  useEffect(() => {
    if (!isWaitingForActivation || !activationCode) return

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const activationData = await fetchActivationStatus(activationCode)
        if (activationData.status === "activated") {
          clearInterval(pollingIntervalRef.current!)
          router.push(`/conectar?code=${activationCode}`)
        }
      } catch { /* retry silently */ }
    }, POLLING_INTERVAL_MS)

    return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current) }
  }, [isWaitingForActivation, activationCode, router])

  if (!activationCode) {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Código de ativação não encontrado</h1>
          <p className="text-muted-foreground mb-6">Complete o pagamento para receber seu código de ativação.</p>
          <Button asChild><Link href="/checkout">Ir para o checkout</Link></Button>
        </div>
      </PageShell>
    )
  }

  const handleOpenWhatsAppActivation = () => {
    setIsWaitingForActivation(true)
    window.open(whatsappActivationLink, "_blank")
  }

  return (
    <>
      <Confetti />
      <PageShell>
        <OnboardingProgress currentStep="ativacao" />
        <SuccessHero />
        <ActivationSteps phoneNumber={FORMATTED_PHONE_NUMBER} activationCode={activationCode} fullMessage={activationMessage} />

        <div className="text-center mb-8">
          <Button size="lg" onClick={handleOpenWhatsAppActivation}
            className="bg-gradient-to-r from-primary to-[#128C7E] hover:from-primary/90 hover:to-[#128C7E]/90 text-white font-semibold text-lg px-10 py-7 h-auto shadow-xl shadow-primary/25 rounded-2xl w-full sm:w-auto group">
            <MessageCircle className="w-6 h-6 mr-2" />
            Abrir WhatsApp e ativar
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>

        <WaitingState isWaiting={isWaitingForActivation} />
        <InfoBadges />
      </PageShell>
    </>
  )
}
