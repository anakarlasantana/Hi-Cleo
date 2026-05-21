export const plans = {
  solo: { name: "Solo", priceMonthly: 49, priceYearly: 40.83, yearlyTotal: 490, users: "1 usuário" },
  equipe: { name: "Equipe", priceMonthly: 119, priceYearly: 99.17, yearlyTotal: 1190, users: "Até 3 usuários" },
  empresa: { name: "Empresa", priceMonthly: 249, priceYearly: 207.50, yearlyTotal: 2490, users: "Até 8 usuários" },
} as const

export type PlanKey = keyof typeof plans
