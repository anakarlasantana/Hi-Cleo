-- Índices para performance de contatos (Requisito 2)
-- Otimiza consultas de listagem e filtragem de leads por usuário

CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_user_created ON leads(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_status ON leads(user_id, status);
