"use client"

import { useRef, useState, useEffect } from "react"
import { CreditCard, QrCode, MessageCircle, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const steps = [
  {
    icon: CreditCard,
    number: "01",
    title: "Escolha seu plano",
    subtitle: "Cartão ou PIX",
  },
  {
    icon: MessageCircle,
    number: "02",
    title: "Ative no WhatsApp",
    subtitle: "Envie seu código pra Cleo",
  },
  {
    icon: QrCode,
    number: "03",
    title: "Conecte seu WhatsApp",
    subtitle: "Escaneie o QR Code",
  },
  {
    icon: Sparkles,
    number: "04",
    title: "Pronto!",
    subtitle: "A Cleo começa a trabalhar",
  },
]

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.2 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="como-funciona" className="py-20 bg-muted/60 border-y border-border/40">
      <div ref={ref} className="container mx-auto px-4">
        <h2 className={cn(
          "text-3xl md:text-4xl font-bold text-foreground text-center mb-14 transition-all duration-700",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          Como começar
        </h2>

        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {steps.map((step, index) => (
            <div
              key={index}
              className={cn(
                "group relative rounded-2xl p-6 border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-500",
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              )}
              style={{ transitionDelay: `${(index + 1) * 120}ms` }}
            >
              {/* Número grande de fundo */}
              <span className="absolute top-3 right-4 text-5xl font-black text-primary/10 group-hover:text-primary/20 transition-colors select-none">
                {step.number}
              </span>

              {/* Ícone */}
              <div className="w-12 h-12 rounded-xl bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center mb-4 transition-colors">
                <step.icon className="w-6 h-6 text-primary" />
              </div>

              {/* Texto */}
              <h3 className="text-base font-semibold text-foreground mb-1">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
