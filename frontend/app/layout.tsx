import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import dynamic from 'next/dynamic'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

const Analytics = dynamic(
  () => import('@vercel/analytics/next').then((mod) => mod.Analytics),
  { ssr: false }
)

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter'
});

export const metadata: Metadata = {
  title: 'Hi Cleo - Sua Secretária Virtual no WhatsApp',
  description: 'A Cleo organiza seus clientes, faz acompanhamento personalizado e te manda lembretes automáticos. Tudo direto no seu celular, sem sistema complicado.',
  keywords: ['secretária virtual', 'WhatsApp', 'atendimento automático', 'organização de clientes', 'lembretes', 'acompanhamento'],
  authors: [{ name: 'Hi Cleo' }],
  openGraph: {
    title: 'Hi Cleo - Sua Secretária Virtual no WhatsApp',
    description: 'Nunca mais perca um cliente por esquecimento. A Cleo organiza seus clientes e faz acompanhamento automático.',
    type: 'website',
    locale: 'pt_BR',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="bg-background">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
