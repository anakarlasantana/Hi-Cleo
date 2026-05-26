"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CreditCard, QrCode, Lock, Check, X, Shield, Loader2 } from "lucide-react"
import { CardNumber, SecurityCode, ExpirationDate } from "@mercadopago/sdk-react"
import { applyPhoneMask } from "@/lib/masks"
import { initializeMercadoPago } from "@/lib/mercadopago"
import { baseSchema, cardSchema, type CardFormData } from "./schema"

interface PaymentFormProps {
  paymentMethod: "pix" | "card"
  isProcessing: boolean
  onMethodChange: (method: "pix" | "card") => void
  onSubmit: (data: CardFormData) => void
}

export function PaymentForm({ paymentMethod, isProcessing, onMethodChange, onSubmit }: PaymentFormProps) {
  const schema = paymentMethod === "card" ? cardSchema : baseSchema

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CardFormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (paymentMethod === "card") {
      initializeMercadoPago()
    }
  }, [paymentMethod])

  return (
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
              onChange={(e) => setValue("phone", applyPhoneMask(e.target.value), { shouldValidate: true })}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Pagamento</h2>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button type="button" onClick={() => onMethodChange("pix")}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all ${paymentMethod === "pix" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
            <QrCode className="w-5 h-5" /><span className="font-medium">PIX</span>
          </button>
          <button type="button" onClick={() => onMethodChange("card")}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all ${paymentMethod === "card" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>
            <CreditCard className="w-5 h-5" /><span className="font-medium">Cartão</span>
          </button>
        </div>

        {paymentMethod === "card" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número do cartão</Label>
              <div className="border border-border rounded-md p-3 bg-background min-h-[42px]">
                <CardNumber placeholder="0000 0000 0000 0000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Validade</Label>
                <div className="border border-border rounded-md p-3 bg-background min-h-[42px]">
                  <ExpirationDate placeholder="MM/AA" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>CVV</Label>
                <div className="border border-border rounded-md p-3 bg-background min-h-[42px]">
                  <SecurityCode placeholder="123" />
                </div>
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
  )
}
