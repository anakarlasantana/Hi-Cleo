"use client"

import { useRef, useState, useEffect } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

const faqs = [
  {
    question: "Preciso de computador pra usar?",
    answer: "Não! A Cleo funciona 100% dentro do WhatsApp que você já usa no celular. Sem painel web, sem aplicativo extra, sem computador.",
  },
  {
    question: "A Cleo funciona pro meu tipo de negócio?",
    answer: "Sim! A Cleo se adapta a qualquer profissional que atende pelo WhatsApp: professores, corretores, consultores, personal trainers, clínicas, prestadores de serviço. Ela organiza seus contatos e faz acompanhamento independente do seu segmento.",
  },
  {
    question: "Como conecto meu WhatsApp?",
    answer: "Após o pagamento, você recebe um código de ativação. Manda esse código pra Cleo no WhatsApp e ela te guia na conexão. É só escanear um QR Code e pronto.",
  },
  {
    question: "Meus clientes vão saber que é automático?",
    answer: "A Cleo não responde seus clientes diretamente sem sua permissão. Ela organiza, lembra e avisa VOCÊ sobre o que fazer. Quem decide quando e como falar com o cliente é sempre você.",
  },
  {
    question: "E se eu quiser cancelar?",
    answer: "Você pode cancelar a qualquer momento, sem multa ou burocracia. Basta enviar uma mensagem pedindo o cancelamento.",
  },
  {
    question: "Funciona com WhatsApp Business?",
    answer: "Sim! Funciona tanto com WhatsApp normal quanto com WhatsApp Business.",
  },
  {
    question: "Quantos clientes posso ter?",
    answer: "Ilimitados! Todos os planos incluem contatos ilimitados. Não importa se você tem 10 ou 10.000 clientes.",
  },
  {
    question: "Ela responde meus clientes sozinha?",
    answer: "A Cleo pode enviar respostas automáticas fora do horário comercial. Mas o atendimento personalizado é sempre feito por você.",
  },
  {
    question: "Posso enviar materiais e arquivos pros meus contatos?",
    answer: "Sim! Basta mandar o material para a Cleo e pedir: \"Manda o PDF pro João\" e a Cleo envia. Ideal pra professores que mandam aulas, corretores que enviam fotos de imóveis, consultores que compartilham propostas.",
  },
]

export function FAQ() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true) },
      { threshold: 0.1 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="faq" className="py-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-background to-muted/30" />
      <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      <div ref={ref} className="container mx-auto px-4 relative z-10">
        <div className={cn(
          "text-center mb-14 transition-all duration-700",
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        )}>
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            Perguntas frequentes
          </h2>
          <p className="text-muted-foreground text-lg">
            Tire suas dúvidas. Se não encontrar sua resposta,{" "}
            <a href="https://wa.me/5585991870847" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:text-primary/80">
              fale conosco
            </a>.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className={cn(
                  "bg-background border border-border/60 rounded-2xl px-6 data-[state=open]:border-primary/30 data-[state=open]:shadow-lg data-[state=open]:shadow-primary/5 transition-all duration-300",
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                )}
                style={{ transitionDelay: `${(index + 1) * 100}ms` }}
              >
                <AccordionTrigger className="text-left text-foreground font-semibold hover:no-underline py-5 text-base cursor-pointer">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed text-sm">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
