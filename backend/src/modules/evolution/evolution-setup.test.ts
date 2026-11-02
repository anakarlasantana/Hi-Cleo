import { describe, it, expect, vi } from 'vitest';
import { ensureEvolutionInstance } from './evolution-setup.js';
import type { MessagingPort } from './evolution.port.js';

function logger() {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => log };
  return log as any;
}

function deps(messaging: Partial<MessagingPort>) {
  return {
    messaging: {
      getStatus: vi.fn().mockResolvedValue('close'),
      createInstance: vi.fn().mockResolvedValue({ qrCode: '' }),
      setWebhook: vi.fn().mockResolvedValue(undefined),
      ...messaging,
    } as unknown as MessagingPort,
    logger: logger(),
    instanceName: 'secretary',
    webhookUrl: 'http://backend:3001/webhooks/evolution',
  };
}

/**
 * Regressão do bug de infraestrutura (2026-11-02): a instância já existia com o
 * webhook antigo (`https://api.hicleo.com.br/webhooks/evolution`) e trocar
 * `WEBHOOK_URL` no ambiente não tinha efeito — a Evolution entrava em loop de
 * retry com `getaddrinfo ENOTFOUND`. O setup agora re-sincroniza sempre.
 */
describe('ensureEvolutionInstance — webhook em sincronia com o ambiente', () => {
  it('re-sincroniza o webhook quando a instância já existe', async () => {
    const d = deps({ getStatus: vi.fn().mockResolvedValue('open') });

    await ensureEvolutionInstance(d);

    expect(d.messaging.setWebhook).toHaveBeenCalledWith('secretary', {
      url: 'http://backend:3001/webhooks/evolution',
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    });
    expect(d.messaging.createInstance).not.toHaveBeenCalled();
  });

  it('cria a instância com webhook quando ela ainda não existe', async () => {
    const d = deps({
      getStatus: vi.fn().mockRejectedValue(Object.assign(new Error('not found'), { response: { status: 404 } })),
    });

    await ensureEvolutionInstance(d);

    expect(d.messaging.createInstance).toHaveBeenCalledWith({
      name: 'secretary',
      webhookUrl: 'http://backend:3001/webhooks/evolution',
      webhookEvents: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
    });
  });

  it('falha ao re-sincronizar o webhook não derruba o startup', async () => {
    const d = deps({
      getStatus: vi.fn().mockResolvedValue('open'),
      setWebhook: vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } })),
    });

    await expect(ensureEvolutionInstance(d)).resolves.toBeUndefined();
    expect(d.logger.warn).toHaveBeenCalled();
  });
});
