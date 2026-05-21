-- Tabela de limites de plano (configuração)
CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT UNIQUE NOT NULL,
  max_users INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed de limites
INSERT INTO plan_limits (plan_name, max_users) VALUES
  ('solo', 1),
  ('equipe', 3),
  ('empresa', 8);
