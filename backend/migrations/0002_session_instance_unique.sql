-- Hi Cleo — Sessão WhatsApp: instância única por conexão ativa
-- ============================================================
-- Uma instância da Evolution só pode estar conectada a um usuário por vez.
-- O índice parcial garante que o upsert de connection.update (ON CONFLICT em
-- instance_name WHERE status='active') não crie duplicatas e que reconexões
-- fechem a sessão anterior em vez de acumularem linhas 'active'.

-- 1. Normaliza sessões duplicadas pré-existentes (mantém a mais recente ativa)
UPDATE whatsapp_sessions s
SET status = 'disconnected',
    disconnected_at = NOW()
WHERE s.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM whatsapp_sessions newer
    WHERE newer.instance_name = s.instance_name
      AND newer.status = 'active'
      AND (
        newer.connected_at > s.connected_at
        OR (newer.connected_at IS NOT DISTINCT FROM s.connected_at AND newer.id > s.id)
      )
  );

-- 2. Índice único parcial: só restringe linhas ativas, preservando o histórico
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_instance_active_unique
  ON whatsapp_sessions(instance_name)
  WHERE status = 'active';
