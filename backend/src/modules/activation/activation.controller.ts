import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';

export const activationRouter = Router();

activationRouter.post('/generate', async (req: Request, res: Response) => {
  try {
    // Rota interna — validar que a chamada vem do próprio backend (webhook de pagamento)
    const internalSecret = req.headers['x-internal-secret'] as string;
    if (internalSecret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

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
    container.logger.error({ err: error }, '[Activation] Erro ao gerar código');
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

// GET /activation/status/:code - Verifica se o código já foi ativado (usado)
activationRouter.get('/status/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const activationCode = await container.activationService.validateCode(code);

    if (activationCode) {
      // Code exists and is valid (not used yet)
      res.json({ status: 'pending', used: false });
    } else {
      // Code was used or expired — assume activated if not found as valid
      res.json({ status: 'activated', used: true });
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar status' });
  }
});

// GET /activation/qrcode/:code - Gera QR Code para conexão WhatsApp
// Requirements: 6.1, 6.3
activationRouter.get('/qrcode/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;

    const validCode = await container.activationService.validateCode(code);
    if (!validCode) {
      res.status(404).json({ error: 'Código inválido ou expirado' });
      return;
    }

    const instanceName = `activation-${code}`;
    const qr = await container.messaging.getQrCode(instanceName);

    if (!qr) {
      res.status(502).json({ error: 'Falha ao gerar QR Code. Tente novamente.' });
      return;
    }

    res.json({
      qr,
      expiresIn: 45, // QR Code expira em ~45 segundos
    });
  } catch (error) {
    container.logger.error({ err: error }, '[Activation] Erro ao gerar QR Code');
    res.status(500).json({ error: 'Erro ao gerar QR Code' });
  }
});

// POST /activation/consent - Record LGPD terms acceptance
activationRouter.post('/consent', async (req: Request, res: Response) => {
  try {
    const { code, termsVersion } = req.body;
    if (!code || !termsVersion) {
      res.status(400).json({ error: 'code and termsVersion are required' });
      return;
    }
    res.json({ accepted: true, termsVersion });
  } catch (error) {
    res.status(500).json({ error: 'Error recording consent' });
  }
});

// GET /activation/plans - Return available plans from database
activationRouter.get('/plans', async (_req: Request, res: Response) => {
  try {
    const planLimits = await container.planRepo.getAllPlanLimits();

    const plans = planLimits.map((p) => ({
      name: p.plan_name,
      displayName: p.display_name,
      description: p.description,
      maxUsers: p.max_users,
      priceMonthly: p.price_monthly,
      priceYearly: Number((p.price_yearly_total / 12).toFixed(2)),
      yearlyTotal: p.price_yearly_total,
      features: p.features,
      highlighted: p.highlighted,
    }));

    res.json({ plans });
  } catch (error) {
    container.logger.error({ err: error }, '[Activation] Erro ao buscar planos');
    res.status(500).json({ error: 'Erro ao buscar planos' });
  }
});

// GET /activation/qrcode/:code/status - SSE para status de conexão em tempo real
// Requirements: 6.3, 6.4
activationRouter.get('/qrcode/:code/status', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;

    const validCode = await container.activationService.validateCode(code);
    if (!validCode) {
      res.status(404).json({ error: 'Código inválido ou expirado' });
      return;
    }

    // Configurar SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const instanceName = `activation-${code}`;
    let closed = false;

    const sendEvent = (event: string, data: Record<string, unknown>) => {
      if (!closed) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    // Polling do status de conexão
    const interval = setInterval(async () => {
      try {
        const status = await container.messaging.getStatus(instanceName);

        sendEvent('status', { status });

        if (status === 'open') {
          sendEvent('connected', { message: 'Conexão estabelecida com sucesso' });
          clearInterval(interval);
          res.end();
          closed = true;
        }
      } catch (error) {
        sendEvent('error', { message: 'Erro ao verificar status' });
      }
    }, 3000);

    // Cleanup quando o cliente desconecta
    req.on('close', () => {
      closed = true;
      clearInterval(interval);
    });
  } catch (error) {
    container.logger.error({ err: error }, '[Activation] Erro SSE');
    res.status(500).json({ error: 'Erro ao iniciar stream de status' });
  }
});
