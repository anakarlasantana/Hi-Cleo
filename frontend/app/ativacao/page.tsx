"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MessageCircle, ArrowRight } from "lucide-react"
import { PageShell } from "@/components/layout/page-shell"
import { Confetti } from "./confetti"
import { ProgressSteps } from "./progress-steps"
import { SuccessHero } from "./success-hero"
import { ActivationSteps } from "./activation-steps"
import { WaitingState } from "./waiting-state"
import { InfoBadges } from "./info-badges"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
const SECRETARY_PHONE = process.env.NEXT_PUBLIC_SECRETARY_PHONE || "5548999999999"

const PHONE_NUMBER = "(48) 99999-9999" // TODO: formatar a partir de SECRETARY_PHONE
const ACTIVATION_CODE = "ATIVAR-7X3K" // TODO: receber via query param do checkout
const FULL_MESSAGE = `${ACTIVATION_CODE} | Seu Nome | Seu Negócio | Serviços que oferece | Horário de atendimento`
const WHATSAPP_LINK = `https://wa.me/${SECRETARY_PHONE}?text=${encodeURIComponent(FULL_MESSAGE)}`

export default function ActivationPage() {
  const router = useRouter()
  const [waitingActivation, setWaitingActivation] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!waitingActivation) return

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/activation/status/${ACTIVATION_CODE}`)
        const data = await res.json()
        if (data.status === "activated") {
          clearInterval(pollingRef.current!)
          router.push(`/conectar?code=${ACTIVATION_CODE}`)
        }
      } catch { /* retry silently */ }
    }, 3000)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [waitingActivation, router])

  const handleOpenWhatsApp = () => {
    setWaitingActivation(true)
    window.open(WHATSAPP_LINK, "_blank")
  }

  return (
    <>
      <Confetti />
      <PageShell>
        <ProgressSteps />
        <SuccessHero />
        <ActivationSteps phoneNumber={PHONE_NUMBER} activationCode={ACTIVATION_CODE} fullMessage={FULL_MESSAGE} />

        <div className="text-center mb-8">
          <Button size="lg" onClick={handleOpenWhatsApp}
            className="bg-gradient-to-r from-primary to-[#128C7E] hover:from-primary/90 hover:to-[#128C7E]/90 text-white font-semibold text-lg px-10 py-7 h-auto shadow-xl shadow-primary/25 rounded-2xl w-full sm:w-auto group">
            <MessageCircle className="w-6 h-6 mr-2" />
            Abrir WhatsApp e ativar
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>

        <WaitingState isWaiting={waitingActivation} />
        <InfoBadges />
      </PageShell>
    </>
  )
}
