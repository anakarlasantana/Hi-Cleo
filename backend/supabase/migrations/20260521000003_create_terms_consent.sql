-- Tabela de consentimento LGPD
CREATE TABLE IF NOT EXISTS terms_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  terms_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT
);

-- Índice para consentimento
CREATE INDEX IF NOT EXISTS idx_terms_consent_user ON terms_consent(user_id);

-- Adicionar campo email à tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
