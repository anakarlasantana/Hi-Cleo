"use client"

import Link from "next/link"
import { ArrowLeft, MessageCircle } from "lucide-react"

export function CheckoutHeader() {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-foreground">Hi Cleo</span>
        </Link>
        <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Voltar</span>
        </Link>
      </div>
    </header>
  )
}
