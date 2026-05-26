"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

// --- Tipos ---

interface ChatMessage {
  type: "user" | "cleo"
  text: string
  list?: string[]
  time: string
}

interface FloatingBadge {
  text: string
  position: string
  animation: string
  variant: "white" | "green"
}

// --- Dados ---

const messages: ChatMessage[] = [
  { type: "user", text: "quem tá sem resposta?", time: "10:30" },
  { type: "cleo", text: "Você tem 3 clientes esperando:", list: ["João (preço há 2 dias)", "Maria (quer agendar visita)", "Pedro (pediu orçamento)"], time: "10:30" },
  { type: "user", text: "agenda retorno pro João amanhã", time: "10:31" },
  { type: "cleo", text: "Pronto! Vou te lembrar amanhã de falar com o João ✅", time: "10:31" },
  { type: "user", text: "mostra meus clientes quentes", time: "10:32" },
  { type: "cleo", text: "🔥 Você tem 2 clientes quentes:", list: ["Ana (3 interações essa semana)", "Carlos (pediu proposta ontem)"], time: "10:32" },
]

const badges: FloatingBadge[] = [
  { text: "📱 100% no celular", position: "top-6 right-0 lg:right-4", animation: "animate-float-slow", variant: "white" },
  { text: "⏰ Lembretes automáticos", position: "top-[180px] right-0 lg:-right-2", animation: "animate-float-fast", variant: "white" },
  { text: "🎤 Entende áudio e texto", position: "bottom-[60px] left-0 lg:-left-2", animation: "animate-float-medium", variant: "green" },
  { text: "🚀 Sem sistema complicado", position: "top-[80px] left-0 lg:-left-4", animation: "animate-float-slow", variant: "white" },
  { text: "💬 Responde fora do horário", position: "bottom-[160px] right-0 lg:right-2", animation: "animate-float-medium", variant: "green" },
]

// --- Subcomponentes ---

function ChatBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isUser = message.type === "user"

  return (
    <div
      className={cn("flex animate-message-in", isUser ? "justify-end" : "justify-start")}
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div
        className={cn(
          "px-3 py-2 max-w-[85%] shadow-sm",
          isUser
            ? "bg-[#dcf8c6] rounded-lg rounded-tr-none"
            : "bg-white rounded-lg rounded-tl-none"
        )}
      >
        <p className="text-[13px] text-slate-800 leading-snug">{message.text}</p>
        {message.list && (
          <ul className="text-[11px] text-slate-600 mt-1 space-y-0.5">
            {message.list.map((item, i) => (
              <li key={i}>• {item}</li>
            ))}
          </ul>
        )}
        <p className="text-[9px] text-slate-400 text-right mt-0.5">{message.time}</p>
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start animate-message-in">
      <div className="bg-white rounded-lg rounded-tl-none px-4 py-2.5 shadow-sm">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  )
}

function FloatingBadgeItem({ badge }: { badge: FloatingBadge }) {
  return (
    <div className={cn("absolute z-20 hidden md:block", badge.position, badge.animation)}>
      <div
        className={cn(
          "rounded-xl px-3 py-1.5 shadow-md text-[11px] text-slate-600 whitespace-nowrap",
          badge.variant === "white"
            ? "bg-white border border-border/50"
            : "bg-[#dcf8c6]"
        )}
      >
        {badge.text}
      </div>
    </div>
  )
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 [transform:perspective(1200px)_rotateY(-6deg)_rotateX(3deg)] hover:[transform:perspective(1200px)_rotateY(-1deg)_rotateX(1deg)] transition-transform duration-700">
      <div className="bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] p-2 md:p-3 shadow-[0_20px_50px_-20px_rgba(37,211,102,0.3)] w-[240px] sm:w-[260px] md:w-[300px] lg:w-[320px]">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[100px] md:w-[120px] h-[24px] md:h-[28px] bg-slate-900 rounded-b-2xl z-20" />
        <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

function WhatsAppHeader() {
  return (
    <>
      {/* Status bar */}
      <div className="bg-primary/90 h-7 flex items-center justify-between px-6 pt-1">
        <span className="text-white/80 text-[10px] font-medium">9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 border border-white/80 rounded-sm relative">
            <div className="absolute inset-0.5 bg-white/80 rounded-[1px]" style={{ width: "70%" }} />
          </div>
        </div>
      </div>

      {/* Contact header */}
      <div className="bg-primary px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
          <span className="text-white font-bold text-sm">C</span>
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Cleo</p>
          <p className="text-white/70 text-[11px]">online</p>
        </div>
        <div className="flex gap-4">
          <div className="w-5 h-5 rounded-full bg-white/10" />
          <div className="w-5 h-5 rounded-full bg-white/10" />
        </div>
      </div>
    </>
  )
}

function InputBar() {
  return (
    <div className="bg-[#f0f0f0] px-3 py-2 flex items-center gap-2">
      <div className="flex-1 bg-white rounded-full px-4 py-2">
        <p className="text-[11px] text-slate-400">Mensagem</p>
      </div>
      <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center">
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      </div>
    </div>
  )
}

// --- Componente principal ---

export function PhoneMockup() {
  const [visibleMessages, setVisibleMessages] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleMessages((prev) => (prev >= messages.length ? 0 : prev + 1))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative h-[380px] sm:h-[420px] md:h-[500px] lg:h-[580px] flex items-center justify-center">
      {/* Glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[350px] h-[350px] bg-primary/15 rounded-full blur-[80px]" />
      </div>

      {/* Celular */}
      <PhoneFrame>
        <WhatsAppHeader />

        {/* Chat area */}
        <div className="bg-[#e5ddd5] p-2 md:p-3 space-y-2 md:space-y-2.5 h-[240px] sm:h-[280px] md:h-[350px] lg:h-[380px] overflow-hidden relative">
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />

          <div className="relative z-10 space-y-2.5">
            {messages.slice(0, visibleMessages).map((msg, index) => (
              <ChatBubble key={index} message={msg} index={index} />
            ))}
            {visibleMessages < messages.length && visibleMessages > 0 && <TypingIndicator />}
          </div>
        </div>

        <InputBar />
      </PhoneFrame>

      {/* Badges flutuantes */}
      {badges.map((badge, i) => (
        <FloatingBadgeItem key={i} badge={badge} />
      ))}
    </div>
  )
}
