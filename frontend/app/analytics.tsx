'use client'

import dynamic from 'next/dynamic'

const VercelAnalytics = dynamic(
  () => import('@vercel/analytics/next').then((mod) => mod.Analytics),
  { ssr: false }
)

export function Analytics() {
  if (process.env.NODE_ENV !== 'production') return null
  return <VercelAnalytics />
}
