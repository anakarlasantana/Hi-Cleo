import { Star } from "lucide-react"

const testimonials = [
  {
    name: "Mariana Costa",
    role: "Designer de Interiores",
    content: "Eu perdia muitos clientes por esquecer de fazer follow-up. Agora a Cleo me avisa e ja fechei 3 projetos que teriam sumido.",
    rating: 5
  },
  {
    name: "Carlos Eduardo",
    role: "Personal Trainer",
    content: "Simples demais! Nao preciso de computador, faco tudo pelo celular entre um aluno e outro. Recomendo muito.",
    rating: 5
  },
  {
    name: "Patricia Lima",
    role: "Fotografa",
    content: "A funcao de lembrar aniversarios e incrivel. Mando mensagem pros clientes e eles ficam super felizes. Fideliza demais!",
    rating: 5
  }
]

export function Testimonials() {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <p className="text-primary font-medium mb-3">Depoimentos</p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4 text-balance">
            Quem usa, recomenda
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Veja o que profissionais como voce estao falando sobre a Cleo.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index}
              className="bg-muted/30 border border-border rounded-2xl p-6"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-foreground mb-4 leading-relaxed">
                &ldquo;{testimonial.content}&rdquo;
              </p>
              <div>
                <p className="font-semibold text-foreground">{testimonial.name}</p>
                <p className="text-sm text-muted-foreground">{testimonial.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
