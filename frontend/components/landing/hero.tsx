"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, Check } from "lucide-react"
import Link from "next/link"
import { PhoneMockup } from "./phone-mockup"

const ROTATING_WORDS = ["clientes", "alunos", "pacientes", "leads", "contatos"]
const ROTATION_INTERVAL_MS = 3000

export function Hero() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((previous) => (previous + 1) % ROTATING_WORDS.length)
    }, ROTATION_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
      <div className="absolute top-1/3 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Texto à esquerda */}
          <div className="space-y-8">
            <h1 className="text-4xl md:text-5xl lg:text-5xl font-bold text-foreground leading-tight">
              Conheça a{" "}
              <span className="relative inline-block">
                <span className="text-primary">Cleo! </span>
                <span className="absolute -bottom-1 left-0 w-full h-3 bg-primary/20 rounded-full animate-pulse" />
              </span>
              {" "}Sua secretária virtual no{" "}
              <span className="relative inline-block">
                <span className="text-primary">WhatsApp.</span>
                <span className="absolute -bottom-1 left-0 w-full h-3 bg-primary/20 rounded-full animate-pulse" />
              </span>
              <br />
              <span className="text-secondary">
                Organiza seus{" "}
                <span className="relative inline-block min-w-[160px]">
                  <span
                    key={currentWordIndex}
                    className="text-primary font-extrabold bg-primary/10 px-2 py-0.5 rounded-lg animate-fade-in"
                  >
                    {ROTATING_WORDS[currentWordIndex]}
                  </span>
                </span>
                {" "}automaticamente.
              </span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-lg">
              Para professores, corretores, consultores e quem vive de atendimento. Tudo no celular, sem sistema complicado.
            </p>

            {/* Bullets */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary shrink-0" />
                <span className="text-muted-foreground">Contatos salvos automaticamente</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary shrink-0" />
                <span className="text-muted-foreground">Lembretes pra nunca esquecer de responder</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary shrink-0" />
                <span className="text-muted-foreground">Envio de materiais com um comando</span>
              </div>
            </div>

            {/* CTA */}
            <div className="space-y-2">
              <Button asChild size="lg" className="text-lg px-8 py-7 group shadow-lg shadow-primary/25">
                <Link href="#planos">
                  Quero a Cleo no meu WhatsApp
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">A partir de R$49/mês</p>
            </div>
          </div>

          {/* Celular inclinado + balões à direita */}
          <PhoneMockup />
        </div>
      </div>
    </section>
  )
}
