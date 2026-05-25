import Link from "next/link"
import { MessageCircle, HelpCircle } from "lucide-react"

const SECRETARY_PHONE = process.env.NEXT_PUBLIC_SECRETARY_PHONE || "5548999999999"

interface Props {
  children: React.ReactNode
  maxWidth?: "3xl" | "6xl"
}

export function PageShell({ children, maxWidth = "3xl" }: Props) {
  const containerClass = maxWidth === "6xl" ? "max-w-6xl" : "max-w-3xl"

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-1/3 -left-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute bottom-1/3 -right-32 w-64 h-64 bg-primary/5 rounded-full blur-[100px]" />

      <header className="border-b border-border bg-card/80 backdrop-blur-sm relative z-10">
        <div className={`${containerClass} mx-auto px-4 sm:px-6 lg:px-8 py-4`}>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">Hi Cleo</span>
          </Link>
        </div>
      </header>

      <main className={`${containerClass} mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 relative z-10`}>
        {children}
      </main>

      <footer className="border-t border-border bg-card/80 backdrop-blur-sm mt-12 relative z-10">
        <div className={`${containerClass} mx-auto px-4 sm:px-6 lg:px-8 py-6`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Hi Cleo</p>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/termos" className="text-muted-foreground hover:text-primary transition-colors">Termos</Link>
              <Link href="/termos" className="text-muted-foreground hover:text-primary transition-colors">Privacidade</Link>
              <a href={`https://wa.me/${SECRETARY_PHONE}?text=Preciso%20de%20ajuda`} target="_blank" rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />Ajuda
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
