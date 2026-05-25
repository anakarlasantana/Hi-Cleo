import { Loader2 } from "lucide-react"

interface Props {
  isWaiting: boolean
}

export function WaitingState({ isWaiting }: Props) {
  if (isWaiting) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-8 text-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto mb-3" />
        <p className="text-foreground font-medium mb-1">Aguardando ativação...</p>
        <p className="text-sm text-muted-foreground">
          Mande a mensagem no WhatsApp. Esta página vai atualizar automaticamente e mostrar o QR Code para vincular seu WhatsApp.
        </p>
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground text-center mb-8">
      Após enviar a mensagem, esta página vai detectar automaticamente e te levar para o próximo passo.
    </p>
  )
}
