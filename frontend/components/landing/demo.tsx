"use client"

import { useEffect, useState, useRef } from "react"
import { cn } from "@/lib/utils"

const conversation = [
  { type: "user", text: "quem tá sem resposta?" },
  { type: "cleo", text: "Você tem 3 clientes esperando:", list: ["João (perguntou preço há 2 dias)", "Maria (quer agendar visita)", "Pedro (pediu orçamento)"], followUp: "Quer ver detalhes de algum?" },
  { type: "user", text: "agenda retorno pro João amanhã" },
  { type: "cleo", text: "Pronto! Vou te lembrar amanhã de falar com o João ✅" },
]

function ChatMessage({ msg, index, visible }: { msg: typeof conversation[0]; index: number; visible: boolean }) {
  const isUser = msg.type === "user"

  return (
    <div
      className={cn(
        "flex transition-all duration-500",
        isUser ? "justify-end" : "justify-start",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      )}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className={cn(
        "px-4 py-2.5 max-w-[85%] shadow-sm",
        isUser
          ? "bg-[#dcf8c6] rounded-2xl rounded-tr-sm"
          : "bg-white rounded-2xl rounded-tl-sm"
      )}>
        <p className="text-[13px] text-slate-800 leading-snug">{msg.text}</p>
        {msg.list && (
          <ul className="text-[12px] text-slate-600 mt-1.5 space-y-0.5">
            {msg.list.map((item, i) => <li key={i}>• {item}</li>)}
          </ul>
        )}
        {msg.followUp && (
          <p className="text-[12px] text-slate-600 mt-1.5">{msg.followUp}</p>
        )}
      </div>
    </div>
  )
}

export function Demo() {
  const [visibleCount, setVisibleCount] = useState(0)
  const [sectionVisible, setSectionVisible] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setSectionVisible(true) },
      { threshold: 0.3 }
    )
    if (sectionRef.current) observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!sectionVisible) return
    const interval = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= conversation.length) {
          clearInterval(interval)
          return prev
        }
        return prev + 1
      })
    }, 1500)
    return () => clearInterval(interval)
  }, [sectionVisible])

  return (
    <section ref={sectionRef} className="py-24 bg-[#075E54] relative overflow-hidden">
      {/* Background decorativo */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[150px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Veja a Cleo em ação
          </h2>
          <p className="text-white/70 text-lg">
            Você pergunta, ela responde e executa. Simples assim.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-8 items-center max-w-6xl mx-auto">
          {/* Callouts esquerda */}
          <div className="hidden lg:flex flex-col gap-6 items-end">
            <div className={cn("bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-4 max-w-[240px] transition-all duration-700", sectionVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8")}>
              <p className="text-white font-semibold text-sm mb-1">💬 Linguagem natural</p>
              <p className="text-white/60 text-xs">Fale como quiser — texto ou áudio</p>
            </div>
            <div className={cn("bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-4 max-w-[240px] transition-all duration-700 delay-300", sectionVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-8")}>
              <p className="text-white font-semibold text-sm mb-1">⚡ Resposta instantânea</p>
              <p className="text-white/60 text-xs">Informações na hora, sem esperar</p>
            </div>
          </div>

          {/* Celular central */}
          <div className="flex justify-center">
            <div className="bg-slate-900 rounded-[3rem] p-3 shadow-[0_30px_80px_-15px_rgba(0,0,0,0.5)] w-[300px] md:w-[320px]">
              <div className="bg-white rounded-[2.5rem] overflow-hidden">
                {/* Notch */}
                <div className="bg-primary/90 h-6 flex items-center justify-center">
                  <div className="w-20 h-4 bg-slate-900 rounded-full" />
                </div>

                {/* Header */}
                <div className="bg-primary px-4 py-3 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">C</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Cleo</p>
                    <p className="text-white/70 text-[11px]">online</p>
                  </div>
                </div>

                {/* Chat */}
                <div className="bg-[#e5ddd5] p-4 space-y-3 min-h-[380px] relative">
                  <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

                  <div className="relative z-10 space-y-3">
                    {conversation.slice(0, visibleCount).map((msg, index) => (
                      <ChatMessage key={index} msg={msg} index={index} visible={true} />
                    ))}

                    {/* Typing */}
                    {visibleCount < conversation.length && sectionVisible && (
                      <div className="flex justify-start animate-message-in">
                        <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                          <div className="flex gap-1.5">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Callouts direita */}
          <div className="hidden lg:flex flex-col gap-6 items-start">
            <div className={cn("bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-4 max-w-[240px] transition-all duration-700 delay-150", sectionVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8")}>
              <p className="text-white font-semibold text-sm mb-1">📋 Organiza sozinha</p>
              <p className="text-white/60 text-xs">Clientes, lembretes e retornos</p>
            </div>
            <div className={cn("bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-5 py-4 max-w-[240px] transition-all duration-700 delay-500", sectionVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8")}>
              <p className="text-white font-semibold text-sm mb-1">🔒 Você no controle</p>
              <p className="text-white/60 text-xs">A Cleo avisa, você decide o que fazer</p>
            </div>
          </div>
        </div>

        {/* Stats mobile-friendly */}
        <div className="grid grid-cols-3 gap-4 mt-14 max-w-lg mx-auto">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">100%</p>
            <p className="text-white/60 text-xs mt-1">Natural</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">24/7</p>
            <p className="text-white/60 text-xs mt-1">Disponível</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">0</p>
            <p className="text-white/60 text-xs mt-1">Treinamento</p>
          </div>
        </div>
      </div>
    </section>
  )
}
