-- Migration: Adicionar campos de mídia na tabela messages
-- Executar no Supabase SQL Editor

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS media_mime_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS media_file_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS media_key TEXT DEFAULT NULL;

-- Index para buscar mensagens com mídia de um lead
CREATE INDEX IF NOT EXISTS idx_messages_lead_media
  ON messages (lead_id, media_type)
  WHERE media_type IS NOT NULL;

COMMENT ON COLUMN messages.media_type IS 'Tipo de mídia: image, video, audio, document';
COMMENT ON COLUMN messages.media_mime_type IS 'MIME type: application/pdf, image/jpeg, etc';
COMMENT ON COLUMN messages.media_file_name IS 'Nome original do arquivo';
COMMENT ON COLUMN messages.media_key IS 'Chave da mensagem no WhatsApp (pra forward)';
