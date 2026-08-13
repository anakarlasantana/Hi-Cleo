"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Rocket, Check, MessageCircle, ArrowRight, Sparkles, Shield, Zap, Clock } from "lucide-react"
import { applyPhoneMask } from "@/lib/masks"
import { startTrial } from "@/services/trial.service"
import { cn } from "@/lib/utils"
import Link from "next/link"

const SECRETARY_PHONE = process.env.NEXT_PUBLIC_SECRETARY_PHONE || "5511999999999"

function buildWhatsAppLink(code: string): string {
  const phone = SECRETARY_PHONE.replace(/\D/g, "")
  const text = encodeURIComponent(code)
  return `https://wa.me/${phone}?text=${text}`
}

const TRUST_SIGNALS = [
  { icon: Zap, text: "Funcionalidade completa" },
  { icon: Shield, text: "Sem cartão de crédito" },
  { icon: Clock, text: "Ativa em 30 segundos" },
]

export function TrialSection() {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [activationCode, setActivationCode] = useState("")
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.15 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  const isFormValid = name.trim().length >= 2 && phone.replace(/\D/g, "").length === 11 && termsAccepted

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid) return

    setIsLoading(true)
    setError("")

    try {
      const cleanPhone = phone.replace(/\D/g, "")
      const result = await startTrial({ name: name.trim(), phone: cleanPhone })
      setActivationCode(result.activationCode)
    } catch (err: any) {
      setError(err.message || "Erro ao iniciar teste. Tente novamente.")
    } finally {
      setIsLoading(false)
    }
  }

  // Estado de sucesso — mostra código + link WhatsApp
  if (activationCode) {
    return (
      <section id="trial" className="py-24 relative overflow-hidden">
        {/* Background festivo */}
        <div className="absolute inset-0 bg-gradient-to-b from-green-50/80 via-background to-background dark:from-green-950/20" />
        <div className="absolute top-0 left-1/4 w-72 h-72 bg-green-300/20 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 bg-primary/10 rounded-full blur-[100px] animate-pulse" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-md mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Ícone de sucesso animado */}
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 bg-green-400/20 rounded-full animate-ping" />
              <div className="relative w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-foreground">
                Pronto, {name.split(" ")[0]}! 🎉
              </h2>
              <p className="text-lg text-muted-foreground">
                Manda esse código pra Cleo no WhatsApp:
              </p>
            </div>

            {/* Código com destaque */}
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-green-500/50 rounded-2xl blur-sm" />
              <div className="relative bg-background border border-border rounded-2xl p-6">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Seu código de ativação</p>
                <p className="text-3xl font-mono font-bold text-primary tracking-[0.2em]">
                  {activationCode}
                </p>
              </div>
            </div>

            {/* Botão WhatsApp */}
            <Button asChild size="lg" className="w-full text-lg py-7 group bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/30">
              <a href={buildWhatsAppLink(activationCode)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 w-5 h-5" />
                Abrir WhatsApp e enviar pra Cleo
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </Button>

            <p className="text-sm text-muted-foreground">
              ☝️ A Cleo vai te guiar em 5 perguntas rápidas. Leva menos de 2 minutos!
            </p>
          </div>
        </div>
      </section>
    )
  }

  // Estado padrão — formulário com animações
  return (
    <section ref={sectionRef} id="trial" className="py-24 relative overflow-hidden bg-slate-900 dark:bg-slate-950">
      {/* Background decorativo escuro */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950" />
      <div className="absolute top-1/3 -left-32 w-80 h-80 bg-primary/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-80 h-80 bg-primary/15 rounded-full blur-[120px] animate-pulse" />

      {/* Sparkles decorativos */}
      <div className="absolute top-12 right-1/4 text-primary/40 animate-bounce" style={{ animationDelay: '0.5s' }}>
        <Sparkles className="w-6 h-6" />
      </div>
      <div className="absolute bottom-16 left-[15%] text-primary/30 animate-bounce" style={{ animationDelay: '1s' }}>
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="absolute top-1/2 right-12 text-primary/35 animate-bounce" style={{ animationDelay: '1.5s' }}>
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className={cn(
          "grid lg:grid-cols-2 gap-12 lg:gap-16 items-center transition-all duration-1000",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        )}>
          {/* Lado esquerdo — texto e benefícios */}
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary/20 text-primary px-4 py-1.5 rounded-full text-sm font-medium border border-primary/30">
                <Sparkles className="w-4 h-4" />
                Grátis por 7 dias
              </div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight">
                Experimente a Cleo{" "}
                <span className="relative inline-block">
                  <span className="text-primary">sem compromisso</span>
                  <span className="absolute -bottom-1 left-0 w-full h-2 bg-primary/30 rounded-full" />
                </span>
              </h2>
              <p className="text-lg text-slate-300 max-w-md">
                Sem cartão. Sem contrato. Cancela quando quiser. Veja a Cleo atendendo seus clientes em minutos.
              </p>
            </div>

            {/* Benefícios do trial */}
            <div className="space-y-3 pt-2">
              {[
                "Funcionalidade completa — igual ao plano pago",
                "30 respostas automáticas pra testar de verdade",
                "Configuração em 2 minutos pelo WhatsApp",
                "Seus clientes já começam a ser atendidos",
              ].map((text, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-slate-300 text-sm">{text}</span>
                </div>
              ))}
            </div>

            {/* Trust signals */}
            <div className={cn(
              "flex flex-wrap gap-3 pt-4 transition-all duration-700 delay-500",
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            )}>
              {TRUST_SIGNALS.map((signal, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1.5"
                >
                  <signal.icon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-slate-300">{signal.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lado direito — formulário */}
          <div className={cn(
            "transition-all duration-700 delay-300",
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          )}>
            <div className="relative">
              {/* Borda gradiente brilhante */}
              <div className="absolute -inset-[1px] bg-gradient-to-b from-primary/50 via-primary/20 to-primary/50 rounded-3xl" />

              <form onSubmit={handleSubmit} className="relative bg-slate-800/90 backdrop-blur-sm rounded-3xl p-8 space-y-5 shadow-2xl">
                <div className="text-center mb-2">
                  <p className="text-sm font-medium text-slate-300">Preencha e comece agora 👇</p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="trial-name" className="text-sm font-medium text-slate-200">
                    Seu nome
                  </label>
                  <Input
                    id="trial-name"
                    placeholder="Ex: Maria Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                    autoComplete="name"
                    className="h-12 rounded-xl bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="trial-phone" className="text-sm font-medium text-slate-200">
                    Seu WhatsApp
                  </label>
                  <Input
                    id="trial-phone"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(applyPhoneMask(e.target.value))}
                    disabled={isLoading}
                    inputMode="tel"
                    autoComplete="tel"
                    className="h-12 rounded-xl bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-400 focus:border-primary focus:ring-primary"
                  />
                </div>

                <div className="flex items-start gap-3 pt-1">
                  <input
                    type="checkbox"
                    id="trial-terms"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    disabled={isLoading}
                    className="mt-0.5 h-4 w-4 rounded border-slate-500 text-primary focus:ring-primary accent-primary"
                  />
                  <label htmlFor="trial-terms" className="text-sm text-slate-300 leading-tight cursor-pointer">
                    Aceito os{" "}
                    <Link href="/termos" className="text-primary hover:underline underline-offset-2" target="_blank">
                      Termos de Uso
                    </Link>{" "}
                    e quero receber novidades da Cleo
                  </label>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-300 bg-red-950/50 rounded-xl p-3 border border-red-800">
                    <span>⚠️</span> {error}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full text-lg py-7 rounded-xl group shadow-lg shadow-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.02]"
                  disabled={!isFormValid || isLoading}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Ativando sua conta...
                    </span>
                  ) : (
                    <>
                      <Rocket className="mr-2 w-5 h-5 group-hover:rotate-12 transition-transform" />
                      Começar meu teste grátis
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
