-- Adiciona campos de timezone e dias úteis ao business profile
-- Estes campos permitem controle preciso de horário de atendimento

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS business_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri'];

-- Comentários para documentação do schema
COMMENT ON COLUMN businesses.timezone IS 'IANA timezone do dono (ex: America/Sao_Paulo, America/Manaus)';
COMMENT ON COLUMN businesses.business_days IS 'Dias da semana em que atende (mon, tue, wed, thu, fri, sat, sun)';
