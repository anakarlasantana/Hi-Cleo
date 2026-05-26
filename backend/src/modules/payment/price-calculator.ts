export type PlanName = 'solo' | 'equipe' | 'empresa';
export type BillingPeriod = 'monthly' | 'yearly';

const PLAN_PRICES: Record<PlanName, { monthly: number; yearly: number }> = {
  solo: { monthly: 4900, yearly: 49000 },
  equipe: { monthly: 11900, yearly: 119000 },
  empresa: { monthly: 24900, yearly: 249000 },
};

const MONTHLY_INTEREST_RATE = 0.0199;

export interface PriceResult {
  basePrice: number;
  finalPrice: number;
  installmentPrice: number;
  installments: number;
  interestApplied: boolean;
  discountLabel: string | null;
  savingsLabel: string | null;
  formattedTotal: string;
  formattedInstallment: string;
  mpAmount: string;
}

export function calculatePrice(
  planName: PlanName,
  billingPeriod: BillingPeriod,
  paymentMethod: 'pix' | 'credit_card',
  installments: number
): PriceResult {
  const basePrice = PLAN_PRICES[planName][billingPeriod];
  let finalPrice = basePrice;
  let interestApplied = false;

  if (paymentMethod === 'credit_card' && installments > 3) {
    finalPrice = Math.round(basePrice * Math.pow(1 + MONTHLY_INTEREST_RATE, installments));
    interestApplied = true;
  }

  const installmentPrice = Math.round(finalPrice / installments);
  const discountLabel = paymentMethod === 'pix' ? '10% off no PIX' : null;

  let savingsLabel: string | null = null;
  if (billingPeriod === 'yearly') {
    const savings = PLAN_PRICES[planName].monthly * 2;
    savingsLabel = `Economia de ${formatCurrency(savings)}`;
  }

  return {
    basePrice,
    finalPrice,
    installmentPrice,
    installments,
    interestApplied,
    discountLabel,
    savingsLabel,
    formattedTotal: formatCurrency(finalPrice),
    formattedInstallment: installments > 1
      ? `${installments}x de ${formatCurrency(installmentPrice)}`
      : formatCurrency(finalPrice),
    mpAmount: (finalPrice / 100).toFixed(2),
  };
}

export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
