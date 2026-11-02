-- Hi Cleo — Integridade do plano nos pagamentos
-- =============================================
-- `payments.plan_name` e `users.plan` são texto livre. Um typo (ex: "Sollo")
-- grava um pagamento órfão e depois faz `getUserMaxConnections` lançar
-- "Usuário não encontrado ao buscar plano", derrubando /api/activation/slots.
--
-- Aqui: normaliza planos inválidos já existentes para 'solo' e cria a FK em
-- payments.plan_name → plan_limits.plan_name.

-- 1. Normaliza planos inválidos (dados legados)
--    'basic' era usado em testes/seed antigo e não existe em plan_limits.
--    Qualquer plano fora do catálogo vira 'solo' para não bloquear o beta.
UPDATE payments SET plan_name = 'solo'
  WHERE plan_name NOT IN (SELECT plan_name FROM plan_limits);

UPDATE users SET plan = 'solo'
  WHERE plan IS NULL OR plan = '' OR plan NOT IN (SELECT plan_name FROM plan_limits);

-- 2. FK em payments (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_plan_name_fk'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_plan_name_fk
      FOREIGN KEY (plan_name) REFERENCES plan_limits(plan_name);
  END IF;
END $$;

-- 3. FK em users.plan (coluna tem DEFAULT 'solo', então NOT NULL é seguro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_plan_fk'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_plan_fk
      FOREIGN KEY (plan) REFERENCES plan_limits(plan_name);
  END IF;
END $$;
