"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AlertCircle, MessageCircle } from "lucide-react"
import { PageShell } from "@/components/layout/page-shell"
import { OnboardingProgress } from "@/components/layout/onboarding-progress"
import { useQRConnection } from "./use-qr-connection"
import { QRCodeDisplay } from "./qr-code-display"
import { ScanInstructions } from "./scan-instructions"
import { ConnectedState } from "./connected-state"
import { TermsAcceptance } from "./terms-acceptance"

import { registerTermsConsent } from "@/services/activation.service"
import { validateActivationCode } from "@/lib/sanitize"

const TERMS_VERSION = "1.0.0"

export function ConectarContent() {
  const searchParams = useSearchParams()
  const rawCode = searchParams.get("code")
  const activationCode = rawCode && validateActivationCode(rawCode) ? rawCode.toUpperCase().trim() : null
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false)
  const [isRegisteringConsent, setIsRegisteringConsent] = useState(false)
  const { state: connectionState, fetchQRCode } = useQRConnection(hasAcceptedTerms ? activationCode : null)

  if (!activationCode) {
    return (
      <PageShell>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">Código de ativação não encontrado</h1>
          <p className="text-muted-foreground mb-6">Acesse esta página usando o link enviado após o pagamento.</p>
          <Button asChild><Link href="/">Voltar para o início</Link></Button>
        </div>
      </PageShell>
    )
  }

  const handleAcceptTermsAndRegisterConsent = async () => {
    setIsRegisteringConsent(true)
    try {
      await registerTermsConsent(activationCode!, TERMS_VERSION)
    } catch {
      // Continue even if consent API fails - don't block the user
    }
    setHasAcceptedTerms(true)
    setIsRegisteringConsent(false)
  }

  return (
    <PageShell>
      <OnboardingProgress currentStep={hasAcceptedTerms ? "conexao" : "termos"} />

      {connectionState.status === "connected" && <ConnectedState />}

      {connectionState.status !== "connected" && (
        <>
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">
              Vincule seu WhatsApp à Cleo
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              Para que a Cleo possa organizar seus clientes e responder por você, ela precisa acessar seu WhatsApp. É igual ao WhatsApp Web.
            </p>
          </div>

          {/* Termos + Aceite */}
          {!hasAcceptedTerms && (
            <TermsAcceptance
              isLoading={isRegisteringConsent}
              onAccept={handleAcceptTermsAndRegisterConsent}
            />
          )}

          {hasAcceptedTerms && (
            <>
              <QRCodeDisplay
                status={connectionState.status}
                qrCode={connectionState.qrCode}
                errorMessage={connectionState.errorMessage}
                onRetry={fetchQRCode}
              />

              <ScanInstructions />

              {/* Alternative method */}
              <div className="bg-muted rounded-xl p-6 max-w-lg mx-auto">
                <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" />
                  Método alternativo
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Se preferir, envie seu código de ativação para a Cleo no WhatsApp:
                </p>
                <div className="bg-card border border-border rounded-lg px-4 py-2">
                  <code className="text-sm font-mono text-foreground">{activationCode}</code>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  )
}
