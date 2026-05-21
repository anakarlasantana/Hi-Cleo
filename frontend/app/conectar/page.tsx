"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  QrCode,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  HelpCircle,
  AlertCircle,
  MessageCircle,
} from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface QRCodeState {
  qrCode: string | null
  status: "loading" | "ready" | "expired" | "connected" | "error"
  expiresAt: number
  errorMessage?: string
}

export default function ConectarPage() {
  return (
    <Suspense
      fallback={
        <PageLayout>
          <div className="flex items-center justify-center py-16">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        </PageLayout>
      }
    >
      <ConectarContent />
    </Suspense>
  )
}

function ConectarContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get("code")

  const [state, setState] = useState<QRCodeState>({
    qrCode: null,
    status: "loading",
    expiresAt: 0,
  })

  const eventSourceRef = useRef<EventSource | null>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 3

  const fetchQRCode = useCallback(async () => {
    if (!code) return

    setState((prev) => ({ ...prev, status: "loading", errorMessage: undefined }))

    try {
      const response = await fetch(`${API_URL}/activation/qrcode/${code}`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        const errorMsg =
          response.status === 404
            ? "Código inválido ou expirado. Solicite um novo código de ativação."
            : data.error || "Falha ao gerar QR Code. Tente novamente."

        setState({
          qrCode: null,
          status: "error",
          expiresAt: 0,
          errorMessage: errorMsg,
        })
        return
      }

      const data = await response.json()
      const expiresAt = Date.now() + data.expiresIn * 1000

      setState({
        qrCode: data.qr,
        status: "ready",
        expiresAt,
      })

      retryCountRef.current = 0

      // Schedule auto-refresh before expiration
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
      refreshTimerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, status: "expired" }))
        fetchQRCode()
      }, data.expiresIn * 1000)
    } catch {
      retryCountRef.current += 1

      if (retryCountRef.current < MAX_RETRIES) {
        // Retry after 5 seconds
        setTimeout(fetchQRCode, 5000)
      } else {
        setState({
          qrCode: null,
          status: "error",
          expiresAt: 0,
          errorMessage: "Não foi possível conectar ao servidor. Tente novamente em alguns instantes.",
        })
      }
    }
  }, [code])

  // Listen for connection status via SSE
  const connectSSE = useCallback(() => {
    if (!code) return

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`${API_URL}/activation/qrcode/${code}/status`)
    eventSourceRef.current = es

    es.addEventListener("connected", () => {
      setState((prev) => ({ ...prev, status: "connected", qrCode: null }))

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
      es.close()
    })

    es.addEventListener("status", (event) => {
      const data = JSON.parse(event.data)
      if (data.status === "open") {
        setState((prev) => ({ ...prev, status: "connected", qrCode: null }))
        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current)
        }
        es.close()
      }
    })

    es.addEventListener("error", () => {
      // SSE will auto-reconnect, no action needed
    })
  }, [code])

  useEffect(() => {
    if (code) {
      fetchQRCode()
      connectSSE()
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [code, fetchQRCode, connectSSE])

  // No activation code provided
  if (!code) {
    return (
      <PageLayout>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-4">
            Código de ativação não encontrado
          </h1>
          <p className="text-muted-foreground mb-6">
            Acesse esta página usando o link enviado após o pagamento, que contém seu código de ativação.
          </p>
          <Button asChild>
            <Link href="/">Voltar para o início</Link>
          </Button>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4 mb-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-primary">Ativação</span>
        </div>
        <div className="w-12 h-0.5 bg-primary" />
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
            2
          </div>
          <span className="text-sm font-medium text-foreground">Conexão WhatsApp</span>
        </div>
      </div>

      {/* Connected State */}
      {state.status === "connected" && <ConnectedState />}

      {/* QR Code Display */}
      {state.status !== "connected" && (
        <>
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">
              Conecte seu WhatsApp
            </h1>
            <p className="text-lg text-muted-foreground">
              Escaneie o QR Code abaixo para vincular seu WhatsApp à Cleo.
            </p>
          </div>

          {/* QR Code Card */}
          <div className="bg-card border border-border rounded-xl p-8 mb-8 max-w-md mx-auto">
            <div className="flex flex-col items-center">
              {state.status === "loading" && (
                <div className="w-64 h-64 flex items-center justify-center">
                  <div className="text-center">
                    <Spinner className="w-8 h-8 mx-auto mb-4 text-primary" />
                    <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                  </div>
                </div>
              )}

              {state.status === "ready" && state.qrCode && (
                <div className="w-64 h-64 flex items-center justify-center">
                  <img
                    src={state.qrCode}
                    alt="QR Code para conexão WhatsApp"
                    className="w-full h-full object-contain"
                  />
                </div>
              )}

              {state.status === "expired" && (
                <div className="w-64 h-64 flex items-center justify-center">
                  <div className="text-center">
                    <RefreshCw className="w-8 h-8 mx-auto mb-4 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Atualizando QR Code...</p>
                  </div>
                </div>
              )}

              {state.status === "error" && (
                <div className="w-64 h-64 flex items-center justify-center">
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 mx-auto mb-4 text-destructive" />
                    <p className="text-sm text-destructive mb-4">{state.errorMessage}</p>
                    <Button variant="outline" size="sm" onClick={fetchQRCode}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Tentar novamente
                    </Button>
                  </div>
                </div>
              )}

              {state.status === "ready" && (
                <p className="text-xs text-muted-foreground mt-4">
                  O QR Code atualiza automaticamente quando expira
                </p>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-card border border-border rounded-xl p-6 mb-8 max-w-lg mx-auto">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              Como escanear
            </h2>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  1
                </span>
                <span>
                  Abra o <strong className="text-foreground">WhatsApp</strong> no seu celular
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  2
                </span>
                <span>
                  Toque em <strong className="text-foreground">⋮ Menu</strong> (Android) ou{" "}
                  <strong className="text-foreground">Configurações</strong> (iPhone)
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  3
                </span>
                <span>
                  Selecione <strong className="text-foreground">Dispositivos Vinculados</strong>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
                  4
                </span>
                <span>
                  Toque em <strong className="text-foreground">Vincular Dispositivo</strong> e aponte a câmera para o QR Code acima
                </span>
              </li>
            </ol>
          </div>

          {/* Alternative method - Requirement 6.5 */}
          <div className="bg-muted rounded-xl p-6 max-w-lg mx-auto">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Método alternativo
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Se preferir, você também pode receber o QR Code diretamente no WhatsApp. Envie seu código de ativação para a Cleo:
            </p>
            <div className="bg-card border border-border rounded-lg px-4 py-2">
              <code className="text-sm font-mono text-foreground">{code}</code>
            </div>
          </div>
        </>
      )}
    </PageLayout>
  )
}

function ConnectedState() {
  return (
    <div className="text-center py-8">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-12 h-12 text-primary" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
        WhatsApp conectado!
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        A Cleo está pronta para trabalhar. Agora vamos configurar como ela vai atender seus clientes.
      </p>
      <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <QrCode className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">Conexão estabelecida</p>
            <p className="text-sm text-muted-foreground">Seu WhatsApp está vinculado à Cleo</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          A Cleo vai te enviar uma mensagem no WhatsApp para iniciar a configuração. Fique de olho nas suas mensagens!
        </p>
      </div>
    </div>
  )
}

function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">Hi Cleo</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Hi Cleo. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/termos" className="text-muted-foreground hover:text-primary">
                Termos
              </Link>
              <Link href="/privacidade" className="text-muted-foreground hover:text-primary">
                Privacidade
              </Link>
              <a
                href="https://wa.me/5548999999999?text=Preciso%20de%20ajuda%20com%20a%20conexão"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <HelpCircle className="w-3 h-3" />
                Ajuda
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
