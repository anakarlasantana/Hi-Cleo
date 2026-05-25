"use client"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { RefreshCw, AlertCircle } from "lucide-react"

interface Props {
  status: "loading" | "ready" | "expired" | "error"
  qrCode: string | null
  errorMessage?: string
  onRetry: () => void
}

export function QRCodeDisplay({ status, qrCode, errorMessage, onRetry }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-8 mb-8 max-w-md mx-auto">
      <div className="flex flex-col items-center">
        {status === "loading" && (
          <div className="w-64 h-64 flex items-center justify-center">
            <div className="text-center">
              <Spinner className="w-8 h-8 mx-auto mb-4 text-primary" />
              <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
            </div>
          </div>
        )}

        {status === "ready" && qrCode && (
          <div className="w-64 h-64 flex items-center justify-center">
            <img src={qrCode} alt="QR Code para conexão WhatsApp" className="w-full h-full object-contain" />
          </div>
        )}

        {status === "expired" && (
          <div className="w-64 h-64 flex items-center justify-center">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 mx-auto mb-4 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Atualizando QR Code...</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="w-64 h-64 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-4 text-destructive" />
              <p className="text-sm text-destructive mb-4">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />Tentar novamente
              </Button>
            </div>
          </div>
        )}

        {status === "ready" && (
          <p className="text-xs text-muted-foreground mt-4">O QR Code atualiza automaticamente quando expira</p>
        )}
      </div>
    </div>
  )
}
