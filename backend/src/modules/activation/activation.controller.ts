import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';

export const activationRouter = Router();

activationRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    const { payment_id, plano } = req.body;

    if (!payment_id || !plano) {
      res.status(400).json({ error: 'payment_id e plano são obrigatórios' });
      return;
    }

    const code = await container.activationService.generateCode(payment_id, plano);

    res.json({
      code: code.code,
      expires_at: code.expires_at,
      instructions: {
        phone: process.env.SECRETARY_PHONE,
        message_template: `${code.code} | Seu Nome | Seu Negócio | Serviços | Horário`,
        example: `${code.code} | João Silva | Imobiliária Centro | Venda e aluguel | Seg-Sex 9h-18h`,
      },
    });
  } catch (error) {
    console.error('[Activation] Erro:', error);
    res.status(500).json({ error: 'Erro ao gerar código de ativação' });
  }
});

activationRouter.get('/validate/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const valid = await container.activationService.validateCode(code);
    res.json({ valid: !!valid, expired: !valid });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao validar código' });
  }
});
