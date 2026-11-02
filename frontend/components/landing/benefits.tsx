"use client"

import { useEffect, useRef, useState } from "react"
import { Smartphone, Mic, Clock, BookOpen, MessageSquare, Coins } from "lucide-react"
import { cn } from "@/lib/utils"

const benefits = [
  {
    icon: Smartphone,
    title: "100% no celular",
    description: "Sem painel web, sem computador. Tudo no WhatsApp que você já usa.",
  },
  {
    icon: Mic,
    title: "Entende áudio e texto",
    description: "Mande áudio ou digite. A Cleo entende os dois.",
  },
  {
    icon: Clock,
    title: "Acompanhamento automático",
    description: "Ela te avisa quando um cliente esfria. Nunca mais esqueça ninguém.",
  },
  {
    icon: BookOpen,
    title: "Contatos organizados",
    description: "Todo cliente é salvo automaticamente. Sem planilha, sem anotação.",
  },
  {
    icon: MessageSquare,
    title: "Respostas automáticas",
    description: "Atenda fora do horário com mensagens personalizadas.",
  },
  {
    icon: Coins,
    title: "Preço justo",
    description: "A partir de R$89,90/mês. Sem surpresas, sem taxa escondida.",
  },
]

function BenefitCard({ benefit, index }: { benefit: typeof benefits[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.15 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  const Icon = benefit.icon
  const isEven = index % 2 === 0

  return (
    <div
      ref={ref}
      className={cn(
        "transition-all duration-700",
        isVisible
          ? "opacity-100 translate-x-0"
          : isEven ? "opacity-0 -translate-x-12" : "opacity-0 translate-x-12"
      )}
      style={{ transitionDelay: `${index * 100}ms` }}
    >
      <div className="group relative flex items-center gap-6 py-6">
        {/* Linha vertical decorativa */}
        <div className="absolute left-[27px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-primary/20 to-transparent group-hover:via-primary/50 transition-colors" />

        {/* Ícone circular */}
        <div className="relative z-10 w-14 h-14 rounded-full bg-background border-2 border-primary/30 group-hover:border-primary group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110">
          <Icon className="w-6 h-6 text-primary" />
        </div>

        {/* Conteúdo */}
        <div className="flex-1 bg-background/80 backdrop-blur-sm rounded-2xl border border-border/50 group-hover:border-primary/30 group-hover:shadow-lg group-hover:shadow-primary/10 p-5 transition-all duration-300">
          <h3 className="text-lg font-bold text-foreground mb-1">{benefit.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{benefit.description}</p>
        </div>
      </div>
    </div>
  )
}

export function Benefits() {
  return (
    <section id="beneficios" className="py-24 relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-background to-muted/30" />
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            Tudo que você precisa pra{" "}
            <span className="text-primary">não perder clientes</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Sem complicação. Sem curva de aprendizado.
          </p>
        </div>

        {/* Layout em 2 colunas com offset */}
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-x-12">
          {/* Coluna esquerda */}
          <div className="space-y-2">
            {benefits.slice(0, 3).map((benefit, index) => (
              <BenefitCard key={index} benefit={benefit} index={index} />
            ))}
          </div>

          {/* Coluna direita (offset pra baixo) */}
          <div className="space-y-2 md:mt-16">
            {benefits.slice(3).map((benefit, index) => (
              <BenefitCard key={index + 3} benefit={benefit} index={index + 3} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
