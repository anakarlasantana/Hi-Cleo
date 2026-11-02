-- Hi Cleo — Preços dos planos em centavos
-- ========================================
-- Regra de negócio (docs/produto/regras-de-negocio.md):
--   "Valores internos em centavos para evitar erros de arredondamento".
--
-- O seed original gravou 49 / 119 / 249 (reais), mas todo o código trata
-- price_monthly/price_yearly_total como CENTAVOS (payment/price-calculator
-- divide por 100 para gerar o valor do Mercado Pago). Resultado: o checkout
-- cobraria R$ 0,49 em vez de R$ 49,00.
--
-- Esta migration normaliza apenas os valores do seed original, preservando
-- qualquer preço que já tenha sido ajustado manualmente para outro patamar.

UPDATE plan_limits
  SET price_monthly = 4900, price_yearly_total = 49000
  WHERE plan_name = 'solo' AND price_monthly = 49 AND price_yearly_total = 490;
UPDATE plan_limits
  SET price_monthly = 11900, price_yearly_total = 119000
  WHERE plan_name = 'equipe' AND price_monthly = 119 AND price_yearly_total = 1190;
UPDATE plan_limits
  SET price_monthly = 24900, price_yearly_total = 249000
  WHERE plan_name = 'empresa' AND price_monthly = 249 AND price_yearly_total = 2490;

-- Guarda-corpo: valores abaixo de R$ 1,00 (100 centavos) indicam unidade errada
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM plan_limits WHERE price_monthly < 100) THEN
    RAISE EXCEPTION 'plan_limits.price_monthly suspeito (<100 centavos): verifique a unidade dos preços';
  END IF;
END $$;
