import { Router, type Request, type Response } from 'express';
import { container } from '../../container.js';

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
    const { name, businessHoursStart, businessHoursEnd, termsAccepted } = req.body;

    if (!name || !termsAccepted) {
      res.status(400).json({ error: 'Nome e aceite dos termos são obrigatórios' });
      return;
    }

    const collaborator = await container.inviteService.acceptInvite(token, {
      name,
      businessHoursStart: businessHoursStart || '08:00',
      businessHoursEnd: businessHoursEnd || '18:00',
      termsAccepted,
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

    const instanceName = `invite-${token.substring(0, 8)}-${Date.now()}`;
    const qr = await container.messaging.getQrCode(instanceName);

    if (!qr) {
      res.status(502).json({ error: 'Falha ao gerar QR Code. Tente novamente.' });
      return;
    }

    res.json({ qr, expiresIn: 45 });
  } catch (error) {
    container.logger.error({ err: error }, '[Invites] Erro ao gerar QR Code');
    res.status(500).json({ error: 'Erro ao gerar QR Code' });
  }
});
