"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Copy, Loader2, QrCode, X } from "lucide-react"

interface PixModalProps {
  qrCode: string
  qrCodeBase64: string
  amount: string
  isYearly: boolean
  confirmed: boolean
  onClose: () => void
}

export function PixModal({ qrCode, qrCodeBase64, amount, isYearly, confirmed, onClose }: PixModalProps) {
  const [countdown, setCountdown] = useState(30 * 60)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (countdown > 0 && !confirmed) {
      const timer = setInterval(() => setCountdown((p) => p - 1), 1000)
      return () => clearInterval(timer)
    }
  }, [countdown, confirmed])

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  const handleCopy = () => {
    navigator.clipboard.writeText(qrCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl max-w-md w-full p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>

        {confirmed ? (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">Pagamento confirmado!</h3>
            <p className="text-muted-foreground">Redirecionando para ativação...</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-foreground mb-2">Pague com PIX</h3>
              <p className="text-3xl font-bold text-primary">R${amount}</p>
              {isYearly && <p className="text-sm text-muted-foreground mt-1">Pagamento único anual</p>}
            </div>

            <div className="bg-white p-4 rounded-xl mx-auto w-fit mb-6">
              {qrCodeBase64 ? (
                <img src={`data:image/png;base64,${qrCodeBase64}`} alt="QR Code PIX" className="w-48 h-48" />
              ) : (
                <div className="w-48 h-48 bg-foreground/5 rounded-lg flex items-center justify-center">
                  <QrCode className="w-32 h-32 text-foreground" />
                </div>
              )}
            </div>

            <div className="text-center mb-6">
              <p className="text-sm text-muted-foreground mb-1">Expira em</p>
              <p className="text-2xl font-mono font-bold text-foreground">{formatTime(countdown)}</p>
            </div>

            {qrCode && (
              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-2">Código PIX (copia e cola)</p>
                <div className="flex gap-2">
                  <Input value={qrCode.length > 40 ? qrCode.slice(0, 40) + "..." : qrCode} readOnly className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Aguardando confirmação...</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
