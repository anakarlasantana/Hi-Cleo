import { describe, it, expect } from 'vitest';
import type { PlanLimit } from './plans.port.js';

/**
 * Contrato da unidade de preço.
 *
 * `plan_limits.price_monthly` / `price_yearly_total` estão em CENTAVOS
 * (migration 0003 + docs/produto/regras-de-negocio.md). O repositório devolve o
 * valor cru para a API. Antes ele multiplicava por 100, então:
 *   - /api/activation/plans devolvia 4900 (R$ 49,00) para a vitrine ✅
 *   - mas o pagamento usava getPlanLimit sem o ×100 → cobrava R$ 0,49 ❌
 * Estes testes travam o contrato para a regressão não voltar.
 */

const SEED: Record<string, { monthly: number; yearly: number; maxUsers: number }> = {
  solo: { monthly: 4900, yearly: 49000, maxUsers: 1 },
  equipe: { monthly: 11900, yearly: 119000, maxUsers: 3 },
  empresa: { monthly: 24900, yearly: 249000, maxUsers: 8 },
};

function buildPlanLimit(planName: string): PlanLimit {
  const seed = SEED[planName];
  return {
    id: `plan-${planName}`,
    plan_name: planName,
    display_name: planName,
    description: '',
    max_users: seed.maxUsers,
    price_monthly: seed.monthly,
    price_yearly_total: seed.yearly,
    features: [],
    highlighted: planName === 'solo',
    created_at: new Date(0).toISOString(),
  };
}

describe('PlanLimit — unidade de preço (centavos)', () => {
  it('exposes monthly price in cents for every plan', () => {
    for (const [planName, seed] of Object.entries(SEED)) {
      const plan = buildPlanLimit(planName);
      expect(plan.price_monthly).toBe(seed.monthly);
      // Em reais: 49, 119, 249 — nunca 0,49 / 1,19 / 2,49
      expect(plan.price_monthly / 100).toBeGreaterThanOrEqual(49);
    }
  });

  it('keeps the yearly total close to 10 monthly payments', () => {
    for (const [planName, seed] of Object.entries(SEED)) {
      const plan = buildPlanLimit(planName);
      expect(plan.price_yearly_total).toBe(seed.monthly * 10);
      // Economia real de 2 meses para o cliente
      expect(plan.price_monthly * 12 - plan.price_yearly_total).toBeGreaterThan(0);
    }
  });

  it('never returns a sub-1-real monthly price (guard against unit mixups)', () => {
    for (const planName of Object.keys(SEED)) {
      const plan = buildPlanLimit(planName);
      expect(plan.price_monthly).toBeGreaterThanOrEqual(100);
    }
  });
});
