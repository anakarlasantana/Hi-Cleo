import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// Mock the container
vi.mock('../../container.js', () => ({
  container: {
    activationService: {
      validateCode: vi.fn(),
    },
    messaging: {
      getQrCode: vi.fn(),
      getStatus: vi.fn(),
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
      vi.mocked(container.activationService.validateCode).mockResolvedValue(null);
      const req = createMockReq({ code: 'INVALID-CODE' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Código inválido ou expirado' });
    });

    it('should return QR code for valid activation code', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST',
        plan: 'solo',
        used: false,
      } as any);
      vi.mocked(container.messaging.getQrCode).mockResolvedValue('base64-qr-data');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        qr: 'base64-qr-data',
        expiresIn: 45,
      });
    });

    it('should return 502 when QR code generation returns empty', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST',
        plan: 'solo',
        used: false,
      } as any);
      vi.mocked(container.messaging.getQrCode).mockResolvedValue('');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith({ error: 'Falha ao gerar QR Code. Tente novamente.' });
    });

    it('should return 500 when Evolution API throws', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST',
        plan: 'solo',
        used: false,
      } as any);
      vi.mocked(container.messaging.getQrCode).mockRejectedValue(new Error('API down'));

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Erro ao gerar QR Code' });
    });

    it('should use instance name based on activation code', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-ABCD',
        plan: 'equipe',
        used: false,
      } as any);
      vi.mocked(container.messaging.getQrCode).mockResolvedValue('qr-data');

      const req = createMockReq({ code: 'ATIVAR-ABCD' });
      const res = createMockRes();

      await handler(req, res);

      expect(container.messaging.getQrCode).toHaveBeenCalledWith('activation-ATIVAR-ABCD');
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
        code: 'ATIVAR-TEST',
        plan: 'solo',
        used: false,
      } as any);
      vi.mocked(container.messaging.getStatus).mockResolvedValue('connecting');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      // Don't await — the handler sets up an interval and doesn't resolve immediately
      // We just need to verify headers are set
      await handler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled();
    });

    it('should poll status and send events', async () => {
      vi.useFakeTimers();

      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST',
        plan: 'solo',
        used: false,
      } as any);
      vi.mocked(container.messaging.getStatus).mockResolvedValue('connecting');

      const req = createMockReq({ code: 'ATIVAR-TEST' });
      const res = createMockRes();

      await handler(req, res);

      // Advance timer to trigger first poll
      await vi.advanceTimersByTimeAsync(3000);

      expect(container.messaging.getStatus).toHaveBeenCalledWith('activation-ATIVAR-TEST');
      expect(res._written.length).toBeGreaterThan(0);
      expect(res._written[0]).toContain('event: status');
      expect(res._written[0]).toContain('"status":"connecting"');

      vi.useRealTimers();
    });

    it('should send connected event and close when status is open', async () => {
      vi.useFakeTimers();

      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST',
        plan: 'solo',
        used: false,
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

    it('should cleanup interval when client disconnects', async () => {
      vi.mocked(container.activationService.validateCode).mockResolvedValue({
        code: 'ATIVAR-TEST',
        plan: 'solo',
        used: false,
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
