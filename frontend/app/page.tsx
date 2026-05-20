import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { Comparison } from "@/components/landing/comparison"
import { PainPoints } from "@/components/landing/pain-points"
import { Benefits } from "@/components/landing/benefits"
import { Pricing } from "@/components/landing/pricing"
import { FAQ } from "@/components/landing/faq"
import { Footer } from "@/components/landing/footer"
import { HowItWorks } from "@/components/landing/how-it-works"

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Comparison />
      <PainPoints />
      <HowItWorks />
      <Benefits />
      <Pricing />
      <FAQ />
      <Footer />
    </main>
  )
}
