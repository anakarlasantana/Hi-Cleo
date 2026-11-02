import { describe, it, expect, vi, beforeEach } from 'vitest';

const { messaging, inviteService, sessionRepo, logger, planService } = vi.hoisted(() => ({
  messaging: {
    ensureInstance: vi.fn(),
    getQrCode: vi.fn(),
    getStatus: vi.fn(),
  },
  inviteService: {
    validateInvite: vi.fn(),
    acceptInvite: vi.fn(),
    findByToken: vi.fn(),
  },
  sessionRepo: { activateSession: vi.fn() },
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  planService: { canAddUser: vi.fn() },
}));

vi.mock('../../container.js', () => ({
  container: {
    logger,
    messaging,
    inviteService,
    sessionRepo,
    planService,
    userRepo: { findById: vi.fn() },
  },
}));

vi.mock('../../shared/config/env.js', () => ({
  env: {
    MONITOR_INSTANCE: 'secretary',
    WEBHOOK_URL: 'http://backend:3001/webhooks/evolution',
  },
}));

import { invitesRouter } from './invites.controller.js';

function getRouteHandler(method: string, path: string) {
  const layer = (invitesRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  return layer?.route?.stack[0]?.handle;
}

function createMockRes() {
  const res: any = { _status: 200, _json: null, _headers: {}, _written: [] };
  res.status = vi.fn((code: number) => { res._status = code; return res; });
  res.json = vi.fn((data: any) => { res._json = data; return res; });
  res.setHeader = vi.fn((key: string, value: string) => { res._headers[key] = value; return res; });
  res.flushHeaders = vi.fn();
  res.write = vi.fn((chunk: string) => { res._written.push(chunk); return true; });
  res.end = vi.fn();
  return res;
}

function createMockReq(params: Record<string, string> = {}) {
  return { params, on: vi.fn(), body: {} } as any;
}

const validInvite = {
  id: 'inv-1',
  owner_user_id: 'owner-1',
  phone: '5511988887777',
  token: 'token-abc',
  status: 'pending',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  used_by_user_id: null,
};

describe('Invites Controller — QR Code do colaborador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planService.canAddUser.mockResolvedValue(true);
  });

  describe('GET /:token/qrcode', () => {
    const handler = getRouteHandler('get', '/:token/qrcode');

    it('returns 403 for an invalid invite', async () => {
      inviteService.validateInvite.mockResolvedValue({ valid: false, invite: null, error: 'TOKEN_NOT_FOUND' });

      const res = createMockRes();
      await handler(createMockReq({ token: 'token-abc' }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(messaging.getQrCode).not.toHaveBeenCalled();
    });

    it('creates the instance before requesting the QR code', async () => {
      inviteService.validateInvite.mockResolvedValue({ valid: true, invite: validInvite });
      messaging.getQrCode.mockResolvedValue('qr-base64');

      const res = createMockRes();
      await handler(createMockReq({ token: 'token-abc' }), res);

      expect(messaging.ensureInstance).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'invite-token-abc' }),
      );
      const ensureOrder = messaging.ensureInstance.mock.invocationCallOrder[0];
      const connectOrder = messaging.getQrCode.mock.invocationCallOrder[0];
      expect(ensureOrder).toBeLessThan(connectOrder);
    });

    // Regressão: o nome tinha timestamp (invite-<x>-<Date.now()>), então o SSE
    // e o webhook nunca encontravam a instância conectada.
    it('uses a deterministic instance name and returns it', async () => {
      inviteService.validateInvite.mockResolvedValue({ valid: true, invite: validInvite });
      messaging.getQrCode.mockResolvedValue('qr-base64');

      const res = createMockRes();
      await handler(createMockReq({ token: 'token-abc' }), res);

      expect(res._json).toEqual({ qr: 'qr-base64', expiresIn: 45, instanceName: 'invite-token-abc' });
    });

    it('returns 502 when the QR code is empty', async () => {
      inviteService.validateInvite.mockResolvedValue({ valid: true, invite: validInvite });
      messaging.getQrCode.mockResolvedValue('');

      const res = createMockRes();
      await handler(createMockReq({ token: 'token-abc' }), res);

      expect(res.status).toHaveBeenCalledWith(502);
    });
  });

  describe('GET /:token/qrcode/status (SSE)', () => {
    const handler = getRouteHandler('get', '/:token/qrcode/status');

    it('returns 404 for an unknown invite', async () => {
      inviteService.findByToken.mockResolvedValue(null);

      const res = createMockRes();
      await handler(createMockReq({ token: 'nope' }), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('streams the connection status of the invite instance', async () => {
      vi.useFakeTimers();
      inviteService.findByToken.mockResolvedValue({ ...validInvite, status: 'accepted', used_by_user_id: 'collab-1' });
      messaging.getStatus.mockResolvedValue('connecting');

      const res = createMockRes();
      await handler(createMockReq({ token: 'token-abc' }), res);
      await vi.advanceTimersByTimeAsync(3000);

      expect(messaging.getStatus).toHaveBeenCalledWith('invite-token-abc');
      expect(res._written.join('')).toContain('event: status');

      vi.useRealTimers();
    });

    it('persists the collaborator session when the connection opens', async () => {
      vi.useFakeTimers();
      inviteService.findByToken.mockResolvedValue({ ...validInvite, status: 'accepted', used_by_user_id: 'collab-1' });
      messaging.getStatus.mockResolvedValue('open');

      const res = createMockRes();
      await handler(createMockReq({ token: 'token-abc' }), res);
      await vi.advanceTimersByTimeAsync(3000);

      expect(sessionRepo.activateSession).toHaveBeenCalledWith({
        userId: 'collab-1',
        instanceName: 'invite-token-abc',
      });
      expect(res._written.join('')).toContain('event: connected');
      expect(res.end).toHaveBeenCalled();

      vi.useRealTimers();
    });
  });
});
