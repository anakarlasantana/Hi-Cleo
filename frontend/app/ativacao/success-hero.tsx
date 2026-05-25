import { CheckCircle2 } from "lucide-react"

export function SuccessHero() {
  return (
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
  )
}
