"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { PageShell } from "@/components/layout/page-shell"
import { fetchInviteStatus, acceptInvite, type InviteValidation } from "@/services/activation.service"
import { ConviteOnboarding } from "./convite-onboarding"
import { ConviteQrCode } from "./convite-qr-code"

type ConviteStep = "loading" | "error" | "onboarding" | "qrcode" | "connected"

export function ConviteContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [step, setStep] = useState<ConviteStep>("loading")
  const [inviteData, setInviteData] = useState<InviteValidation | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [collaboratorUserId, setCollaboratorUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setErrorMessage("Link de convite inválido.")
      setStep("error")
      return
    }

    fetchInviteStatus(token)
      .then((data) => {
        if (data.valid) {
          setInviteData(data)
          setStep("onboarding")
        } else {
          setErrorMessage(
            data.error === "TOKEN_EXPIRED"
              ? "Este convite expirou. Peça um novo ao proprietário do plano."
              : data.error === "TOKEN_ALREADY_USED"
              ? "Este convite já foi utilizado."
              : "Convite inválido ou proprietário com assinatura inativa."
          )
          setStep("error")
        }
      })
      .catch(() => {
        setErrorMessage("Erro ao validar convite. Tente novamente.")
        setStep("error")
      })
  }, [token])

  const handleOnboardingComplete = async (data: {
    name: string
    businessHoursStart: string
    businessHoursEnd: string
  }) => {
    if (!token) return

    try {
      const result = await acceptInvite(token, {
        ...data,
        termsAccepted: true,
      })
      setCollaboratorUserId(result.userId)
      setStep("qrcode")
    } catch (error: any) {
      setErrorMessage(error?.message || "Erro ao aceitar convite.")
      setStep("error")
    }
  }

  if (step === "loading") {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validando convite...</p>
        </div>
      </PageShell>
    )
  }

  if (step === "error") {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Convite inválido</h1>
          <p className="text-muted-foreground mb-6">{errorMessage}</p>
          <Button asChild><Link href="/">Voltar para o início</Link></Button>
        </div>
      </PageShell>
    )
  }

  if (step === "connected") {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">WhatsApp conectado!</h1>
          <p className="text-muted-foreground">
            A Cleo já está monitorando suas conversas. Pode fechar esta página.
          </p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">
          Conecte seu WhatsApp
        </h1>
        {inviteData?.ownerName && (
          <p className="text-lg text-muted-foreground max-w-lg mx-auto">
            Você foi convidado por <span className="font-semibold text-foreground">{inviteData.ownerName}</span> para usar a Cleo.
          </p>
        )}
      </div>

      {step === "onboarding" && (
        <ConviteOnboarding onComplete={handleOnboardingComplete} />
      )}

      {step === "qrcode" && token && (
        <ConviteQrCode token={token} onConnected={() => setStep("connected")} />
      )}
    </PageShell>
  )
}
