import Link from "next/link"
import { MessageCircle } from "lucide-react"

export function Footer() {
  return (
    <footer className="bg-slate-900 text-white py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">Hi Cleo</span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-8 text-sm">
            <Link href="#beneficios" className="text-slate-400 hover:text-white transition-colors">
              Benefícios
            </Link>
            <Link href="#planos" className="text-slate-400 hover:text-white transition-colors">
              Planos
            </Link>
            <Link href="#faq" className="text-slate-400 hover:text-white transition-colors">
              Dúvidas
            </Link>
            <a
              href="https://wa.me/5585991870847"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Contato
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-800 my-8" />

        {/* Bottom */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} Hi Cleo. Todos os direitos reservados.</p>
          <div className="flex gap-6">
            <Link href="/termos" className="hover:text-white transition-colors">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-white transition-colors">
              Privacidade
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
