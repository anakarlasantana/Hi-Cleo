"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw } from "lucide-react"
import { QRCodeDisplay } from "../qr-code-display"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

interface ConviteQrCodeProps {
  token: string
  onConnected: () => void
}

export function ConviteQrCode({ token, onConnected }: ConviteQrCodeProps) {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState("")
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)

  const fetchQrCode = useCallback(async () => {
    setStatus("loading")
    try {
      const response = await fetch(`${API_URL}/api/invites/${token}/qrcode`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setErrorMessage(data.error || "Falha ao gerar QR Code.")
        setStatus("error")
        return
      }

      const data = await response.json()
      setQrCode(data.qr)
      setStatus("ready")

      // Auto-refresh quando expira
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(fetchQrCode, data.expiresIn * 1000)
    } catch {
      setErrorMessage("Não foi possível conectar ao servidor.")
      setStatus("error")
    }
  }, [token])

  useEffect(() => {
    fetchQrCode()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [fetchQrCode])

  // SSE: detecta a conexão no mesmo instante em que o WhatsApp é vinculado.
  // Antes era polling em /validate, que nunca detectava a conexão (o convite
  // passa a "used" ao aceitar, antes mesmo do QR).
  useEffect(() => {
    if (status !== "ready") return

    const es = new EventSource(`${API_URL}/api/invites/${token}/qrcode/status`)
    eventSourceRef.current = es

    const handleConnected = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      es.close()
      onConnected()
    }

    es.addEventListener("connected", handleConnected)
    es.addEventListener("status", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data)
        if (data.status === "open") handleConnected()
      } catch {
        /* payload inválido — ignora */
      }
    })

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [status, token, onConnected])

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Gerando QR Code...</p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-4">{errorMessage}</p>
        <Button onClick={fetchQrCode} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <QRCodeDisplay
        status="ready"
        qrCode={qrCode}
        errorMessage={undefined}
        onRetry={fetchQrCode}
      />
      <p className="text-center text-sm text-muted-foreground">
        Abra o WhatsApp no celular → Dispositivos Vinculados → Vincular Dispositivo → Escaneie o QR Code acima
      </p>
    </div>
  )
}
