"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft,
  CreditCard,
  QrCode,
  Lock,
  Check,
  Copy,
  Loader2,
  X,
} from "lucide-react"

const plans = {
  solo: { name: "Solo", priceMonthly: 49, priceYearly: 39, numbers: "1 número" },
  equipe: { name: "Equipe", priceMonthly: 119, priceYearly: 99, numbers: "Até 3 números" },
  empresa: { name: "Empresa", priceMonthly: 249, priceYearly: 199, numbers: "Até 8 números" },
}

type PlanKey = keyof typeof plans

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const planParam = searchParams.get("plan") || "solo"
  const billingParam = searchParams.get("billing") || "monthly"
  
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(planParam as PlanKey)
  const [isYearly, setIsYearly] = useState(billingParam === "yearly")
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("card")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixConfirmed, setPixConfirmed] = useState(false)
  const [countdown, setCountdown] = useState(30 * 60) // 30 minutes in seconds
  const [copied, setCopied] = useState(false)

  const plan = plans[selectedPlan]
  const price = isYearly ? plan.priceYearly : plan.priceMonthly

  // Countdown timer for PIX
  useEffect(() => {
    if (showPixModal && countdown > 0 && !pixConfirmed) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1)
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [showPixModal, countdown, pixConfirmed])

  // Simulate PIX confirmation after 5 seconds (for demo)
  useEffect(() => {
    if (showPixModal && !pixConfirmed) {
      const confirmTimer = setTimeout(() => {
        setPixConfirmed(true)
        setTimeout(() => {
          router.push("/ativacao")
        }, 2000)
      }, 5000)
      return () => clearTimeout(confirmTimer)
    }
  }, [showPixModal, pixConfirmed, router])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsProcessing(true)

    if (paymentMethod === "pix") {
      setTimeout(() => {
        setIsProcessing(false)
        setShowPixModal(true)
      }, 1000)
    } else {
      // Simulate card payment
      setTimeout(() => {
        setIsProcessing(false)
        router.push("/ativacao")
      }, 2000)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const pixCode = "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890520400005303986540549.005802BR5925HICLEO TECNOLOGIA LTDA6009SAO PAULO62070503***6304ABCD"

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold text-primary">Hi Cleo</span>
            </Link>
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Voltar</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
              1
            </div>
            <span className="text-sm font-medium text-foreground">Pagamento</span>
          </div>
          <div className="w-12 h-0.5 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-semibold text-sm">
              2
            </div>
            <span className="text-sm text-muted-foreground">Ativação no WhatsApp</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Form Column */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="space-y-8">
              {/* Personal Data */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-xl font-semibold text-foreground mb-6">Dados pessoais</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input id="name" placeholder="João Silva" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" placeholder="joao@email.com" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input id="cpf" placeholder="000.000.000-00" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                    <Input id="phone" placeholder="(48) 99999-9999" required />
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-xl font-semibold text-foreground mb-6">Forma de pagamento</h2>
                
                {/* Payment Tabs */}
                <div className="flex gap-4 mb-6">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("card")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all ${
                      paymentMethod === "card"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                    <span className="font-medium">Cartão de crédito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("pix")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all ${
                      paymentMethod === "pix"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    <QrCode className="w-5 h-5" />
                    <span className="font-medium">PIX</span>
                  </button>
                </div>

                {/* Card Form */}
                {paymentMethod === "card" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardNumber">Número do cartão</Label>
                      <Input id="cardNumber" placeholder="0000 0000 0000 0000" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="expiry">Validade</Label>
                        <Input id="expiry" placeholder="MM/AA" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cvv">CVV</Label>
                        <Input id="cvv" placeholder="123" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cardName">Nome no cartão</Label>
                      <Input id="cardName" placeholder="JOAO SILVA" required />
                    </div>
                  </div>
                )}

                {/* PIX Info */}
                {paymentMethod === "pix" && (
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <p className="text-muted-foreground">
                      Ao confirmar, você verá o QR Code e o código PIX para pagamento.
                      <br />
                      O pagamento é confirmado instantaneamente.
                    </p>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                size="lg"
                disabled={isProcessing}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg py-6 h-auto"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  "Confirmar pagamento"
                )}
              </Button>

              {/* Security Badges */}
              <div className="flex flex-wrap items-center justify-center gap-6 text-muted-foreground text-sm">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  <span>Pagamento seguro</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>SSL</span>
                </div>
                <div>Cancele quando quiser</div>
              </div>
            </form>
          </div>

          {/* Summary Column */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-xl p-6 sticky top-24">
              <h2 className="text-xl font-semibold text-foreground mb-6">Resumo do pedido</h2>
              
              {/* Plan Selector */}
              <div className="space-y-3 mb-6">
                {(Object.keys(plans) as PlanKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedPlan(key)}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all text-left ${
                      selectedPlan === key
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-foreground">{plans[key].name}</p>
                      <p className="text-sm text-muted-foreground">{plans[key].numbers}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground">
                        R${isYearly ? plans[key].priceYearly : plans[key].priceMonthly}
                      </p>
                      <p className="text-xs text-muted-foreground">/mês</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Billing Toggle */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg mb-6">
                <span className="text-sm font-medium text-foreground">Cobrança anual</span>
                <button
                  type="button"
                  onClick={() => setIsYearly(!isYearly)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    isYearly ? "bg-primary" : "bg-border"
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      isYearly ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              {isYearly && (
                <p className="text-sm text-primary mb-6 text-center">
                  Economize 2 meses pagando anualmente!
                </p>
              )}

              {/* What is included */}
              <div className="border-t border-border pt-6 mb-6">
                <p className="font-medium text-foreground mb-3">O que está incluso:</p>
                <ul className="space-y-2">
                  {[
                    "Contatos ilimitados",
                    "Entende áudios e textos",
                    "Acompanhamento automático",
                    "Respostas inteligentes",
                    "Suporte via WhatsApp",
                  ].map((item, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Total */}
              <div className="border-t border-border pt-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-foreground font-medium">Total</span>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-foreground">R${price}</p>
                    <p className="text-sm text-muted-foreground">
                      /{isYearly ? "mês (cobrado anualmente)" : "mês"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* PIX Modal */}
      {showPixModal && (
        <div className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowPixModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            {pixConfirmed ? (
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
                  <p className="text-3xl font-bold text-primary">R${price},00</p>
                </div>

                {/* QR Code Placeholder */}
                <div className="bg-white p-4 rounded-xl mx-auto w-fit mb-6">
                  <div className="w-48 h-48 bg-foreground/5 rounded-lg flex items-center justify-center">
                    <QrCode className="w-32 h-32 text-foreground" />
                  </div>
                </div>

                {/* Timer */}
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-1">Expira em</p>
                  <p className="text-2xl font-mono font-bold text-foreground">{formatTime(countdown)}</p>
                </div>

                {/* PIX Code */}
                <div className="mb-6">
                  <p className="text-sm text-muted-foreground mb-2">Código PIX (copia e cola)</p>
                  <div className="flex gap-2">
                    <Input
                      value={pixCode.slice(0, 30) + "..."}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => copyToClipboard(pixCode)}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Aguardando confirmação...</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
