import { describe, it, expect } from 'vitest';
import { db } from '../../shared/config/database.js';
import { planLimits } from '../../shared/schema.js';
import { buildAllPlansQuery, PLAN_ORDER_BY } from './plans.repository.js';

/**
 * Regressão definitiva do bug de 2026-11-02: `GET /api/activation/plans`
 * devolvia `empresa, solo, equipe` porque a query não tinha `ORDER BY` — no
 * Postgres a ordem de linhas é detalhe de armazenamento e os UPSERTs de preço
 * embaralharam o heap.
 *
 * O teste injeta um `database` falso e captura os argumentos do `orderBy`,
 * garantindo que a consulta **sempre** ordena por `sort_order` (e depois por
 * `plan_name`, como desempate determinístico).
 */
describe('DrizzlePlanRepository — ORDER BY canônico dos planos', () => {
  function fakeDatabase() {
    const captured: unknown[][] = [];
    const database = {
      select: () => ({
        from: () => ({
          orderBy: (...args: unknown[]) => {
            captured.push(args);
            return Promise.resolve([]);
          },
        }),
      }),
    } as unknown as typeof db;

    return { database, captured };
  }

  it('aplica ORDER BY sort_order e plan_name (nessa ordem)', async () => {
    const { database, captured } = fakeDatabase();

    await buildAllPlansQuery(database);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual([planLimits.sortOrder, planLimits.planName]);
  });

  it('expõe a ordem canônica como constante reutilizável', () => {
    expect(PLAN_ORDER_BY).toEqual([planLimits.sortOrder, planLimits.planName]);
  });
});
