import { describe, it, expect, vi } from 'vitest';
import { checkUserSession, type ConnectionMonitorDeps } from './connection-monitor.cron.js';
import type { MessagingPort } from '../evolution/evolution.port.js';

/**
 * Regressão de 2026-11-02: uma sessão órfã de teste (`instance_name = test-e2e`,
 * instância que nunca existiu na Evolution) fazia o cron logar o AxiosError
 * inteiro (~10 KB) a cada 5 minutos, para sempre, e a sessão continuava "ativa".
 */
function buildDeps(getStatus: () => Promise<any>) {
  const sessionRepo = {
    markDisconnected: vi.fn().mockResolvedValue(undefined),
    listActiveSessions: vi.fn().mockResolvedValue([]),
  };
  const userRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'u1', phone: '5548999999999', name: 'Fernanda' }),
  };
  const sendText = vi.fn().mockResolvedValue(undefined);

  const deps = {
    messaging: { getStatus, sendText } as unknown as MessagingPort,
    logger: { child: () => log } as any,
    instanceName: 'secretary',
    adminPhone: '5548999999999',
    sessionRepo: sessionRepo as any,
    userRepo: userRepo as any,
  } as ConnectionMonitorDeps;

  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  return { deps, log, sessionRepo, userRepo, sendText };
}

const SESSION = { user_id: 'u1', instance_name: 'test-e2e' };

describe('connection monitor — sessão cuja instância não existe na Evolution', () => {
  it('marca a sessão como desconectada e loga em warn (404), sem logar erro', async () => {
    const { deps, log, sessionRepo, sendText } = buildDeps(async () => {
      throw Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404, data: { error: 'Not Found' } },
      });
    });

    await checkUserSession(deps, log, SESSION);

    expect(sessionRepo.markDisconnected).toHaveBeenCalledWith('test-e2e');
    expect(log.warn).toHaveBeenCalledWith(
      { instance: 'test-e2e', status: 404 },
      'instância não existe na Evolution — sessão marcada como desconectada',
    );
    expect(log.error).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it('erro de rede (sem resposta HTTP) continua logado como erro, mas só com a instância', async () => {
    const { deps, log, sessionRepo } = buildDeps(async () => {
      throw new Error('connect ECONNREFUSED');
    });

    await checkUserSession(deps, log, SESSION);

    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error), instance: 'test-e2e' },
      'erro ao verificar sessão de usuário',
    );
    expect(sessionRepo.markDisconnected).not.toHaveBeenCalled();
  });

  it('5xx é logado com o status e sem marcar a sessão como desconectada', async () => {
    const { deps, log, sessionRepo } = buildDeps(async () => {
      throw Object.assign(new Error('bad gateway'), { response: { status: 502 } });
    });

    await checkUserSession(deps, log, SESSION);

    expect(log.error).toHaveBeenCalledWith(
      { instance: 'test-e2e', status: 502 },
      'erro ao verificar sessão de usuário',
    );
    expect(sessionRepo.markDisconnected).not.toHaveBeenCalled();
  });

  it('sessão conectada não gera log nem notificação', async () => {
    const { deps, log, sessionRepo, sendText } = buildDeps(async () => 'open');

    await checkUserSession(deps, log, SESSION);

    expect(sessionRepo.markDisconnected).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });
});
