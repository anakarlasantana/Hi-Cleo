"use client"

import { useRef, useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export function FinalCTA() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.3 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} className="py-24 relative overflow-hidden">
      {/* Background gradiente */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-[#128C7E] to-[#075E54]" />
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-[100px]" />

      <div className="container mx-auto px-4 relative z-10 text-center">
        <div className={cn(
          "transition-all duration-700",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-5 max-w-3xl mx-auto leading-tight">
            Comece a organizar seus clientes hoje
          </h2>
          <p className="text-white/70 text-lg mb-10 max-w-xl mx-auto">
            A Cleo cuida do acompanhamento pra você. Sem sistema complicado, sem computador. Tudo no WhatsApp.
          </p>

          <Button
            asChild
            size="lg"
            className="bg-white text-primary hover:bg-white/90 text-lg px-10 py-7 font-semibold group shadow-xl shadow-black/20"
          >
            <Link href="#planos">
              Escolher meu plano
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>

          <p className="text-white/50 text-sm mt-6">
            Cancele quando quiser. Sem burocracia.
          </p>
        </div>
      </div>
    </section>
  )
}
