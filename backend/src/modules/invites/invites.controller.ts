import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';
import { env } from '../../shared/config/env.js';
import { inviteInstanceName } from '../../shared/config/instance-name.js';

export const invitesRouter = Router();

// GET /invites/validate/:token - Valida token de convite
invitesRouter.get('/validate/:token', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const result = await container.inviteService.validateInvite(token);

    if (!result.valid) {
      const statusCode = result.error === 'TOKEN_NOT_FOUND' ? 404
        : result.error === 'TOKEN_EXPIRED' ? 410
        : result.error === 'TOKEN_ALREADY_USED' ? 409
        : 403;

      res.status(statusCode).json({ valid: false, error: result.error });
      return;
    }

    // Retornar info do owner para exibir na UI
    const owner = await container.userRepo.findById(result.invite!.owner_user_id);

    res.json({
      valid: true,
      ownerName: owner?.name || 'Usuário',
      phone: result.invite!.phone,
    });
  } catch (error) {
    container.logger.error({ err: error }, '[Invites] Erro ao validar token');
    res.status(500).json({ error: 'Erro ao validar convite' });
  }
});

// POST /invites/:token/accept - Aceita convite (com dados do onboarding leve)
invitesRouter.post('/:token/accept', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const { name, businessHoursStart, businessHoursEnd, termsAccepted, businessType, targetAudience, toneOfVoice } = req.body;

    if (!name || !termsAccepted) {
      res.status(400).json({ error: 'Nome e aceite dos termos são obrigatórios' });
      return;
    }

    const collaborator = await container.inviteService.acceptInvite(token, {
      name,
      businessHoursStart: businessHoursStart || '08:00',
      businessHoursEnd: businessHoursEnd || '18:00',
      termsAccepted,
      businessType,
      targetAudience,
      toneOfVoice,
    });

    res.json({
      userId: collaborator.id,
      name: collaborator.name,
      message: 'Convite aceito. Escaneie o QR Code para conectar.',
    });
  } catch (error: any) {
    const errorMap: Record<string, { status: number; message: string }> = {
      TERMS_CONSENT_REQUIRED: { status: 400, message: 'Aceite dos termos é obrigatório' },
      TOKEN_NOT_FOUND: { status: 404, message: 'Convite não encontrado' },
      TOKEN_EXPIRED: { status: 410, message: 'Convite expirado. Peça um novo ao proprietário.' },
      TOKEN_ALREADY_USED: { status: 409, message: 'Convite já utilizado' },
      OWNER_SUBSCRIPTION_INACTIVE: { status: 403, message: 'Assinatura do proprietário inativa' },
      NO_SLOTS_AVAILABLE: { status: 403, message: 'Limite de conexões atingido' },
    };

    const mapped = errorMap[error.message];
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message });
      return;
    }

    container.logger.error({ err: error }, '[Invites] Erro ao aceitar convite');
    res.status(500).json({ error: 'Erro ao aceitar convite' });
  }
});

// GET /invites/:token/qrcode - Gera QR Code para colaborador (valida slot)
invitesRouter.get('/:token/qrcode', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;

    const invite = await container.inviteService.validateInvite(token);
    if (!invite.valid || !invite.invite) {
      res.status(403).json({ error: 'Convite inválido ou expirado' });
      return;
    }

    // Verificar slots antes de gerar QR
    const canAdd = await container.planService.canAddUser(invite.invite.owner_user_id);
    if (!canAdd) {
      res.status(403).json({ error: 'Limite de conexões atingido' });
      return;
    }

    const instanceName = inviteInstanceName(token);

    // Instância precisa existir e ter webhook ANTES do connect — senão a
    // conexão do colaborador nunca é notificada e a sessão não é gravada.
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

    res.json({ qr, expiresIn: 45, instanceName });
  } catch (error) {
    container.logger.error({ err: error }, '[Invites] Erro ao gerar QR Code');
    res.status(500).json({ error: 'Erro ao gerar QR Code' });
  }
});

// GET /invites/:token/qrcode/status - SSE para status de conexão do colaborador
invitesRouter.get('/:token/qrcode/status', async (req: Request, res: Response) => {
  try {
    const token = req.params.token as string;
    const instanceName = inviteInstanceName(token);
    const invite = await container.inviteService.findByToken(token);

    if (!invite) {
      res.status(404).json({ error: 'Convite inválido' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    const sendEvent = (event: string, data: Record<string, unknown>) => {
      if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const interval = setInterval(async () => {
      try {
        const status = await container.messaging.getStatus(instanceName);
        sendEvent('status', { status });

        if (status === 'open') {
          // Garante a sessão mesmo se o webhook atrasar (idempotente).
          const collaboratorId = invite.used_by_user_id;
          if (collaboratorId) {
            try {
              await container.sessionRepo.activateSession({ userId: collaboratorId, instanceName });
            } catch (err) {
              container.logger.warn({ err, instance: instanceName }, '[Invites] falha ao gravar sessão via SSE');
            }
          }

          sendEvent('connected', { message: 'Conexão estabelecida com sucesso' });
          clearInterval(interval);
          res.end();
          closed = true;
        }
      } catch {
        sendEvent('error', { message: 'Erro ao verificar status' });
      }
    }, 3000);

    req.on('close', () => {
      closed = true;
      clearInterval(interval);
    });
  } catch (error) {
    container.logger.error({ err: error }, '[Invites] Erro no SSE de status');
    res.status(500).json({ error: 'Erro ao iniciar stream de status' });
  }
});
