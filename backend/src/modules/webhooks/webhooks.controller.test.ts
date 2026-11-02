import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const { sessionRepo, userRepo, inviteService } = vi.hoisted(() => ({
  sessionRepo: {
    activateSession: vi.fn(),
    markDisconnected: vi.fn(),
    findByInstance: vi.fn(),
    findByUserId: vi.fn(),
    listActiveSessions: vi.fn(),
  },
  userRepo: { findById: vi.fn() },
  inviteService: { validateInvite: vi.fn() },
}));

vi.mock('../../container.js', () => ({
  container: {
    logger: {
      child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    sessionRepo,
    userRepo,
    inviteService,
    queueService: { enqueue: vi.fn().mockResolvedValue({ enqueued: true }) },
    messageProcessor: vi.fn(),
  },
}));

vi.mock('../../shared/config/env.js', () => ({
  env: {
    MONITOR_INSTANCE: 'secretary',
    WEBHOOK_URL: 'http://backend:3001/webhooks/evolution',
    EVOLUTION_WEBHOOK_SECRET: undefined,
  },
}));

import { webhookRouter } from './webhooks.controller.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function getRouteHandler(method: string, path: string) {
  const layer = (webhookRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  return layer?.route?.stack[0]?.handle;
}

function createMockRes() {
  const res: any = { _status: 200, _json: null };
  res.status = vi.fn((code: number) => { res._status = code; return res; });
  res.json = vi.fn((data: any) => { res._json = data; return res; });
  return res as Partial<Response> & { _status: number; _json: any };
}

function createWebhookReq(body: Record<string, unknown>) {
  return { body, headers: {}, ip: '172.18.0.5', socket: {} } as any;
}

const handler = getRouteHandler('post', '/');

// ─── Testes ────────────────────────────────────────────────────────────────

describe('Webhook Evolution — connection.update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists the session when state is open (user instance)', async () => {
    userRepo.findById.mockResolvedValue({ id: 'user-123', phone: '5511999998888' });

    const res = createMockRes();
    await handler(createWebhookReq({
      event: 'connection.update',
      instance: 'user-user-123',
      data: { state: 'open' },
    }), res);

    expect(userRepo.findById).toHaveBeenCalledWith('user-123');
    expect(sessionRepo.activateSession).toHaveBeenCalledWith({
      userId: 'user-123',
      instanceName: 'user-user-123',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('accepts state on the root of the payload', async () => {
    userRepo.findById.mockResolvedValue({ id: 'user-123', phone: '5511999998888' });

    await handler(createWebhookReq({
      event: 'connection.update',
      instance: 'user-user-123',
      state: 'open',
    }), createMockRes());

    expect(sessionRepo.activateSession).toHaveBeenCalled();
  });

  it('marks the session as disconnected when state is close', async () => {
    await handler(createWebhookReq({
      event: 'connection.update',
      instance: 'user-user-123',
      data: { state: 'close' },
    }), createMockRes());

    expect(sessionRepo.markDisconnected).toHaveBeenCalledWith('user-user-123');
    expect(sessionRepo.activateSession).not.toHaveBeenCalled();
  });

  it('does not persist anything while connecting', async () => {
    await handler(createWebhookReq({
      event: 'connection.update',
      instance: 'user-user-123',
      data: { state: 'connecting' },
    }), createMockRes());

    expect(sessionRepo.activateSession).not.toHaveBeenCalled();
    expect(sessionRepo.markDisconnected).not.toHaveBeenCalled();
  });

  it('ignores the secretary instance (not a user session)', async () => {
    await handler(createWebhookReq({
      event: 'connection.update',
      instance: 'secretary',
      data: { state: 'open' },
    }), createMockRes());

    expect(sessionRepo.activateSession).not.toHaveBeenCalled();
  });

  it('does not persist when the user does not exist', async () => {
    userRepo.findById.mockResolvedValue(null);

    await handler(createWebhookReq({
      event: 'connection.update',
      instance: 'user-inexistente',
      data: { state: 'open' },
    }), createMockRes());

    expect(sessionRepo.activateSession).not.toHaveBeenCalled();
  });

  it('resolves the collaborator from an invite instance', async () => {
    inviteService.validateInvite.mockResolvedValue({
      valid: false,
      invite: { token: 'abc123', used_by_user_id: 'collab-1' },
    });
    userRepo.findById.mockResolvedValue({ id: 'collab-1' });

    await handler(createWebhookReq({
      event: 'connection.update',
      instance: 'invite-abc123',
      data: { state: 'open' },
    }), createMockRes());

    expect(sessionRepo.activateSession).toHaveBeenCalledWith({
      userId: 'collab-1',
      instanceName: 'invite-abc123',
    });
  });

  it('responds 200 and does not throw when persisting fails', async () => {
    userRepo.findById.mockResolvedValue({ id: 'user-123' });
    sessionRepo.activateSession.mockRejectedValue(new Error('db down'));

    const res = createMockRes();
    await expect(handler(createWebhookReq({
      event: 'connection.update',
      instance: 'user-user-123',
      data: { state: 'open' },
    }), res)).resolves.not.toThrow();

    // MP/Evolution não pode receber erro — senão entra em retry infinito
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
