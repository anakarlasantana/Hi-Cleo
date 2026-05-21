"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ArrowLeft, CreditCard, MessageCircle, QrCode, Lock,
  Check, Copy, Loader2, X, Shield,
} from "lucide-react"
import { plans, type PlanKey } from "./constants"
import { maskPhone, maskCardNumber, maskExpiry, maskCvv } from "./masks"
import { baseSchema, cardSchema, type CardFormData } from "./schema"

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>(
    (searchParams.get("plan") || "solo") as PlanKey
  )
  const [isYearly, setIsYearly] = useState(searchParams.get("billing") === "yearly")
  const [paymentMethod, setPaymentMethod] = useState<"card" | "pix">("pix")
  const [isProcessing, setIsProcessing] = useState(false)
  const [showPixModal, setShowPixModal] = useState(false)
  const [pixConfirmed, setPixConfirmed] = useState(false)
  const [countdown, setCountdown] = useState(30 * 60)
  const [copied, setCopied] = useState(false)

  const plan = plans[selectedPlan]
  const price = isYearly ? plan.priceYearly : plan.priceMonthly
  const savings = isYearly ? plan.priceMonthly * 2 : 0
  const schema = paymentMethod === "card" ? cardSchema : baseSchema

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CardFormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (showPixModal && countdown > 0 && !pixConfirmed) {
      const timer = setInterval(() => setCountdown((p) => p - 1), 1000)
      return () => clearInterval(timer)
    }
  }, [showPixModal, countdown, pixConfirmed])

  useEffect(() => {
    if (showPixModal && !pixConfirmed) {
      const t = setTimeout(() => {
        setPixConfirmed(true)
        setTimeout(() => router.push("/ativacao"), 2000)
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [showPixModal, pixConfirmed, router])

  const onSubmit = () => {
    setIsProcessing(true)
    if (paymentMethod === "pix") {
      setTimeout(() => { setIsProcessing(false); setShowPixModal(true) }, 1000)
    } else {
      setTimeout(() => { setIsProcessing(false); router.push("/ativacao") }, 2000)
    }
  }

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`

  const pixCode = "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef12345678905204000053039865802BR5925HICLEO6304ABCD"

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-1/4 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      <header className="border-b border-border bg-card/80 backdrop-blur-sm relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">Hi Cleo</span>
          </Link>
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Voltar</span>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 relative z-10">
        {/* Progress */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">1</div>
            <span className="text-sm font-medium text-foreground">Pagamento</span>
          </div>
          <div className="w-12 h-0.5 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-semibold text-sm">2</div>
            <span className="text-sm text-muted-foreground">Ativação</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Seus dados</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome completo</Label>
                    <Input id="name" placeholder="João Silva" {...register("name")} />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" placeholder="joao@email.com" {...register("email")} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <Label htmlFor="phone">WhatsApp</Label>
                    <Input
                      id="phone"
                      placeholder="(48) 99999-9999"
                      {...register("phone")}
                      onChange={(e) => setValue("phone", maskPhone(e.target.value), { shouldValidate: true })}
                    />
                    {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Pagamento</h2>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button type="button" onClick={() => setPaymentMethod("pix")}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all ${paymentMethod === "pix" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                    <QrCode className="w-5 h-5" /><span className="font-medium">PIX</span>
                  </button>
                  <button type="button" onClick={() => setPaymentMethod("card")}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all ${paymentMethod === "card" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
                    <CreditCard className="w-5 h-5" /><span className="font-medium">Cartão</span>
                  </button>
                </div>

                {paymentMethod === "card" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardNumber">Número do cartão</Label>
                      <Input id="cardNumber" placeholder="0000 0000 0000 0000" {...register("cardNumber")}
                        onChange={(e) => setValue("cardNumber", maskCardNumber(e.target.value), { shouldValidate: true })} />
                      {errors.cardNumber && <p className="text-xs text-destructive">{errors.cardNumber.message}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="expiry">Validade</Label>
                        <Input id="expiry" placeholder="MM/AA" {...register("expiry")}
                          onChange={(e) => setValue("expiry", maskExpiry(e.target.value), { shouldValidate: true })} />
                        {errors.expiry && <p className="text-xs text-destructive">{errors.expiry.message}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cvv">CVV</Label>
                        <Input id="cvv" placeholder="123" {...register("cvv")}
                          onChange={(e) => setValue("cvv", maskCvv(e.target.value), { shouldValidate: true })} />
                        {errors.cvv && <p className="text-xs text-destructive">{errors.cvv.message}</p>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cardName">Nome no cartão</Label>
                      <Input id="cardName" placeholder="JOAO SILVA" {...register("cardName")} className="uppercase" />
                      {errors.cardName && <p className="text-xs text-destructive">{errors.cardName.message}</p>}
                    </div>
                  </div>
                ) : (
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <p className="text-sm text-muted-foreground">Ao confirmar, você verá o QR Code PIX para pagamento instantâneo.</p>
                  </div>
                )}
              </div>

              <Button type="submit" size="lg" disabled={isProcessing}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg py-6 h-auto shadow-lg shadow-primary/25">
                {isProcessing
                  ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Processando...</>
                  : <><Lock className="w-4 h-4 mr-2" />{paymentMethod === "pix" ? "Gerar PIX" : "Pagar agora"}</>}
              </Button>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1 text-center">
                  <Shield className="w-5 h-5 text-primary" /><span className="text-xs text-muted-foreground">Pagamento seguro</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <Check className="w-5 h-5 text-primary" /><span className="text-xs text-muted-foreground">7 dias de garantia</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                  <X className="w-5 h-5 text-primary" /><span className="text-xs text-muted-foreground">Cancele quando quiser</span>
                </div>
              </div>
            </form>
          </div>

          {/* Summary */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-xl p-6 sticky top-24">
              <h2 className="text-lg font-semibold text-foreground mb-5">Resumo</h2>
              <div className="space-y-2 mb-5">
                {(Object.keys(plans) as PlanKey[]).map((key) => (
                  <button key={key} type="button" onClick={() => setSelectedPlan(key)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all text-left ${selectedPlan === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{plans[key].name}</p>
                      <p className="text-xs text-muted-foreground">{plans[key].users}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-foreground text-sm">R${isYearly ? plans[key].priceYearly.toFixed(2).replace(".", ",") : plans[key].priceMonthly}</p>
                      <p className="text-xs text-muted-foreground">/mês</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-5">
                <span className="text-sm font-medium text-foreground">Anual</span>
                <button type="button" onClick={() => setIsYearly(!isYearly)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isYearly ? "bg-primary" : "bg-border"}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${isYearly ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
              {isYearly && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 mb-5 text-center">
                  <p className="text-sm text-primary font-medium">Economia de R${savings},00/ano</p>
                </div>
              )}

              <div className="border-t border-border pt-5 mb-5">
                <ul className="space-y-2">
                  {["Contatos ilimitados", "Entende áudios e textos", "Acompanhamento automático", "Respostas inteligentes", "Suporte via WhatsApp"].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary flex-shrink-0" />{item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-border pt-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-foreground font-medium">Total</span>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground">
                      R${isYearly ? price.toFixed(2).replace(".", ",") : price}<span className="text-sm font-normal text-muted-foreground">/mês</span>
                    </p>
                    {isYearly && <p className="text-xs text-muted-foreground">R${plan.yearlyTotal.toLocaleString("pt-BR")} cobrado anualmente</p>}
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
            <button onClick={() => setShowPixModal(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
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
                  <p className="text-3xl font-bold text-primary">R${isYearly ? plan.yearlyTotal.toLocaleString("pt-BR") : `${plan.priceMonthly},00`}</p>
                  {isYearly && <p className="text-sm text-muted-foreground mt-1">Pagamento único anual</p>}
                </div>
                <div className="bg-white p-4 rounded-xl mx-auto w-fit mb-6">
                  <div className="w-48 h-48 bg-foreground/5 rounded-lg flex items-center justify-center">
                    <QrCode className="w-32 h-32 text-foreground" />
                  </div>
                </div>
                <div className="text-center mb-6">
                  <p className="text-sm text-muted-foreground mb-1">Expira em</p>
                  <p className="text-2xl font-mono font-bold text-foreground">{formatTime(countdown)}</p>
                </div>
                <div className="mb-6">
                  <p className="text-sm text-muted-foreground mb-2">Código PIX (copia e cola)</p>
                  <div className="flex gap-2">
                    <Input value={pixCode.slice(0, 30) + "..."} readOnly className="font-mono text-xs" />
                    <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(pixCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Aguardando confirmação...</span>
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
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <CheckoutContent />
    </Suspense>
  )
}
