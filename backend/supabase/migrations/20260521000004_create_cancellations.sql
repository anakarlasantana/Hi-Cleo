-- Tabela de cancelamentos
CREATE TABLE IF NOT EXISTS cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  cancelled_at TIMESTAMPTZ DEFAULT NOW(),
  access_until TIMESTAMPTZ NOT NULL,
  refund_eligible BOOLEAN DEFAULT false,
  refund_processed BOOLEAN DEFAULT false,
  reactivated_at TIMESTAMPTZ
);

-- Adicionar campos de assinatura à tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
