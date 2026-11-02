-- Hi Cleo — Seed de dados de referência (planos)
-- ================================================
-- Roda em TODA subida (serviço `migrate`), diferente das migrations versionadas.
-- É idempotente por UPSERT: editar preço/feature aqui atualiza o banco no próximo
-- `docker compose up -d`, sem precisar criar uma migration nova.
--
-- IMPORTANTE: preços em CENTAVOS (4900 = R$ 49,00). `payment/price-calculator`
-- divide por 100 ao gerar o valor do Mercado Pago.

INSERT INTO plan_limits (plan_name, display_name, description, max_users, price_monthly, price_yearly_total, features, highlighted)
VALUES (
  'solo', 'Solo', '1 usuário', 1, 4900, 49000,
  ARRAY['Contatos ilimitados', 'Entende áudio e texto', 'Acompanhamento automático', 'Respostas inteligentes'],
  true
)
ON CONFLICT (plan_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  max_users = EXCLUDED.max_users,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly_total = EXCLUDED.price_yearly_total,
  features = EXCLUDED.features,
  highlighted = EXCLUDED.highlighted;

INSERT INTO plan_limits (plan_name, display_name, description, max_users, price_monthly, price_yearly_total, features, highlighted)
VALUES (
  'equipe', 'Equipe', 'Até 3 usuários', 3, 11900, 119000,
  ARRAY['Tudo do Solo', 'Até 3 usuários conectados', 'Contatos ilimitados', 'Suporte prioritário'],
  false
)
ON CONFLICT (plan_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  max_users = EXCLUDED.max_users,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly_total = EXCLUDED.price_yearly_total,
  features = EXCLUDED.features,
  highlighted = EXCLUDED.highlighted;

INSERT INTO plan_limits (plan_name, display_name, description, max_users, price_monthly, price_yearly_total, features, highlighted)
VALUES (
  'empresa', 'Empresa', 'Até 8 usuários', 8, 24900, 249000,
  ARRAY['Tudo do Equipe', 'Até 8 usuários conectados', 'Contatos ilimitados', 'Suporte dedicado'],
  false
)
ON CONFLICT (plan_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  max_users = EXCLUDED.max_users,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly_total = EXCLUDED.price_yearly_total,
  features = EXCLUDED.features,
  highlighted = EXCLUDED.highlighted;
