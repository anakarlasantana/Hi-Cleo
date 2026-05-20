"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Check,
  Copy,
  MessageCircle,
  Clock,
  QrCode,
  Smartphone,
  HelpCircle,
  CheckCircle2,
} from "lucide-react"

export default function ActivationPage() {
  const [copiedNumber, setCopiedNumber] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)
  const [showConfetti, setShowConfetti] = useState(true)

  const phoneNumber = "(48) 99999-9999"
  const activationCode = "ATIVAR-7X3K"
  const fullMessage = `${activationCode} | Seu Nome | Seu Negócio | Serviços que oferece | Horário de atendimento`
  const exampleMessage = "ATIVAR-7X3K | João Silva | Imobiliária Centro | Venda e aluguel de imóveis | Seg a Sex 9h-18h"
  const whatsappLink = `https://wa.me/5548999999999?text=${encodeURIComponent(fullMessage)}`

  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  const copyToClipboard = (text: string, type: "number" | "code" | "message") => {
    navigator.clipboard.writeText(text)
    if (type === "number") {
      setCopiedNumber(true)
      setTimeout(() => setCopiedNumber(false), 2000)
    } else if (type === "code") {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } else {
      setCopiedMessage(true)
      setTimeout(() => setCopiedMessage(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Confetti animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-3 h-3 animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-20px`,
                backgroundColor: ["#25D366", "#128C7E", "#075E54", "#FFD700", "#FF6B6B"][
                  Math.floor(Math.random() * 5)
                ],
                borderRadius: Math.random() > 0.5 ? "50%" : "0",
                animation: `fall ${2 + Math.random() * 2}s linear forwards`,
                animationDelay: `${Math.random() * 0.5}s`,
              }}
            />
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes fall {
          to {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>

      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-primary">Hi Cleo</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <Check className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-primary">Pagamento</span>
          </div>
          <div className="w-12 h-0.5 bg-primary" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
              2
            </div>
            <span className="text-sm font-medium text-foreground">Ativação no WhatsApp</span>
          </div>
        </div>

        {/* Success Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-primary" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 text-balance">
            Pagamento confirmado! Agora vamos ativar a Cleo.
          </h1>
          <p className="text-lg text-muted-foreground">
            {"É só mandar uma mensagem no WhatsApp — leva 30 segundos."}
          </p>
        </div>

        {/* Instructions */}
        <div className="space-y-6 mb-12">
          {/* Step 1 */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Salve este número nos seus contatos
                </h2>
                <p className="text-muted-foreground mb-4">
                  Salve como &quot;Cleo&quot; para encontrar facilmente depois.
                </p>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="flex-1 flex items-center gap-3 bg-muted rounded-lg px-4 py-3">
                    <Smartphone className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-xl font-mono font-bold text-foreground">{phoneNumber}</span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(phoneNumber.replace(/\D/g, ""), "number")}
                    className="flex items-center gap-2"
                  >
                    {copiedNumber ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar número
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Mande esta mensagem no WhatsApp
                </h2>
                <p className="text-muted-foreground mb-4">
                  Preencha com seus dados e envie para a Cleo.
                </p>

                {/* Activation Code Highlight */}
                <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 mb-4">
                  <p className="text-sm text-primary mb-1">Seu código de ativação</p>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-mono font-bold text-primary">{activationCode}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(activationCode, "code")}
                      className="text-primary hover:text-primary hover:bg-primary/10"
                    >
                      {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {/* Message Template */}
                <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none px-4 py-3 mb-4 shadow-sm">
                  <p className="text-foreground font-mono text-sm break-all">{fullMessage}</p>
                </div>

                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(fullMessage, "message")}
                  className="w-full sm:w-auto mb-4"
                >
                  {copiedMessage ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Mensagem copiada!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copiar mensagem
                    </>
                  )}
                </Button>

                {/* Example */}
                <div className="bg-muted rounded-lg px-4 py-3">
                  <p className="text-xs text-muted-foreground mb-1">Exemplo preenchido:</p>
                  <p className="text-sm text-muted-foreground font-mono">{exampleMessage}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main CTA */}
        <div className="text-center mb-12">
          <Button
            asChild
            size="lg"
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg px-10 py-6 h-auto shadow-lg shadow-primary/25 w-full sm:w-auto"
          >
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="w-6 h-6 mr-2" />
              Abrir WhatsApp e ativar a Cleo
            </a>
          </Button>
          <p className="text-muted-foreground mt-4">
            A Cleo vai te responder e te guiar nos próximos passos — tudo por conversa!
          </p>
        </div>

        {/* Additional Info */}
        <div className="grid sm:grid-cols-3 gap-4 mb-12">
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
            <Clock className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="text-sm text-foreground">O código expira em 24 horas</span>
          </div>
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
            <Smartphone className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="text-sm text-foreground">Configuração pelo WhatsApp</span>
          </div>
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3">
            <a
              href="https://wa.me/5548999999999?text=Preciso%20de%20ajuda%20com%20a%20ativação"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-primary hover:underline"
            >
              <HelpCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">Precisa de ajuda?</span>
            </a>
          </div>
        </div>

        {/* What happens next */}
        <div className="bg-muted rounded-xl p-6">
          <h3 className="font-semibold text-foreground mb-4">O que acontece depois?</h3>
          <p className="text-muted-foreground mb-4">
            Após mandar a mensagem, a Cleo vai:
          </p>
          <ul className="space-y-3">
            {[
              "Confirmar seus dados",
              "Perguntar como você quer atender seus clientes",
              "Te enviar um QR Code pra conectar seu WhatsApp",
              "E pronto — ela começa a trabalhar pra você!",
            ].map((item, index) => (
              <li key={index} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {index === 2 ? (
                    <QrCode className="w-3 h-3 text-primary" />
                  ) : (
                    <Check className="w-3 h-3 text-primary" />
                  )}
                </div>
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card mt-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Hi Cleo. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/termos" className="text-muted-foreground hover:text-primary">
                Termos
              </Link>
              <Link href="/privacidade" className="text-muted-foreground hover:text-primary">
                Privacidade
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
