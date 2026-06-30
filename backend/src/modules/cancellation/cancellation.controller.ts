import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';

export const cancellationRouter = Router();

// POST /api/cancellation/request
cancellationRouter.post('/request', async (req: Request, res: Response) => {
  try {
    const { userId, reason, phone } = req.body;

    if (!userId || !phone) {
      res.status(400).json({ error: 'userId e phone são obrigatórios' });
      return;
    }

    // Validar ownership: o telefone informado deve pertencer ao userId
    const user = await container.userRepo.findById(userId);
    if (!user || user.phone !== phone) {
      res.status(403).json({ error: 'Acesso negado: telefone não corresponde ao usuário' });
      return;
    }

    const result = await container.cancellationService.requestCancellation(userId);

    // Enviar confirmação via WhatsApp (já temos user da validação acima)
    const dateStr = result.accessUntil.toLocaleDateString('pt-BR');
    if (user.phone) {
      await container.messaging.sendText({
        instance: env.MONITOR_INSTANCE,
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
    container.logger.error({ err: error }, '[Cancellation] Erro');
    const isUserError = error.message?.includes('não encontrado') || error.message?.includes('já está cancelada');
    res.status(isUserError ? 400 : 500).json({
      error: isUserError ? error.message : 'Erro ao processar cancelamento. Tente novamente.',
    });
  }
});
