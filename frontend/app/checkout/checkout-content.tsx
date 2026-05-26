"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { type Plan, type PlanKey } from "./constants"
import { type CardFormData } from "./schema"
import { CheckoutHeader } from "./checkout-header"
import { CheckoutSummary } from "./checkout-summary"
import { PaymentForm } from "./payment-form"
import { PixModal } from "./pix-modal"
import { generateCardToken } from "@/lib/mercadopago"
import { ApiError } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { OnboardingProgress } from "@/components/layout/onboarding-progress"
import {
  createPixPayment,
  createCardPayment,
  fetchPaymentStatus,
} from "@/services/payment.service"
import { fetchAvailablePlans } from "@/services/plans.service"

export function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [plans, setPlans] = useState<Record<string, Plan>>({})
  const [isLoadingPlans, setIsLoadingPlans] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
    searchParams.get("plan") || "solo"
  )
  const [isYearly, setIsYearly] = useState(searchParams.get("billing") === "yearly")
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixConfirmed, setPixConfirmed] = useState(false)
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64: string; orderId: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Buscar planos da API
  useEffect(() => {
    fetchAvailablePlans()
      .then((plansMap) => {
        setPlans(plansMap)
        if (!plansMap[selectedPlan] && Object.keys(plansMap).length > 0) {
          setSelectedPlan(Object.keys(plansMap)[0])
        }
      })
      .catch(() => setError("Erro ao carregar planos. Tente recarregar a página."))
      .finally(() => setIsLoadingPlans(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const plan = plans[selectedPlan]

  // Polling de status do PIX
  const pollPaymentStatus = useCallback(async (orderId: string) => {
    const interval = setInterval(async () => {
      try {
        const statusData = await fetchPaymentStatus(orderId)
        if (statusData.status === "processed") {
          clearInterval(interval)
          setPixConfirmed(true)
          setTimeout(() => router.push(`/ativacao`), 2000)
        }
      } catch { /* continua polling */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [router])

  useEffect(() => {
    if (pixData?.orderId && showPixModal && !pixConfirmed) {
      const cleanup = pollPaymentStatus(pixData.orderId)
      return () => { cleanup.then(stopPolling => stopPolling?.()) }
    }
  }, [pixData, showPixModal, pixConfirmed, pollPaymentStatus])

  const handlePaymentSubmit = async (formData: CardFormData) => {
    setIsProcessing(true)
    setError(null)

    const billingPeriod = isYearly ? "yearly" : "monthly"

    try {
      if (paymentMethod === "pix") {
        const paymentData = await createPixPayment({
          planName: selectedPlan,
          billingPeriod,
          email: formData.email,
        })

        if (!paymentData.qrCode && !paymentData.qrCodeBase64) {
          throw new Error("Não foi possível gerar o QR Code PIX. Tente novamente em alguns segundos.")
        }

        setPixData({ qrCode: paymentData.qrCode, qrCodeBase64: paymentData.qrCodeBase64, orderId: paymentData.orderId })
        setShowPixModal(true)
      } else {
        const cardToken = await generateCardToken({
          cardholderName: formData.cardName || formData.name,
          identificationType: "CPF",
          identificationNumber: "",
        })

        if (!cardToken) {
          throw new Error("Não foi possível processar os dados do cartão. Verifique as informações e tente novamente.")
        }

        const paymentData = await createCardPayment({
          planName: selectedPlan,
          billingPeriod,
          email: formData.email,
          cardToken,
          cardBrand: "visa",
          installments: 1,
        })

        if (paymentData.status === "processed") {
          router.push(`/ativacao`)
        } else {
          const rejectionMessage = "Pagamento não aprovado. Tente outro cartão ou método de pagamento."
          setError(rejectionMessage)
          toast({
            variant: "destructive",
            title: "Cartão recusado",
            description: rejectionMessage,
          })
        }
      }
    } catch (submitError: any) {
      setError(submitError.message || "Erro ao processar pagamento")

      // Toast para erros de rede e temporários
      if (submitError instanceof ApiError) {
        if (submitError.statusCode === 0) {
          toast({
            variant: "destructive",
            title: "Sem conexão",
            description: "Verifique sua internet e tente novamente.",
          })
        } else if (submitError.statusCode >= 500) {
          toast({
            variant: "destructive",
            title: "Erro temporário",
            description: "Nosso servidor está instável. Tente novamente em alguns segundos.",
          })
        } else {
          toast({
            variant: "destructive",
            title: "Erro no pagamento",
            description: submitError.message,
          })
        }
      } else {
        toast({
          variant: "destructive",
          title: "Erro no pagamento",
          description: submitError.message || "Tente novamente.",
        })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const pixDisplayAmount = plan
    ? (isYearly ? plan.yearlyTotal.toLocaleString("pt-BR") : `${plan.priceMonthly},00`)
    : "0,00"

  if (isLoadingPlans) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-1/4 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      <CheckoutHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 relative z-10">
        <OnboardingProgress currentStep="pagamento" />

        {error && (
          <div className="max-w-2xl mx-auto mb-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
          <div className="lg:col-span-3">
            <PaymentForm
              paymentMethod={paymentMethod}
              isProcessing={isProcessing}
              onMethodChange={setPaymentMethod}
              onSubmit={handlePaymentSubmit}
            />
          </div>
          <div className="lg:col-span-2">
            <CheckoutSummary
              plans={plans}
              selectedPlan={selectedPlan}
              isYearly={isYearly}
              onSelectPlan={setSelectedPlan}
              onToggleYearly={() => setIsYearly(!isYearly)}
            />
          </div>
        </div>
      </main>

      {showPixModal && pixData && (
        <PixModal
          qrCode={pixData.qrCode}
          qrCodeBase64={pixData.qrCodeBase64}
          amount={pixDisplayAmount}
          isYearly={isYearly}
          confirmed={pixConfirmed}
          onClose={() => setShowPixModal(false)}
        />
      )}
    </div>
  )
}
