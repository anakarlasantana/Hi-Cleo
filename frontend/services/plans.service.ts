import { apiRequest } from "@/lib/api-client"
import type { Plan } from "@/app/checkout/constants"

interface PlansApiResponse {
  plans: Array<{
    name: string
    displayName: string
    priceMonthly: number
    priceYearly: number
    yearlyTotal: number
    maxUsers: number
    features: string[]
    highlighted: boolean
  }>
}

export async function fetchAvailablePlans(): Promise<Record<string, Plan>> {
  const data = await apiRequest<PlansApiResponse>("/api/activation/plans")

  const plansMap: Record<string, Plan> = {}
  for (const plan of data.plans) {
    plansMap[plan.name] = {
      name: plan.name,
      displayName: plan.displayName,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      yearlyTotal: plan.yearlyTotal,
      users: plan.maxUsers === 1 ? "1 usuário" : `Até ${plan.maxUsers} usuários`,
      maxUsers: plan.maxUsers,
      features: plan.features,
      highlighted: plan.highlighted,
    }
  }

  return plansMap
}
