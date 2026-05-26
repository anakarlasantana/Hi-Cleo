"use client"

import { Suspense } from "react"
import { PageShell } from "@/components/layout/page-shell"
import { ActivationContent } from "./activation-content"

export default function ActivationPage() {
  return (
    <Suspense fallback={<PageShell><div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div></PageShell>}>
      <ActivationContent />
    </Suspense>
  )
}
