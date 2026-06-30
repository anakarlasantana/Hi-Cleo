"use client"

import { Suspense } from "react"
import { ConviteContent } from "./convite-content"

export default function ConvitePage() {
  return (
    <Suspense>
      <ConviteContent />
    </Suspense>
  )
}
