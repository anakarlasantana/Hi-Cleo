-- Trial de 7 dias: tabela de tentativas + campos na users
-- Suporta anti-abuso (5 camadas), métricas de uso e prospecção pós-trial

-- 1. Tabela trial_attempts
CREATE TABLE IF NOT EXISTS trial_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dados do formulário (mínimo obrigatório)
  name TEXT NOT NULL,
  phone TEXT NOT NULL,

  -- Dados enriquecidos via onboarding (preenchidos progressivamente)
  email TEXT,
  email_normalized TEXT,
  business_type TEXT,
  city TEXT,
  state TEXT,
  referral_source TEXT,

  -- Dados técnicos (anti-abuso — coletados automaticamente)
  ip_address INET,
  device_fingerprint TEXT,
  user_agent TEXT,

  -- Estado do trial
  status TEXT DEFAULT 'started',
  blocked_reason TEXT,

  -- Métricas de uso (preenchidas durante o trial)
  trial_user_id UUID REFERENCES users(id),
  responses_used INTEGER DEFAULT 0,
  leads_captured INTEGER DEFAULT 0,
  whatsapp_connected BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  last_activity_at TIMESTAMPTZ,

  -- Prospecção pós-trial
  prospection_attempts INTEGER DEFAULT 0,
  last_prospection_at TIMESTAMPTZ,
  prospection_status TEXT DEFAULT 'pending',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);

-- Índices para anti-abuso
CREATE INDEX idx_trial_phone_90d ON trial_attempts(phone, created_at DESC);
CREATE INDEX idx_trial_device ON trial_attempts(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
CREATE INDEX idx_trial_ip_24h ON trial_attempts(ip_address, created_at DESC);

-- Índices para prospecção
CREATE INDEX idx_trial_prospection ON trial_attempts(status, prospection_status) WHERE status IN ('expired', 'started');
CREATE INDEX idx_trial_hot_leads ON trial_attempts(responses_used DESC) WHERE status = 'expired' AND prospection_status = 'pending';

-- 2. Campos adicionais na tabela users (para trials)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_responses_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_responses_limit INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS trial_attempt_id UUID REFERENCES trial_attempts(id);

-- Comentários
COMMENT ON TABLE trial_attempts IS 'Registro de tentativas de trial — anti-abuso, métricas e prospecção';
COMMENT ON COLUMN trial_attempts.status IS 'started | activated | expired | converted | blocked';
COMMENT ON COLUMN trial_attempts.prospection_status IS 'pending | contacted | interested | not_interested | converted';
COMMENT ON COLUMN trial_attempts.blocked_reason IS 'duplicate_phone | rate_limit_ip | invalid_phone | duplicate_device';
COMMENT ON COLUMN users.trial_responses_used IS 'Contador de respostas IA usadas durante o trial (max 30)';
COMMENT ON COLUMN users.trial_responses_limit IS 'Limite de respostas IA no trial (padrão 30)';
