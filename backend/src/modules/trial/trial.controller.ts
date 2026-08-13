import { Router } from 'express';
import { z } from 'zod';
import { container } from '../../container.js';

const router = Router();

const startTrialSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(255),
  phone: z.string().min(10, 'Telefone inválido').max(20),
});

/**
 * POST /api/trial/start
 * Inicia um trial de 7 dias. Campos mínimos: nome + telefone.
 * Anti-abuso: 5 camadas automáticas (phone cooldown, IP rate limit, validação BR, device, delay).
 */
router.post('/start', async (req, res) => {
  try {
    const parsed = startTrialSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: parsed.error.issues.map(i => i.message),
      });
    }

    const { name, phone } = parsed.data;

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || undefined;

    const userAgent = req.headers['user-agent'] || undefined;

    const result = await container.trialService.startTrial({
      name,
      phone,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      const statusCode = result.blockedReason === 'rate_limit_ip' ? 429 : 409;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(201).json({
      activationCode: result.activationCode,
      message: 'Trial iniciado! Envie o código para a Cleo no WhatsApp.',
    });
  } catch (error: any) {
    console.error('[Trial] Erro ao iniciar trial:', error.message);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
});

export default router;
