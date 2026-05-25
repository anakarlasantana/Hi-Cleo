import { Clock, Smartphone, HelpCircle } from "lucide-react"

const SECRETARY_PHONE = process.env.NEXT_PUBLIC_SECRETARY_PHONE || "5548999999999"

export function InfoBadges() {
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
        <Clock className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="text-sm text-muted-foreground">Expira em 24h</span>
      </div>
      <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
        <Smartphone className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="text-sm text-muted-foreground">Não feche esta página</span>
      </div>
      <a href={`https://wa.me/${SECRETARY_PHONE}?text=Preciso%20de%20ajuda`} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/30 transition-colors">
        <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="text-sm text-primary">Ajuda</span>
      </a>
    </div>
  )
}
