import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';

export const cancellationRouter = Router();

// POST /api/cancellation/request
cancellationRouter.post('/request', async (req: Request, res: Response) => {
  try {
    const { userId, reason } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'userId é obrigatório' });
      return;
    }

    const result = await container.cancellationService.requestCancellation(userId);

    // Send WhatsApp confirmation to user
    const user = await container.userRepo.findById(userId);
    if (user) {
      const dateStr = result.accessUntil.toLocaleDateString('pt-BR');
      await container.messaging.sendText({
        instance: 'secretary',
        to: user.phone,
        text: `Seu cancelamento foi processado. Você ainda tem acesso até ${dateStr}. Após essa data, suas sessões serão desconectadas.`,
      });
    }

    res.json({
      cancelledAt: result.cancelledAt.toISOString(),
      accessUntil: result.accessUntil.toISOString(),
      refundEligible: result.refundEligible,
      confirmationSent: true,
    });
  } catch (error: any) {
    console.error('[Cancellation] Erro:', error);
    const status = error.message?.includes('não encontrado') || error.message?.includes('já está cancelada') ? 400 : 500;
    res.status(status).json({ error: error.message || 'Erro ao processar cancelamento' });
  }
});
