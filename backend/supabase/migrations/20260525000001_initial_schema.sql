-- Hi Cleo - Schema Consolidado (com suporte multi-user)

-- Users (phone e name nullable — user criado no pagamento, complementado na ativação)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  plan TEXT NOT NULL DEFAULT 'solo',
  phone TEXT,
  email TEXT,
  subscription_status TEXT DEFAULT 'active',
  subscription_started_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  billing_period TEXT DEFAULT 'monthly',
  payment_provider_id TEXT,
  max_connections_override INTEGER,
  owner_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique indexes (permitem NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;

-- Business Profile (dados do negócio, independente por usuário/colaborador)
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE,
  name TEXT,
  type TEXT,
  services TEXT,
  description TEXT,
  target_audience TEXT,
  tone_of_voice TEXT DEFAULT 'friendly_professional',
  business_hours_start TEXT DEFAULT '08:00',
  business_hours_end TEXT DEFAULT '18:00',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp Sessions
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  instance_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_check TIMESTAMPTZ DEFAULT NOW()
);

-- Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  last_interaction TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  text TEXT NOT NULL,
  direction TEXT NOT NULL,
  media_type TEXT,
  media_mime_type TEXT,
  media_file_name TEXT,
  media_key TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Follow-ups
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  user_id UUID REFERENCES users(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rules
CREATE TABLE IF NOT EXISTS rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  condition TEXT NOT NULL,
  response TEXT NOT NULL,
  active BOOLEAN DEFAULT true
);

-- Activation Codes (vinculados ao comprador via user_id e user_email)
CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  user_id UUID REFERENCES users(id),
  user_email TEXT,
  used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES users(id),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Onboarding States
CREATE TABLE IF NOT EXISTS onboarding_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  step TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Excluded Contacts
CREATE TABLE IF NOT EXISTS excluded_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  phone TEXT NOT NULL,
  name TEXT,
  UNIQUE(user_id, phone)
);

-- Plan Limits
CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT UNIQUE NOT NULL,
  display_name TEXT,
  description TEXT,
  max_users INTEGER NOT NULL,
  price_monthly INTEGER NOT NULL DEFAULT 0,
  price_yearly_total INTEGER NOT NULL DEFAULT 0,
  features TEXT[] DEFAULT '{}',
  highlighted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Terms Consent (LGPD)
CREATE TABLE IF NOT EXISTS terms_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  terms_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT
);

-- Cancellations
CREATE TABLE IF NOT EXISTS cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  cancelled_at TIMESTAMPTZ DEFAULT NOW(),
  access_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  refund_eligible BOOLEAN DEFAULT false,
  refund_processed BOOLEAN DEFAULT false,
  reactivated_at TIMESTAMPTZ
);

-- Invites (convites para colaboradores)
CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  phone TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_by_user_id UUID REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_user_created ON leads(user_id, created_at DESC);
CREATE INDEX idx_leads_user_status ON leads(user_id, status);
CREATE INDEX idx_messages_lead_media ON messages(lead_id, media_type) WHERE media_type IS NOT NULL;
CREATE INDEX idx_terms_consent_user ON terms_consent(user_id);
CREATE INDEX idx_sessions_user_id ON whatsapp_sessions(user_id);
CREATE INDEX idx_sessions_instance ON whatsapp_sessions(instance_name);
CREATE INDEX idx_sessions_user_status ON whatsapp_sessions(user_id, status);
CREATE INDEX idx_followups_user_status ON follow_ups(user_id, status);
CREATE INDEX idx_activation_code ON activation_codes(code);
CREATE INDEX idx_activation_codes_user_id ON activation_codes(user_id);
CREATE INDEX idx_activation_codes_user_email ON activation_codes(user_email);
CREATE INDEX idx_cancellations_user ON cancellations(user_id);
CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_owner ON invites(owner_user_id);
CREATE INDEX idx_invites_phone ON invites(phone);

-- Seed: Plan Limits
INSERT INTO plan_limits (plan_name, display_name, description, max_users, price_monthly, price_yearly_total, features, highlighted) VALUES
  ('solo', 'Solo', '1 usuário', 1, 49, 490, ARRAY['Contatos ilimitados', 'Entende áudio e texto', 'Acompanhamento automático', 'Respostas inteligentes'], true),
  ('equipe', 'Equipe', 'Até 3 usuários', 3, 119, 1190, ARRAY['Tudo do Solo', 'Até 3 usuários conectados', 'Contatos ilimitados', 'Suporte prioritário'], false),
  ('empresa', 'Empresa', 'Até 8 usuários', 8, 249, 2490, ARRAY['Tudo do Equipe', 'Até 8 usuários conectados', 'Contatos ilimitados', 'Suporte dedicado'], false);


-- Payments (registros de orders do Mercado Pago)
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

CREATE INDEX idx_payments_external_order_id ON payments(external_order_id);
CREATE INDEX idx_payments_user_email ON payments(user_email);
CREATE INDEX idx_payments_status ON payments(status);

-- Subscription Events (log de auditoria)
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  event_type VARCHAR NOT NULL CHECK (event_type IN ('payment_approved', 'expired', 'reactivated', 'reminder_sent')),
  order_id VARCHAR NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscription_events_user_id ON subscription_events(user_id);
CREATE INDEX idx_subscription_events_event_type ON subscription_events(event_type);
