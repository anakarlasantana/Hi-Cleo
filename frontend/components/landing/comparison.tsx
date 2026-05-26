import { Check, X, Smartphone, Monitor, MessageCircle } from "lucide-react";

const features = [
  {
    feature: "Funciona 100% no celular",
    whatsapp: true,
    crms: false,
    cleo: true,
  },
  {
    feature: "Organiza clientes automaticamente",
    whatsapp: false,
    crms: true,
    cleo: true,
  },
  {
    feature: "Lembra de responder clientes",
    whatsapp: false,
    crms: true,
    cleo: true,
  },
  {
    feature: "Entende áudio e texto",
    whatsapp: true,
    crms: false,
    cleo: true,
  },
  {
    feature: "Responde fora do horário (personalizada)",
    whatsapp: false,
    crms: true,
    cleo: true,
  },
  {
    feature: "Acompanhamento clientes",
    whatsapp: false,
    crms: true,
    cleo: true,
  },
  {
    feature: "Sem precisar aprender sistema novo",
    whatsapp: true,
    crms: false,
    cleo: true,
  },
];

function StatusIcon({
  value,
  highlighted = false,
}: {
  value: boolean;
  highlighted?: boolean;
}) {
  if (value) {
    return (
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center ${highlighted ? "bg-primary/20" : "bg-primary/10"}`}
      >
        <Check
          className={`w-4 h-4 ${highlighted ? "text-primary" : "text-primary/70"}`}
          strokeWidth={3}
        />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center">
      <X className="w-4 h-4 text-red-400" strokeWidth={2.5} />
    </div>
  );
}

export function Comparison() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            Por que não basta só o WhatsApp Business?
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Veja como a Cleo combina o melhor dos dois mundos: simplicidade do
            WhatsApp + organização de um CRM.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Desktop: tabela */}
          <div className="hidden md:block bg-background rounded-2xl border border-border overflow-hidden shadow-sm">
            {/* Header */}
            <div className="grid grid-cols-4 gap-4 p-4 border-b border-border">
              <div className="font-medium text-foreground text-sm">
                Funcionalidade
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <Smartphone className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    WhatsApp
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <Monitor className="w-5 h-5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Outros CRMs
                  </span>
                </div>
              </div>
              <div className="text-center">
                <div className="flex flex-col items-center gap-1 bg-primary rounded-xl px-3 py-2 shadow-md shadow-primary/20">
                  <MessageCircle className="w-5 h-5 text-white" />
                  <span className="text-xs font-bold text-white">Hi Cleo</span>
                </div>
              </div>
            </div>

            {/* Rows */}
            {features.map((row, index) => (
              <div
                key={index}
                className={`grid grid-cols-4 gap-4 p-4 items-center ${
                  index % 2 === 0 ? "bg-background" : "bg-muted/20"
                } ${index !== features.length - 1 ? "border-b border-border/50" : ""}`}
              >
                <div className="text-foreground text-sm">{row.feature}</div>
                <div className="flex justify-center">
                  <StatusIcon value={row.whatsapp} />
                </div>
                <div className="flex justify-center">
                  <StatusIcon value={row.crms} />
                </div>
                <div className="flex justify-center">
                  <StatusIcon value={row.cleo} highlighted />
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: cards empilhados */}
          <div className="md:hidden space-y-3">
            {/* Header mobile */}
            <div className="flex items-center justify-end gap-3 px-4 py-3 bg-background border border-border rounded-xl mb-4">
              <span className="text-xs text-muted-foreground mr-auto font-medium">Funcionalidade</span>
              <div className="flex flex-col items-center gap-0.5">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">WhatsApp</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <Monitor className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">CRMs</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 bg-primary rounded-lg px-2 py-1">
                <MessageCircle className="w-3.5 h-3.5 text-white" />
                <span className="text-[10px] text-white font-bold">Cleo</span>
              </div>
            </div>
            {features.map((row, index) => (
              <div key={index} className="bg-background border border-border/60 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-foreground flex-1">{row.feature}</span>
                <div className="flex items-center gap-3">
                  <StatusIcon value={row.whatsapp} />
                  <StatusIcon value={row.crms} />
                  <StatusIcon value={row.cleo} highlighted />
                </div>
              </div>
            ))}
          </div>

          {/* Frase de fechamento */}
          <p className="text-center text-muted-foreground mt-8 text-lg font-medium">
            Tudo que um CRM faz, mas sem sair do WhatsApp. Sem painel. Sem
            computador. Sem complicação.
          </p>
        </div>
      </div>
    </section>
  );
}
