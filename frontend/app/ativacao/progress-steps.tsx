import { Check } from "lucide-react"

export function ProgressSteps() {
  return (
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
  )
}
