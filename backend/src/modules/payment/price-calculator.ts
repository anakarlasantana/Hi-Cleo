export type PlanName = 'solo' | 'equipe' | 'empresa';
export type BillingPeriod = 'monthly' | 'yearly';

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

interface CalculatePriceParams {
  basePrice: number;
  monthlyPrice: number;
  billingPeriod: BillingPeriod;
  paymentMethod: 'pix' | 'credit_card';
  installments: number;
}

/**
 * Calcula preço final com juros, formatação e valor pro Mercado Pago.
 * Recebe o preço base do banco — não usa constantes hardcoded.
 */
export function calculatePrice(params: CalculatePriceParams): PriceResult {
  const { basePrice, monthlyPrice, billingPeriod, paymentMethod, installments } = params;

  let finalPrice = basePrice;
  let interestApplied = false;

  // Juros compostos apenas para cartão com mais de 3 parcelas
  if (paymentMethod === 'credit_card' && installments > 3) {
    finalPrice = Math.round(basePrice * Math.pow(1 + MONTHLY_INTEREST_RATE, installments));
    interestApplied = true;
  }

  const installmentPrice = Math.round(finalPrice / installments);
  const discountLabel = paymentMethod === 'pix' ? '10% off no PIX' : null;

  let savingsLabel: string | null = null;
  if (billingPeriod === 'yearly') {
    // Economia = diferença entre pagar 12 meses vs preço anual
    const yearlyIfMonthly = monthlyPrice * 12;
    const savings = yearlyIfMonthly - basePrice;
    if (savings > 0) {
      savingsLabel = `Economia de ${formatCurrency(savings)}`;
    }
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
