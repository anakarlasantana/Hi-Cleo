"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, X, MessageCircle } from "lucide-react"
import { scrollToCenter } from "@/lib/scroll"

const navLinks = [
  { href: "para-quem", label: "Para quem" },
  { href: "como-funciona", label: "Como funciona" },
  { href: "beneficios", label: "Benefícios" },
  { href: "planos", label: "Planos" },
  { href: "faq", label: "Dúvidas" },
]

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handleNavClick = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault()
    scrollToCenter(sectionId)
  }

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? "bg-background/95 backdrop-blur-lg border-b border-border shadow-sm" 
        : "bg-transparent"
    }`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">Hi Cleo</span>
          </a>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a 
                key={link.href} 
                href={`#${link.href}`}
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Button asChild variant="outline" size="sm" className="border-primary/50 text-primary hover:bg-primary/10">
              <a href="#trial" onClick={(e) => handleNavClick(e, 'trial')}>✨ Teste grátis 7 dias</a>
            </Button>
            <Button asChild>
              <a href="#planos" onClick={(e) => handleNavClick(e, 'planos')}>Assinar</a>
            </Button>
          </div>

          {/* Mobile menu button */}
          <button 
            className="md:hidden p-2 text-foreground"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Fechar menu de navegação" : "Abrir menu de navegação"}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-background border-t border-border py-4">
            <div className="flex flex-col gap-4">
              {navLinks.map((link) => (
                <a 
                  key={link.href} 
                  href={`#${link.href}`}
                  className="text-foreground hover:text-primary transition-colors px-4 py-2"
                  onClick={(e) => { handleNavClick(e, link.href); setIsMobileMenuOpen(false) }}
                >
                  {link.label}
                </a>
              ))}
              <div className="px-4 pt-2 border-t border-border">
                <Button asChild className="w-full" variant="outline">
                  <a href="#trial" onClick={(e) => { handleNavClick(e, 'trial'); setIsMobileMenuOpen(false) }}>
                    ✨ Teste grátis 7 dias
                  </a>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
