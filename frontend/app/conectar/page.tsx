"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { CheckCircle2, AlertCircle, MessageCircle } from "lucide-react"
import { PageShell } from "@/components/layout/page-shell"
import { useQRConnection } from "./use-qr-connection"
import { QRCodeDisplay } from "./qr-code-display"
import { ScanInstructions } from "./scan-instructions"
import { ConnectedState } from "./connected-state"

export default function ConectarPage() {
  return (
    <Suspense fallback={<PageShell><div className="flex items-center justify-center py-16"><Spinner className="w-8 h-8 text-primary" /></div></PageShell>}>
      <ConectarContent />
    </Suspense>
  )
}

function ConectarContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get("code")
  const { state, fetchQRCode } = useQRConnection(code)

  if (!code) {
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

  return (
    <PageShell>
      {/* Progress */}
      <div className="flex items-center justify-center gap-4 mb-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-primary">Ativação</span>
        </div>
        <div className="w-12 h-0.5 bg-primary" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">2</div>
          <span className="text-sm font-medium text-foreground">Conexão WhatsApp</span>
        </div>
      </div>

      {state.status === "connected" && <ConnectedState />}

      {state.status !== "connected" && (
        <>
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">
              Vincule seu WhatsApp à Cleo
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto">
              Para que a Cleo possa organizar seus clientes e responder por você, ela precisa acessar seu WhatsApp. É igual ao WhatsApp Web.
            </p>
          </div>

          <QRCodeDisplay
            status={state.status}
            qrCode={state.qrCode}
            errorMessage={state.errorMessage}
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
              <code className="text-sm font-mono text-foreground">{code}</code>
            </div>
          </div>
        </>
      )}
    </PageShell>
  )
}
