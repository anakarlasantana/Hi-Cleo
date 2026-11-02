-- Opt-out do cliente final (LGPD art. 18, IX — direito de oposição).
--
-- Por que existe: o único opt-out do sistema era o da prospecção pós-trial
-- (`trial_attempts.prospection_status = 'not_interested'`). Um CLIENTE de um
-- salão dizendo "para de me mandar mensagem" não tinha registro nenhum: a Cleo
-- continuava respondendo automaticamente e nada impedia um envio futuro. Além do
-- risco de LGPD, cliente que pede para parar e continua recebendo tende a
-- BLOQUEAR o número — o que derruba a entregabilidade de todos os clientes
-- daquele dono (`docs/tecnico/whatsapp-anti-ban.md`).
--
-- `opt_out_at` nulo = cliente normal. Preenchido = não enviar mensagem proativa.
-- A reativação é automática: se o cliente voltar a escrever, o processor limpa a
-- marca (ele procurou o negócio de novo, então voltou a consentir).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out_reason TEXT;

-- Índice parcial: só interessa quem está com opt-out (a maioria fica NULL).
CREATE INDEX IF NOT EXISTS idx_leads_opt_out
  ON leads (user_id)
  WHERE opt_out_at IS NOT NULL;
