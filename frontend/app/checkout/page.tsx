"use client"

import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import { CheckoutContent } from "./checkout-content"

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}>
      <CheckoutContent />
    </Suspense>
  )
}
