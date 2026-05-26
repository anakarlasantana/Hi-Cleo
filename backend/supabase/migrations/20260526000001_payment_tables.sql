-- Tabela de pagamentos (registros de orders do Mercado Pago)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_order_id VARCHAR NOT NULL,
  external_payment_id VARCHAR,
  user_email VARCHAR NOT NULL,
  plan_name VARCHAR NOT NULL,
  billing_period VARCHAR NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  payment_method VARCHAR NOT NULL CHECK (payment_method IN ('pix', 'credit_card')),
  installments INTEGER NOT NULL DEFAULT 1,
  amount_cents INTEGER NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'rejected', 'cancelled', 'refunded')),
  pix_qr_code TEXT,
  pix_qr_code_base64 TEXT,
  activation_code_id UUID REFERENCES activation_codes(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_payments_external_order_id ON payments(external_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_email ON payments(user_email);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Tabela de eventos de assinatura (log de auditoria)
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  event_type VARCHAR NOT NULL CHECK (event_type IN ('payment_approved', 'expired', 'reactivated', 'reminder_sent')),
  order_id VARCHAR NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_event_type ON subscription_events(event_type);
