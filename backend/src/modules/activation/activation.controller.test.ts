import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock the container
vi.mock('../../container.js', () => ({
  container: {
    activationService: {
      validateCode: vi.fn(),
    },
    activationRepo: {
      findCodeByValue: vi.fn(),
    },
    userRepo: {
      findById: vi.fn(),
    },
    planService: {
      canAddUser: vi.fn(),
      getCurrentUsage: vi.fn(),
    },
    sessionRepo: {
      activateSession: vi.fn(),
    },
    messaging: {
      getQrCode: vi.fn(),
      getStatus: vi.fn(),
      ensureInstance: vi.fn(),
    },
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    },
  },
}));

import { container } from '../../container.js';

// Import the router to get the route handlers
import { activationRouter } from './activation.controller.js';

// Helper to extract route handler from Express router
function getRouteHandler(method: string, path: string) {
  const layer = (activationRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  return layer?.route?.stack[0]?.handle;
}

function createMockReq(params: Record<string, string> = {}): Partial<Request> {
  return {
    params,
    on: vi.fn(),
  } as any;
}

function createMockRes(): Partial<Response> & { _status: number; _json: any; _headers: Record<string, string>; _written: string[] } {
  const res: any = {
    _status: 200,
    _json: null,
    _headers: {},
    _written: [],
  };
  res.status = vi.fn((code: number) => { res._status = code; return res; });
  res.json = vi.fn((data: any) => { res._json = data; return res; });
  res.setHeader = vi.fn((key: string, value: string) => { res._headers[key] = value; return res; });
  res.flushHeaders = vi.fn();
  res.write = vi.fn((data: string) => { res._written.push(data); return true; });
  res.end = vi.fn();
  return res;
}

describe('Activation Controller - QR Code Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /qrcode/:code', () => {
    const handler = getRouteHandler('get', '/qrcode/:code');

    it('should return 404 for invalid activation code', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue(null);
      const req = createMockReq({ code: 'INVALID-CODE' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Código inválido ou expirado' });
    });

    it('should return QR code for valid activation code', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.userRepo.findById).mockResolvedValue({
        id: 'user-123', subscription_status: 'active',
      } as any);
      vi.mocked(container.planService.canAddUser).mockResolvedValue(true);
      vi.mocked(container.messaging.getQrCode).mockResolvedValue('base64-qr-data');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        qr: 'base64-qr-data',
        expiresIn: 45,
        instanceName: 'user-user-123',
      }));
    });

    // Regressão: a instância precisa ser determinística. Com timestamp no nome
    // (user-<id>-<Date.now()>), o SSE e o webhook nunca encontravam a instância
    // e a Cleo não respondia a nenhum cliente.
    it('should use a deterministic instance name (no timestamp)', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.userRepo.findById).mockResolvedValue({
        id: 'user-123', subscription_status: 'active',
      } as any);
      vi.mocked(container.planService.canAddUser).mockResolvedValue(true);
      vi.mocked(container.messaging.getQrCode).mockResolvedValue('base64-qr-data');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);
      await handler(createMockReq({ code: 'ATIVAR-TEST' }), createMockRes());

      const calls = vi.mocked(container.messaging.getQrCode).mock.calls;
      expect(calls[0][0]).toBe('user-user-123');
      expect(calls[1][0]).toBe(calls[0][0]);
    });

    it('should ensure the instance exists before requesting the QR code', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.userRepo.findById).mockResolvedValue({
        id: 'user-123', subscription_status: 'active',
      } as any);
      vi.mocked(container.planService.canAddUser).mockResolvedValue(true);
      vi.mocked(container.messaging.getQrCode).mockResolvedValue('base64-qr-data');

      await handler(createMockReq({ code: 'ATIVAR-TEST' }), createMockRes());

      expect(container.messaging.ensureInstance).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'user-user-123' }),
      );
      // ensureInstance precisa rodar ANTES do connect
      const ensureOrder = vi.mocked(container.messaging.ensureInstance).mock.invocationCallOrder[0];
      const connectOrder = vi.mocked(container.messaging.getQrCode).mock.invocationCallOrder[0];
      expect(ensureOrder).toBeLessThan(connectOrder);
    });

    it('should reject an already used activation code', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: true, user_id: 'user-123',
      } as any);

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(container.messaging.getQrCode).not.toHaveBeenCalled();
    });

    it('should return 502 when QR code generation returns empty', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.userRepo.findById).mockResolvedValue({
        id: 'user-123', subscription_status: 'active',
      } as any);
      vi.mocked(container.planService.canAddUser).mockResolvedValue(true);
      vi.mocked(container.messaging.getQrCode).mockResolvedValue('');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({ error: 'Falha ao gerar QR Code. Tente novamente.' });
    });

    it('should return 403 when subscription is inactive', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.userRepo.findById).mockResolvedValue({
        id: 'user-123', subscription_status: 'expired',
      } as any);

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Assinatura inativa. Renove para conectar.' });
    });

    it('should return 403 when no slots available', async () => {
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-ABCD', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.userRepo.findById).mockResolvedValue({
        id: 'user-123', subscription_status: 'active',
      } as any);
      vi.mocked(container.planService.canAddUser).mockResolvedValue(false);
      vi.mocked(container.planService.getCurrentUsage).mockResolvedValue({ current: 1, max: 1 });

      const req = createMockReq({ code: 'ATIVAR-ABCD' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._json).toMatchObject({ used: 1, total: 1 });
    });
  });

  describe('GET /qrcode/:code/status', () => {
    const handler = getRouteHandler('get', '/qrcode/:code/status');

    it('should return 404 for invalid activation code', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue(null);
      const req = createMockReq({ code: 'INVALID-CODE' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Código inválido ou expirado' });
    });

    it('should set SSE headers for valid code', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.messaging.getStatus).mockResolvedValue('connecting');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('should poll the same instance used to generate the QR code', async () => {
      vi.useFakeTimers();

      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.messaging.getStatus).mockResolvedValue('connecting');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      // Advance timer to trigger first poll
      await vi.advanceTimersByTimeAsync(3000);

      // Mesmo nome determinístico usado no GET /qrcode/:code
      expect(container.messaging.getStatus).toHaveBeenCalledWith('user-user-123');
      expect(res._written.length).toBeGreaterThan(0);
      expect(res._written[0]).toContain('event: status');
      expect(res._written[0]).toContain('"status":"connecting"');

      vi.useRealTimers();
    });

    it('should send connected event and close when status is open', async () => {
      vi.useFakeTimers();

      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.messaging.getStatus).mockResolvedValue('open');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      // Advance timer to trigger poll
      await vi.advanceTimersByTimeAsync(3000);

      const allWritten = res._written.join('');
      expect(allWritten).toContain('event: status');
      expect(allWritten).toContain('"status":"open"');
      expect(allWritten).toContain('event: connected');
      expect(allWritten).toContain('Conexão estabelecida com sucesso');
      expect(res.end).toHaveBeenCalled();

      vi.useRealTimers();
    });

    // Sem gravar a sessão, findByInstance retorna null e a Cleo não responde.
    it('should persist the whatsapp session when the connection opens', async () => {
      vi.useFakeTimers();

      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.messaging.getStatus).mockResolvedValue('open');

      await handler(createMockReq({ code: 'ATIVAR-TEST' }), createMockRes());
      await vi.advanceTimersByTimeAsync(3000);

      expect(container.sessionRepo.activateSession).toHaveBeenCalledWith({
        userId: 'user-123',
        instanceName: 'user-user-123',
      });

      vi.useRealTimers();
    });

    it('should still report connected when persisting the session fails', async () => {
      vi.useFakeTimers();

      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.messaging.getStatus).mockResolvedValue('open');
      vi.mocked(container.sessionRepo.activateSession).mockRejectedValueOnce(new Error('db down'));

      const res = createMockRes();
      await handler(createMockReq({ code: 'ATIVAR-TEST' }), res);
      await vi.advanceTimersByTimeAsync(3000);

      expect(res._written.join('')).toContain('event: connected');
      expect(res.end).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should cleanup interval when client disconnects', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);
      vi.mocked(container.activationRepo.findCodeByValue).mockResolvedValue({
        code: 'ATIVAR-TEST', plan: 'solo', used: false, user_id: 'user-123',
      } as any);

      let closeHandler: (() => void) | undefined;
      const req = {
        params: { code: 'ATIVAR-TEST' },
        on: vi.fn((event: string, handler: () => void) => {
          if (event === 'close') closeHandler = handler;
        }),
      } as any;
      const res = createMockRes();

      await handler(req, res);

      // Simulate client disconnect
      expect(closeHandler).toBeDefined();
      closeHandler!();

      // After disconnect, writes should not happen
      expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });
});
