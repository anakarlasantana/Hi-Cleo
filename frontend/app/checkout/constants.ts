export interface Plan {
  name: string
  displayName: string
  priceMonthly: number
  priceYearly: number
  yearlyTotal: number
  users: string
  maxUsers: number
  features: string[]
  highlighted: boolean
}

export type PlanKey = string
