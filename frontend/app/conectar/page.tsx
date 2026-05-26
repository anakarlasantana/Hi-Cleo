"use client"

import { Suspense } from "react"
import { Spinner } from "@/components/ui/spinner"
import { PageShell } from "@/components/layout/page-shell"
import { ConectarContent } from "./conectar-content"

export default function ConectarPage() {
  return (
    <Suspense fallback={<PageShell><div className="flex items-center justify-center py-16"><Spinner className="w-8 h-8 text-primary" /></div></PageShell>}>
      <ConectarContent />
    </Suspense>
  )
}
