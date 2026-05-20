import { MessageSquareOff, Clock, TrendingDown, FileX } from "lucide-react"

const painPoints = [
  {
    icon: MessageSquareOff,
    title: "Esquece de responder",
    description: "O cliente mandou mensagem e você só viu 3 dias depois. Ele já fechou com outro.",
  },
  {
    icon: Clock,
    title: "Não sabe quem tá esperando",
    description: "Tem gente esperando retorno agora e você nem lembra quem é.",
  },
  {
    icon: TrendingDown,
    title: "Perde venda por falta de retorno",
    description: "O cliente pediu orçamento, você não voltou, e a venda foi embora.",
  },
  {
    icon: FileX,
    title: "Não tem tempo pra anotar tudo",
    description: "Planilha, caderno, post-it... nada funciona quando o dia é corrido.",
  },
]

export function PainPoints() {
  return (
    <section className="py-20 bg-slate-900 text-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Quantos clientes você já perdeu por esquecimento?
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {painPoints.map((point, index) => (
            <div
              key={index}
              className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 text-center"
            >
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center mb-4 mx-auto">
                <point.icon className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{point.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
