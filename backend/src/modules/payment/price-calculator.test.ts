import { describe, it, expect } from 'vitest';
import { calculatePrice, formatCurrency } from './price-calculator.js';

// Preços do banco em CENTAVOS (migration 0003)
const SOLO_MONTHLY = 4900;
const SOLO_YEARLY = 49000;

describe('calculatePrice', () => {
  describe('PIX — preço cheio', () => {
    it('charges the full price (no discount)', () => {
      const result = calculatePrice({
        basePrice: SOLO_MONTHLY,
        monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'monthly',
        paymentMethod: 'pix',
        installments: 1,
      });

      expect(result.finalPrice).toBe(SOLO_MONTHLY);
      expect(result.interestApplied).toBe(false);
      expect(result.mpAmount).toBe('49.00');
    });

    // Regressão: existia um `discountLabel = '10% off no PIX'` sem desconto
    // aplicado — o campo foi removido (código morto que prometia ao cliente
    // algo que não acontecia).
    it('does not expose any discount label', () => {
      const result = calculatePrice({
        basePrice: SOLO_MONTHLY,
        monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'monthly',
        paymentMethod: 'pix',
        installments: 1,
      }) as unknown as Record<string, unknown>;

      expect(result).not.toHaveProperty('discountLabel');
    });
  });

  describe('cartão à vista — preço cheio', () => {
    it('matches the PIX amount for a single installment', () => {
      const pix = calculatePrice({
        basePrice: SOLO_MONTHLY, monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'monthly', paymentMethod: 'pix', installments: 1,
      });
      const card = calculatePrice({
        basePrice: SOLO_MONTHLY, monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'monthly', paymentMethod: 'credit_card', installments: 1,
      });

      expect(card.finalPrice).toBe(pix.finalPrice);
      expect(card.mpAmount).toBe('49.00');
    });

    it('does not add interest up to 3 installments', () => {
      for (const installments of [2, 3]) {
        const result = calculatePrice({
          basePrice: SOLO_MONTHLY, monthlyPrice: SOLO_MONTHLY,
          billingPeriod: 'monthly', paymentMethod: 'credit_card', installments,
        });
        expect(result.interestApplied).toBe(false);
        expect(result.finalPrice).toBe(SOLO_MONTHLY);
      }
    });
  });

  describe('cartão parcelado — juros compostos acima de 3x', () => {
    it('applies compound interest from 4 installments', () => {
      const result = calculatePrice({
        basePrice: SOLO_MONTHLY, monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'monthly', paymentMethod: 'credit_card', installments: 4,
      });

      expect(result.interestApplied).toBe(true);
      // 4900 * (1 + 0.0199)^4 ≈ 5301
      expect(result.finalPrice).toBe(5302);
      expect(result.finalPrice).toBeGreaterThan(SOLO_MONTHLY);
      expect(result.mpAmount).toBe('53.02');
    });

    it('keeps installments × installmentPrice ≈ total', () => {
      const result = calculatePrice({
        basePrice: SOLO_MONTHLY, monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'monthly', paymentMethod: 'credit_card', installments: 6,
      });

      expect(Math.abs(result.installmentPrice * 6 - result.finalPrice)).toBeLessThanOrEqual(6);
    });
  });

  describe('plano anual', () => {
    it('uses the yearly total as base price', () => {
      const result = calculatePrice({
        basePrice: SOLO_YEARLY, monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'yearly', paymentMethod: 'pix', installments: 1,
      });

      expect(result.finalPrice).toBe(SOLO_YEARLY);
      expect(result.mpAmount).toBe('490.00');
    });

    it('reports the savings versus paying 12 months', () => {
      const result = calculatePrice({
        basePrice: SOLO_YEARLY, monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'yearly', paymentMethod: 'pix', installments: 1,
      });

      // 12 × R$49 = R$588 → economia de R$98
      expect(result.savingsLabel).toContain('98,00');
    });

    it('does not report savings on monthly billing', () => {
      const result = calculatePrice({
        basePrice: SOLO_MONTHLY, monthlyPrice: SOLO_MONTHLY,
        billingPeriod: 'monthly', paymentMethod: 'pix', installments: 1,
      });

      expect(result.savingsLabel).toBeNull();
    });
  });

  describe('formatCurrency', () => {
    it('formats cents as BRL', () => {
      expect(formatCurrency(4900)).toContain('49,00');
      expect(formatCurrency(119000)).toContain('1.190,00');
    });
  });
});
