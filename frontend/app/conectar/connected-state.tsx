import { CheckCircle2 } from "lucide-react"

export function ConnectedState() {
  return (
    <div className="text-center py-8">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-12 h-12 text-primary" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
        WhatsApp vinculado! 🎉
      </h1>
      <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
        A Cleo agora tem acesso ao seu WhatsApp e vai organizar seus clientes automaticamente.
      </p>
      <div className="bg-card border border-border rounded-xl p-6 max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">Tudo pronto!</p>
            <p className="text-sm text-muted-foreground">Seu WhatsApp está vinculado à Cleo</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          A partir de agora, quando seus clientes te mandarem mensagem, a Cleo vai registrar, organizar e te lembrar de responder. Pode usar o WhatsApp normalmente!
        </p>
      </div>
    </div>
  )
}
