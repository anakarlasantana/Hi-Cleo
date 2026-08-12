"use client"

import { useState, useRef, useEffect } from "react"
import { GraduationCap, Home, Stethoscope, Briefcase, Dumbbell } from "lucide-react"
import { cn } from "@/lib/utils"

const useCases = [
  {
    icon: GraduationCap,
    profession: "Professor",
    messages: [
      { from: "user", text: "Manda o PDF da aula 3 pro João e pra Maria" },
      { from: "cleo", text: "Pronto! Enviei o material para João Silva e Maria Santos." },
    ],
    note: "Envie o arquivo para a Cleo primeiro. Depois é só pedir pra ela repassar.",
  },
  {
    icon: Home,
    profession: "Corretor",
    messages: [
      { from: "user", text: "Quem tá esperando retorno?" },
      { from: "cleo", text: "4 clientes aguardando:\n• Carlos — pediu fotos ontem\n• Ana — quer agendar visita\n• Pedro — proposta há 3 dias" },
    ],
    note: null,
  },
  {
    icon: Stethoscope,
    profession: "Clínica",
    messages: [
      { from: "user", text: "Quem não respondeu essa semana?" },
      { from: "cleo", text: "3 pacientes sem retorno:\n• Lucia — confirmação (2 dias)\n• Roberto — exame (4 dias)\n• Carla — reagendamento" },
    ],
    note: null,
  },
  {
    icon: Briefcase,
    profession: "Consultor",
    messages: [
      { from: "user", text: "Agenda retorno com empresa X pra sexta" },
      { from: "cleo", text: "Agendado! Te lembro na sexta às 9h.\nÚltima conversa: proposta enviada dia 12." },
    ],
    note: null,
  },
  {
    icon: Dumbbell,
    profession: "Personal",
    messages: [
      { from: "user", text: "Quais alunos estão sumidos?" },
      { from: "cleo", text: "2 alunos sem contato há 7+ dias:\n• Lucas — segunda passada\n• Fernanda — há 10 dias" },
    ],
    note: null,
  },
]

export function UseCases() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isAutoRotating, setIsAutoRotating] = useState(true)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.1 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  // Auto-rotação
  useEffect(() => {
    if (!isAutoRotating || !isVisible) return
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % useCases.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoRotating, isVisible])

  const handleSelectProfession = (index: number) => {
    setActiveIndex(index)
    setIsAutoRotating(false)
    // Retoma auto-rotação após 12s sem interação
    setTimeout(() => setIsAutoRotating(true), 12000)
  }

  const activeCase = useCases[activeIndex]

  return (
    <section id="para-quem" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-background to-muted/30" />
      <div className="absolute top-1/4 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      <div ref={sectionRef} className="container mx-auto px-4 relative z-10">
        {/* Título */}
        <div className={cn(
          "text-center mb-16 transition-all duration-700",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            A Cleo se adapta ao{" "}
            <span className="text-primary">seu negócio</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Não importa sua profissão. Se você atende pelo WhatsApp, a Cleo organiza pra você.
          </p>
        </div>

        {/* Layout: tabs à esquerda + conteúdo à direita */}
        <div className="max-w-5xl mx-auto grid md:grid-cols-[240px_1fr] gap-8 items-start">
          {/* Tabs verticais (desktop) / horizontais (mobile) */}
          <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0 max-w-[100vw] md:max-w-none">
            {useCases.map((useCase, index) => {
              const Icon = useCase.icon
              return (
                <button
                  key={index}
                  onClick={() => handleSelectProfession(index)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-left whitespace-nowrap md:whitespace-normal w-full",
                    activeIndex === index
                      ? "bg-primary/10 border border-primary/30 text-primary shadow-sm"
                      : "hover:bg-muted border border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    activeIndex === index ? "bg-primary/20" : "bg-muted"
                  )}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="font-medium text-sm">{useCase.profession}</span>
                </button>
              )
            })}
          </div>

          {/* Conteúdo — conversa */}
          <div key={activeIndex} className="animate-fade-in">
            <div className="bg-[#111b21] rounded-2xl shadow-2xl shadow-black/20 overflow-hidden border border-white/5 animate-float-slow">
              {/* Header estilo WhatsApp */}
              <div className="bg-[#1f2c34] px-5 py-3.5 flex items-center gap-3 border-b border-white/5">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/30">
                  <span className="text-primary font-bold text-sm">C</span>
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Cleo</p>
                  <p className="text-emerald-400 text-xs">online</p>
                </div>
              </div>

              {/* Corpo da conversa */}
              <div className="p-6 space-y-4 min-h-[200px]">
                {activeCase.messages.map((msg, msgIndex) => (
                  <div key={msgIndex} className={cn("flex", msg.from === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "rounded-2xl px-4 py-3 max-w-[80%]",
                      msg.from === "user"
                        ? "bg-[#005c4b] rounded-tr-sm"
                        : "bg-[#202c33] rounded-tl-sm"
                    )}>
                      {msg.from === "cleo" && (
                        <p className="text-xs font-semibold text-emerald-400 mb-1">Cleo</p>
                      )}
                      <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line">{msg.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Nota (se existir) */}
              {activeCase.note && (
                <div className="px-6 pb-5">
                  <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
                    <p className="text-xs text-white/50">💡 {activeCase.note}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
