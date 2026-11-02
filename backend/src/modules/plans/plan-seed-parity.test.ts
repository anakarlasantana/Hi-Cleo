import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Paridade do catálogo: `backend/seeds/plan_limits.sql` é a fonte única de
 * preço/ordem (roda em toda subida via serviço `migrate`). Se alguém mudar o
 * valor no banco, no frontend ou no seed sem atualizar os outros, este teste
 * falha — foi assim que a vitrine e o checkout divergiram no passado.
 */
function loadSeed(): string {
  const candidates = [
    resolve(process.cwd(), 'seeds/plan_limits.sql'),
    resolve(process.cwd(), 'backend/seeds/plan_limits.sql'),
    resolve(process.cwd(), '..', 'backend/seeds/plan_limits.sql'),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) throw new Error('seeds/plan_limits.sql não encontrado');
  return readFileSync(path, 'utf8');
}

interface SeedPlan {
  name: string;
  monthly: number;
  yearly: number;
  sortOrder: number;
}

function parseSeed(sql: string): SeedPlan[] {
  return sql
    .split('INSERT INTO plan_limits')
    .slice(1)
    .map((block) => {
      const name = /VALUES\s*\(\s*'([a-z_]+)'/i.exec(block)?.[1];
      const prices = /,\s*(\d+),\s*(\d+),\s*\n?\s*ARRAY/i.exec(block);
      const sortOrder = /(?:true|false),\s*(\d+)\s*\)/.exec(block);

      expect(name, `bloco sem plan_name: ${block.slice(0, 60)}`).toBeTruthy();
      expect(prices, `bloco sem preços: ${name}`).toBeTruthy();
      expect(sortOrder, `bloco sem sort_order: ${name}`).toBeTruthy();

      return {
        name: name as string,
        monthly: Number(prices![1]),
        yearly: Number(prices![2]),
        sortOrder: Number(sortOrder![1]),
      };
    });
}

describe('seeds/plan_limits.sql — catálogo como fonte única', () => {
  const sql = loadSeed();
  const plans = parseSeed(sql);

  it('declara sort_order na coluna e no UPSERT (ordem de vitrine explícita)', () => {
    expect(sql).toContain('highlighted, sort_order)');
    expect(sql).toContain('sort_order = EXCLUDED.sort_order');
  });

  it('lista os planos na ordem da vitrine: Solo → Equipe → Empresa', () => {
    expect(plans.map((plan) => plan.name)).toEqual(['solo', 'equipe', 'empresa']);
    expect(plans.map((plan) => plan.sortOrder)).toEqual([1, 2, 3]);
  });

  it('mantém os preços mensais em centavos', () => {
    expect(plans.map((plan) => plan.monthly)).toEqual([8990, 23990, 62990]);
  });

  it('mantém o anual como mensal × 10 (2 meses grátis = 16,7%)', () => {
    expect(plans.map((plan) => plan.yearly)).toEqual([89900, 239900, 629900]);
    for (const plan of plans) {
      expect(plan.yearly).toBe(plan.monthly * 10);
    }
  });

  it('não deixa desconto de volume acima da faixa de mercado (10–20%)', () => {
    const avulso = plans[0].monthly; // Solo = preço do assento avulso
    for (const plan of plans.slice(1)) {
      const seats = plan.name === 'equipe' ? 3 : 8;
      const cheio = avulso * seats;
      const desconto = (cheio - plan.monthly) / cheio;
      expect(desconto).toBeGreaterThan(0);
      expect(desconto).toBeLessThan(0.2);
    }
  });
});
