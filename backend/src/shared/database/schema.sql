-- Schema será mantido aqui para referência
-- Execute no Supabase SQL Editor

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  plano TEXT NOT NULL DEFAULT 'solo',
  telefone TEXT UNIQUE NOT NULL,
  horario_comercial_inicio TEXT DEFAULT '08:00',
  horario_comercial_fim TEXT DEFAULT '18:00',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de sessões WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  instance_name TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',
  connected_at TIMESTAMPTZ,
  last_check TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status TEXT DEFAULT 'novo',
  last_interaction TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  texto TEXT NOT NULL,
  direcao TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de follow-ups
CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id),
  user_id UUID REFERENCES users(id),
  data_agendada TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de regras
CREATE TABLE IF NOT EXISTS rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  condition TEXT NOT NULL,
  response TEXT NOT NULL,
  active BOOLEAN DEFAULT true
);

-- Tabela de códigos de ativação
CREATE TABLE IF NOT EXISTS activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  plano TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de onboarding
CREATE TABLE IF NOT EXISTS onboarding_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  step TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de contatos excluídos
CREATE TABLE IF NOT EXISTS excluded_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  telefone TEXT NOT NULL,
  nome TEXT,
  UNIQUE(user_id, telefone)
);
