import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { userInstanceName } from '../../shared/config/instance-name.js';

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
// Requirements: 2.4, 3.1, 6.1, 6.3, 7.2
activationRouter.get('/qrcode/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;

    const activationCode = await container.activationRepo.findCodeByValue(code);
    if (!activationCode) {
      res.status(404).json({ error: 'Código inválido ou expirado' });
      return;
    }

    // Código já usado: gerar QR criaria uma instância órfã e confundiria o usuário
    if (activationCode.used) {
      res.status(400).json({ error: 'Este código de ativação já foi utilizado. Acesse a página de conexão.' });
      return;
    }

    // Validar ownership: código deve ter user_id vinculado
    if (!activationCode.user_id) {
      res.status(403).json({ error: 'Código sem vínculo de proprietário' });
      return;
    }

    // Verificar subscription ativa
    const user = await container.userRepo.findById(activationCode.user_id);
    if (!user || user.subscription_status !== 'active') {
      res.status(403).json({ error: 'Assinatura inativa. Renove para conectar.' });
      return;
    }

    // Verificar slots disponíveis
    const canConnect = await container.planService.canAddUser(user.id);
    if (!canConnect) {
      const usage = await container.planService.getCurrentUsage(user.id);
      res.status(403).json({
        error: 'Limite de conexões atingido. Faça upgrade ou desconecte uma conexão existente.',
        used: usage.current,
        total: usage.max,
      });
      return;
    }

    const instanceName = userInstanceName(user.id);

    // A instância pode ainda não existir (primeiro acesso do usuário). Sem
    // criá-la, `connect` falha e o usuário recebe "Falha ao gerar QR Code".
    // Sempre com o webhook configurado, senão a conexão nunca é notificada.
    await container.messaging.ensureInstance({
      name: instanceName,
      webhookUrl: env.WEBHOOK_URL,
      webhookEvents: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    });

    const qr = await container.messaging.getQrCode(instanceName);

    if (!qr) {
      res.status(502).json({ error: 'Falha ao gerar QR Code. Tente novamente.' });
      return;
    }

    res.json({
      qr,
      expiresIn: 45,
      instanceName,
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

// GET /activation/slots/:code - Retorna slots usados/disponíveis para o código
// Requirements: 3.1, 9.1
activationRouter.get('/slots/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;

    const activationCode = await container.activationRepo.findCodeByValue(code);
    if (!activationCode || !activationCode.user_id) {
      res.status(404).json({ error: 'Código inválido' });
      return;
    }

    const slots = await container.planService.getRemainingSlots(activationCode.user_id);
    res.json(slots);
  } catch (error) {
    container.logger.error({ err: error }, '[Activation] Erro ao buscar slots');
    res.status(500).json({ error: 'Erro ao buscar slots' });
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

    // O SSE acompanha a MESMA instância usada para gerar o QR (nome determinístico).
    // Antes usava `activation-<code>` — uma instância paralela que ninguém
    // conectava, então a tela nunca detectava a conexão.
    const codeRecord = await container.activationRepo.findCodeByValue(code);
    if (!codeRecord?.user_id) {
      res.status(404).json({ error: 'Código sem vínculo de proprietário' });
      return;
    }
    const userId = codeRecord.user_id;
    const instanceName = userInstanceName(userId);

    // Configurar SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

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
          // Garante a sessão no banco mesmo se o webhook connection.update
          // atrasar ou falhar — idempotente, então não duplica.
          try {
            await container.sessionRepo.activateSession({ userId, instanceName });
          } catch (err) {
            container.logger.warn({ err, instance: instanceName }, '[Activation] falha ao gravar sessão via SSE');
          }

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
