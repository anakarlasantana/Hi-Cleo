import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { calculatePrice, type PlanName, type BillingPeriod } from './price-calculator.js';

export const paymentRouter = Router();

// POST /payments — cria pagamento (PIX ou cartão)
paymentRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { planName, billingPeriod, email, method, cardToken, cardBrand, installments } = req.body;

    if (!planName || !billingPeriod || !email || !method) {
      res.status(400).json({ error: 'Campos obrigatórios: planName, billingPeriod, email, method' });
      return;
    }

    if (method === 'credit_card' && (!cardToken || !cardBrand)) {
      res.status(400).json({ error: 'Cartão requer: cardToken, cardBrand' });
      return;
    }

    const result = await container.paymentService.createPayment({
      planName, billingPeriod, email, method, cardToken, cardBrand, installments,
    });

    res.status(201).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Erro ao criar pagamento' });
  }
});

// GET /payments/price — calcula preço sem criar pagamento
paymentRouter.get('/price', (req: Request, res: Response) => {
  try {
    const planName = req.query.planName as PlanName;
    const billingPeriod = req.query.billingPeriod as BillingPeriod;
    const method = (req.query.method as 'pix' | 'credit_card') || 'pix';
    const installments = parseInt(String(req.query.installments)) || 1;

    if (!planName || !billingPeriod) {
      res.status(400).json({ error: 'Query params obrigatórios: planName, billingPeriod' });
      return;
    }

    res.json(calculatePrice(planName, billingPeriod, method, installments));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /payments/:orderId/status — consulta status
paymentRouter.get('/:orderId/status', async (req: Request, res: Response) => {
  try {
    const result = await container.paymentService.getStatus(req.params.orderId as string);
    if (!result) { res.status(404).json({ error: 'Pagamento não encontrado' }); return; }
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
