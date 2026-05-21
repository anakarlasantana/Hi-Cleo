"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Check,
  Copy,
  MessageCircle,
  Clock,
  Smartphone,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from "lucide-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export default function ActivationPage() {
  const router = useRouter()
  const [copiedNumber, setCopiedNumber] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [showConfetti, setShowConfetti] = useState(true)
  const [waitingActivation, setWaitingActivation] = useState(false)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const phoneNumber = "(48) 99999-9999"
  const activationCode = "ATIVAR-7X3K"
  const fullMessage = `${activationCode} | Seu Nome | Seu Negócio | Serviços que oferece | Horário de atendimento`
  const whatsappLink = `https://wa.me/5548999999999?text=${encodeURIComponent(fullMessage)}`

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  // Poll activation status
  useEffect(() => {
    if (!waitingActivation) return

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/activation/status/${activationCode}`)
        const data = await res.json()
        if (data.status === "activated") {
          clearInterval(pollingRef.current!)
          router.push(`/conectar?code=${activationCode}`)
        }
      } catch {
        // Silently retry
      }
    }, 3000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [waitingActivation, router])

  const copy = (text: string, type: "number" | "message") => {
    navigator.clipboard.writeText(text)
    const setter = type === "number" ? setCopiedNumber : setCopiedMessage
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  const handleOpenWhatsApp = () => {
    setWaitingActivation(true)
    window.open(whatsappLink, "_blank")
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      {/* Confetti */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2.5 h-2.5"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-10px`,
                backgroundColor: ["#25D366", "#128C7E", "#075E54", "#FFD700", "#FF6B6B"][Math.floor(Math.random() * 5)],
                borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                animation: `fall ${2 + Math.random() * 2}s linear forwards`,
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}
      <style jsx>{`@keyframes fall { to { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`}</style>

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">Hi Cleo</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 relative z-10">
        {/* Progress */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-primary">Pagamento</span>
          </div>
          <div className="w-12 h-0.5 bg-primary" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">2</div>
            <span className="text-sm font-medium text-foreground">Ativação</span>
          </div>
          <div className="w-12 h-0.5 bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-semibold text-sm">3</div>
            <span className="text-sm text-muted-foreground">Conexão</span>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center mb-12">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary to-[#128C7E] flex items-center justify-center shadow-lg shadow-primary/30">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Pagamento confirmado! 🎉
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Agora ative a Cleo mandando uma mensagem no WhatsApp.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-5 mb-10">
          {/* Step 1 */}
          <div className="group bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-[#128C7E] text-white flex items-center justify-center font-bold flex-shrink-0 shadow-md shadow-primary/20">1</div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground mb-1">Salve o número da Cleo</h2>
                <p className="text-sm text-muted-foreground mb-4">Salve como &quot;Cleo&quot; nos seus contatos.</p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1 flex items-center gap-3 bg-muted/80 rounded-xl px-4 py-3 border border-border">
                    <Smartphone className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-lg font-mono font-bold text-foreground tracking-wide">{phoneNumber}</span>
                  </div>
                  <Button variant="outline" onClick={() => copy(phoneNumber.replace(/\D/g, ""), "number")}
                    className="rounded-xl border-primary/20 hover:bg-primary/5 hover:border-primary/40">
                    {copiedNumber ? <><Check className="w-4 h-4 mr-1" />Copiado!</> : <><Copy className="w-4 h-4 mr-1" />Copiar</>}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="group bg-card border border-border rounded-2xl p-6 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-[#128C7E] text-white flex items-center justify-center font-bold flex-shrink-0 shadow-md shadow-primary/20">2</div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground mb-1">Envie uma mensagem para a Cleo</h2>
                <p className="text-sm text-muted-foreground mb-4">Copie a mensagem, preencha seus dados e envie.</p>

                {/* WhatsApp bubble */}
                <div className="relative mb-4">
                  <div className="bg-[#dcf8c6] dark:bg-[#005c4b] rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
                    <p className="text-foreground text-sm leading-relaxed">
                      <span className="font-mono font-bold text-primary">{activationCode}</span>
                      <span className="text-muted-foreground"> | </span>
                      <span className="italic text-muted-foreground">Seu Nome</span>
                      <span className="text-muted-foreground"> | </span>
                      <span className="italic text-muted-foreground">Seu Negócio</span>
                      <span className="text-muted-foreground"> | </span>
                      <span className="italic text-muted-foreground">Serviços</span>
                      <span className="text-muted-foreground"> | </span>
                      <span className="italic text-muted-foreground">Horário</span>
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  O código <span className="font-mono font-bold text-primary">{activationCode}</span> já está incluso. Substitua o restante com seus dados.
                </p>

                <Button variant="outline" onClick={() => copy(fullMessage, "message")}
                  className="rounded-xl border-primary/20 hover:bg-primary/5 hover:border-primary/40">
                  {copiedMessage ? <><Check className="w-4 h-4 mr-1" />Copiada!</> : <><Copy className="w-4 h-4 mr-1" />Copiar mensagem</>}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Main CTA */}
        <div className="text-center mb-8">
          <Button size="lg" onClick={handleOpenWhatsApp}
            className="bg-gradient-to-r from-primary to-[#128C7E] hover:from-primary/90 hover:to-[#128C7E]/90 text-white font-semibold text-lg px-10 py-7 h-auto shadow-xl shadow-primary/25 rounded-2xl w-full sm:w-auto group">
            <MessageCircle className="w-6 h-6 mr-2" />
            Abrir WhatsApp e ativar
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>

        {/* Waiting state */}
        {waitingActivation && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-8 text-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Aguardando ativação...</p>
            <p className="text-sm text-muted-foreground">
              Mande a mensagem no WhatsApp. Esta página vai atualizar automaticamente e mostrar o QR Code para vincular seu WhatsApp.
            </p>
          </div>
        )}

        {!waitingActivation && (
          <p className="text-sm text-muted-foreground text-center mb-8">
            Após enviar a mensagem, esta página vai detectar automaticamente e te levar para o próximo passo.
          </p>
        )}

        {/* Info badges */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
            <Clock className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="text-sm text-muted-foreground">Expira em 24h</span>
          </div>
          <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
            <Smartphone className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="text-sm text-muted-foreground">Não feche esta página</span>
          </div>
          <a href="https://wa.me/5548999999999?text=Preciso%20de%20ajuda" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/30 transition-colors">
            <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="text-sm text-primary">Ajuda</span>
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/80 backdrop-blur-sm mt-12 relative z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Hi Cleo</p>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/termos" className="text-muted-foreground hover:text-primary transition-colors">Termos</Link>
              <Link href="/termos" className="text-muted-foreground hover:text-primary transition-colors">Privacidade</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
