-- Migration: Reestruturação do fluxo de ativação para suporte multi-usuário
-- Requirements: 1.5, 3.4, 4.2, 7.5

-- 1. Vincular activation_code ao comprador
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- 2. Permitir user sem phone/name (criado no pagamento, complementado na ativação)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;

-- 3. Adicionar max_connections_override para deals customizados
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_connections_override INTEGER;

-- 4. Vincular colaborador ao owner do plano
ALTER TABLE users ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

-- 5. Remover UNIQUE constraint antiga do phone e recriar como partial
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;

-- 6. Criar partial unique index no email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;

-- 7. Nova tabela: invites (convites para colaboradores)
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

CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_owner ON invites(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_invites_phone ON invites(phone);

-- 8. Índice para buscar sessões ativas por usuário e status
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON whatsapp_sessions(user_id, status);

-- 9. Índices para activation_codes (novos campos)
CREATE INDEX IF NOT EXISTS idx_activation_codes_user_id ON activation_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_user_email ON activation_codes(user_email);
