"use client"

import { useState, useCallback, useRef, useEffect } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
const MAX_RETRIES = 3

interface QRCodeState {
  qrCode: string | null
  status: "loading" | "ready" | "expired" | "connected" | "error"
  expiresAt: number
  errorMessage?: string
}

export function useQRConnection(code: string | null) {
  const [state, setState] = useState<QRCodeState>({ qrCode: null, status: "loading", expiresAt: 0 })
  const eventSourceRef = useRef<EventSource | null>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)

  const fetchQRCode = useCallback(async () => {
    if (!code) return
    setState((prev) => ({ ...prev, status: "loading", errorMessage: undefined }))

    try {
      const response = await fetch(`${API_URL}/api/activation/qrcode/${code}`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setState({
          qrCode: null, status: "error", expiresAt: 0,
          errorMessage: response.status === 404
            ? "Código inválido ou expirado. Solicite um novo código de ativação."
            : data.error || "Falha ao gerar QR Code. Tente novamente.",
        })
        return
      }

      const data = await response.json()
      setState({ qrCode: data.qr, status: "ready", expiresAt: Date.now() + data.expiresIn * 1000 })
      retryCountRef.current = 0

      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, status: "expired" }))
        fetchQRCode()
      }, data.expiresIn * 1000)
    } catch {
      retryCountRef.current += 1
      if (retryCountRef.current < MAX_RETRIES) {
        setTimeout(fetchQRCode, 5000)
      } else {
        setState({ qrCode: null, status: "error", expiresAt: 0, errorMessage: "Não foi possível conectar ao servidor." })
      }
    }
  }, [code])

  const connectSSE = useCallback(() => {
    if (!code) return
    if (eventSourceRef.current) eventSourceRef.current.close()

    const es = new EventSource(`${API_URL}/api/activation/qrcode/${code}/status`)
    eventSourceRef.current = es

    es.addEventListener("connected", () => {
      setState((prev) => ({ ...prev, status: "connected", qrCode: null }))
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      es.close()
    })

    es.addEventListener("status", (event) => {
      const data = JSON.parse(event.data)
      if (data.status === "open") {
        setState((prev) => ({ ...prev, status: "connected", qrCode: null }))
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
        es.close()
      }
    })
  }, [code])

  useEffect(() => {
    if (code) { fetchQRCode(); connectSSE() }
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [code, fetchQRCode, connectSSE])

  return { state, fetchQRCode }
}
