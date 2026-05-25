-- Hi Cleo - Initial Schema (English, consolidated)

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'solo',
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  subscription_status TEXT DEFAULT 'active',
  subscription_started_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  billing_period TEXT DEFAULT 'monthly',
  payment_provider_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Profile (dados do negócio do usuário)
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE,
  name TEXT,
  type TEXT,
  services TEXT,
  description TEXT,
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

-- Activation Codes
CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL,
  payment_id TEXT NOT NULL,
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

-- Indexes
CREATE INDEX idx_leads_user_id ON leads(user_id);
CREATE INDEX idx_leads_user_created ON leads(user_id, created_at DESC);
CREATE INDEX idx_leads_user_status ON leads(user_id, status);
CREATE INDEX idx_terms_consent_user ON terms_consent(user_id);
CREATE INDEX idx_sessions_user_id ON whatsapp_sessions(user_id);
CREATE INDEX idx_sessions_instance ON whatsapp_sessions(instance_name);
CREATE INDEX idx_followups_user_status ON follow_ups(user_id, status);
CREATE INDEX idx_activation_code ON activation_codes(code);
CREATE INDEX idx_cancellations_user ON cancellations(user_id);

-- Seed: Plan Limits
INSERT INTO plan_limits (plan_name, display_name, description, max_users, price_monthly, price_yearly_total, features, highlighted) VALUES
  ('solo', 'Solo', '1 usuário', 1, 49, 490, ARRAY['Contatos ilimitados', 'Entende áudio e texto', 'Acompanhamento automático', 'Respostas inteligentes'], true),
  ('equipe', 'Equipe', 'Até 3 usuários', 3, 119, 1190, ARRAY['Tudo do Solo', 'Até 3 usuários conectados', 'Contatos ilimitados', 'Suporte prioritário'], false),
  ('empresa', 'Empresa', 'Até 8 usuários', 8, 249, 2490, ARRAY['Tudo do Equipe', 'Até 8 usuários conectados', 'Contatos ilimitados', 'Suporte dedicado'], false);
