"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MessageCircle, ArrowRight, AlertCircle } from "lucide-react"
import { PageShell } from "@/components/layout/page-shell"
import { Confetti } from "./confetti"
import { ProgressSteps } from "./progress-steps"
import { SuccessHero } from "./success-hero"
import { ActivationSteps } from "./activation-steps"
import { WaitingState } from "./waiting-state"
import { InfoBadges } from "./info-badges"
import Link from "next/link"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
const SECRETARY_PHONE = process.env.NEXT_PUBLIC_SECRETARY_PHONE || "5548999999999"
const PHONE_NUMBER = "(48) 99999-9999"

function ActivationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get("code") || ""

  const [waitingActivation, setWaitingActivation] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const fullMessage = `${code} | Seu Nome | Seu Negócio | Serviços que oferece | Horário de atendimento`
  const whatsappLink = `https://wa.me/${SECRETARY_PHONE}?text=${encodeURIComponent(fullMessage)}`

  useEffect(() => {
    if (!waitingActivation || !code) return

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/activation/status/${code}`)
        const data = await res.json()
        if (data.status === "activated") {
          clearInterval(pollingRef.current!)
          router.push(`/conectar?code=${code}`)
        }
      } catch { /* retry silently */ }
    }, 3000)

    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [waitingActivation, code, router])

  if (!code) {
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

  const handleOpenWhatsApp = () => {
    setWaitingActivation(true)
    window.open(whatsappLink, "_blank")
  }

  return (
    <>
      <Confetti />
      <PageShell>
        <ProgressSteps />
        <SuccessHero />
        <ActivationSteps phoneNumber={PHONE_NUMBER} activationCode={code} fullMessage={fullMessage} />

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

export default function ActivationPage() {
  return (
    <Suspense fallback={<PageShell><div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div></PageShell>}>
      <ActivationContent />
    </Suspense>
  )
}
