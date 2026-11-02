-- Hi Cleo — Ordem de apresentação dos planos (Solo → Equipe → Empresa)
-- ======================================================================
-- Por que existe: `GET /api/activation/plans` fazia `select().from(plan_limits)`
-- SEM ORDER BY. No Postgres a ordem de linhas é detalhe de armazenamento: depois
-- de vários UPSERTs de preço (migration 0003 + seeds repetidos), a ordem física
-- virou `empresa, solo, equipe` e a API passou a devolver fora da ordem da
-- vitrine. Ordem de produto precisa ser EXPLÍCITA.

ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE plan_limits
SET sort_order = CASE plan_name
  WHEN 'solo' THEN 1
  WHEN 'equipe' THEN 2
  WHEN 'empresa' THEN 3
  ELSE 99
END
WHERE sort_order IS DISTINCT FROM CASE plan_name
  WHEN 'solo' THEN 1
  WHEN 'equipe' THEN 2
  WHEN 'empresa' THEN 3
  ELSE 99
END;

CREATE INDEX IF NOT EXISTS idx_plan_limits_sort ON plan_limits(sort_order);

-- Higiene: reordena FISICAMENTE a tabela (3 linhas, ACCESS EXCLUSIVE trivial).
-- Não é o que garante a ordem — isso é o ORDER BY sort_order no repositório —
-- mas deixa `select * from plan_limits` legível. Tolerante a falha: se o
-- CLUSTER não puder rodar, a migration segue (a ordem lógica já está garantida).
DO $$
BEGIN
  EXECUTE 'CLUSTER plan_limits USING idx_plan_limits_sort';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CLUSTER ignorado (%). A ordem segue garantida por sort_order + ORDER BY.', SQLERRM;
END $$;
