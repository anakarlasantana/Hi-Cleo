"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, Copy, Smartphone } from "lucide-react"

interface Props {
  phoneNumber: string
  activationCode: string
  fullMessage: string
}

export function ActivationSteps({ phoneNumber, activationCode, fullMessage }: Props) {
  const [copiedNumber, setCopiedNumber] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState(false)

  const copy = (text: string, type: "number" | "message") => {
    navigator.clipboard.writeText(text)
    const setter = type === "number" ? setCopiedNumber : setCopiedMessage
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  return (
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
  )
}
