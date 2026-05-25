import { Smartphone } from "lucide-react"

export function ScanInstructions() {
  const steps = [
    { label: <>Abra o <strong className="text-foreground">WhatsApp</strong> no seu celular</> },
    { label: <>Toque em <strong className="text-foreground">⋮ Menu</strong> (Android) ou <strong className="text-foreground">Configurações</strong> (iPhone)</> },
    { label: <>Selecione <strong className="text-foreground">Dispositivos Vinculados</strong></> },
    { label: <>Toque em <strong className="text-foreground">Vincular Dispositivo</strong> e aponte a câmera para o QR Code acima</> },
  ]

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-8 max-w-lg mx-auto">
      <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-primary" />
        Como vincular
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Use o mesmo celular onde está seu WhatsApp pessoal/profissional:
      </p>
      <ol className="space-y-3 text-sm text-muted-foreground">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 text-xs font-bold">
              {i + 1}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
