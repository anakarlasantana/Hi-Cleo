"use client"

import { useState } from "react"
import { Shield, ChevronDown, ChevronUp } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { TermsContent } from "@/app/termos/terms-content"

interface TermsAcceptanceProps {
  isLoading: boolean
  onAccept: () => void
}

export function TermsAcceptance({ isLoading, onAccept }: TermsAcceptanceProps) {
  const [isTermsExpanded, setIsTermsExpanded] = useState(false)
  const [hasAccepted, setHasAccepted] = useState(false)

  const handleAccept = () => {
    setHasAccepted(true)
    onAccept()
  }

  return (
    <div className="max-w-2xl mx-auto mb-8">
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-muted/30">
          <Shield className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground text-sm">Termos de Uso e Privacidade</h3>
            <p className="text-xs text-muted-foreground">Leia antes de continuar</p>
          </div>
        </div>

        {/* Botão expandir/recolher */}
        <button
          type="button"
          onClick={() => setIsTermsExpanded(!isTermsExpanded)}
          className="w-full flex items-center justify-between px-6 py-3 text-sm text-primary hover:bg-muted/50 transition-colors"
        >
          <span>{isTermsExpanded ? "Recolher termos" : "Ler termos completos"}</span>
          {isTermsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* Conteúdo dos termos (expandível) */}
        {isTermsExpanded && (
          <div className="max-h-96 overflow-y-auto px-6 pb-4 border-t border-border">
            <div className="prose prose-sm prose-muted max-w-none pt-4">
              <TermsContent />
            </div>
          </div>
        )}

        {/* Checkbox de aceite */}
        <div className="px-6 py-4 border-t border-border bg-muted/20">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              className="w-5 h-5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 transition-colors"
              checked={hasAccepted}
              onChange={handleAccept}
              disabled={isLoading || hasAccepted}
            />
            <span className="text-sm text-foreground group-hover:text-primary transition-colors">
              Li e aceito os Termos de Uso e Política de Privacidade
            </span>
          </label>
          {isLoading && (
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground ml-8">
              <Spinner className="w-4 h-4" />
              <span>Registrando aceite...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
