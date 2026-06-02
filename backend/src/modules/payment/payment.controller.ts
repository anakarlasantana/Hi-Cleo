import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { container } from '../../container.js';
import { calculatePrice, type PlanName, type BillingPeriod } from './price-calculator.js';

export const paymentRouter = Router();

const createPaymentSchema = z.object({
  planName: z.enum(['solo', 'equipe', 'empresa']),
  billingPeriod: z.enum(['monthly', 'yearly']),
  email: z.string().email('E-mail inválido'),
  method: z.enum(['pix', 'credit_card']),
  cardToken: z.string().min(1).optional(),
  cardBrand: z.string().min(1).optional(),
  installments: z.number().int().min(1).max(12).optional(),
});

/**
 * Busca preço base do plano no banco e calcula com juros/parcelamento.
 */
async function getPriceFromDatabase(planName: string, billingPeriod: BillingPeriod, method: 'pix' | 'credit_card', installments: number) {
  const plan = await container.planRepo.getPlanLimit(planName);
  if (!plan) throw new Error(`Plano "${planName}" não encontrado`);

  const basePrice = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly_total;

  return calculatePrice({
    basePrice,
    monthlyPrice: plan.price_monthly,
    billingPeriod,
    paymentMethod: method,
    installments,
  });
}

// POST /payments — cria pagamento (PIX ou cartão)
paymentRouter.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { planName, billingPeriod, email, method, cardToken, cardBrand, installments } = parsed.data;

    if (method === 'credit_card' && (!cardToken || !cardBrand)) {
      res.status(400).json({ error: 'Cartão requer: cardToken, cardBrand' });
      return;
    }

    const result = await container.paymentService.createPayment({
      planName: planName as PlanName, billingPeriod, email, method, cardToken, cardBrand, installments,
    });

    res.status(201).json(result);
  } catch (error: any) {
    container.logger.error({ err: error }, 'Erro ao criar pagamento');
    res.status(500).json({ error: 'Erro ao processar pagamento. Tente novamente.' });
  }
});

// GET /payments/price — calcula preço sem criar pagamento (busca do banco)
paymentRouter.get('/price', async (req: Request, res: Response) => {
  try {
    const planName = req.query.planName as string;
    const billingPeriod = req.query.billingPeriod as BillingPeriod;
    const method = (req.query.method as 'pix' | 'credit_card') || 'pix';
    const installments = parseInt(String(req.query.installments)) || 1;

    if (!planName || !billingPeriod) {
      res.status(400).json({ error: 'Query params obrigatórios: planName, billingPeriod' });
      return;
    }

    const price = await getPriceFromDatabase(planName, billingPeriod, method, installments);
    res.json(price);
  } catch (error: any) {
    container.logger.error({ err: error }, 'Erro ao calcular preço');
    res.status(500).json({ error: 'Erro ao calcular preço. Tente novamente.' });
  }
});

// GET /payments/:orderId/status — consulta status
paymentRouter.get('/:orderId/status', async (req: Request, res: Response) => {
  try {
    const result = await container.paymentService.getStatus(req.params.orderId as string);
    if (!result) { res.status(404).json({ error: 'Pagamento não encontrado' }); return; }
    res.json(result);
  } catch (error: any) {
    container.logger.error({ err: error }, 'Erro ao consultar status');
    res.status(500).json({ error: 'Erro ao consultar status. Tente novamente.' });
  }
});
