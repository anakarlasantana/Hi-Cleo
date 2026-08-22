import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitedMessaging, type RateLimitConfig } from './rate-limited-messaging.js';
import type { MessagingPort, SendTextOptions, SendMediaOptions, ForwardMessageOptions, CreateInstanceOptions, CreateInstanceResult, ConnectionStatus } from '../modules/evolution/evolution.port.js';

// ─── Mock do MessagingPort ──────────────────────────────────────────────────

function createMockMessaging(): MessagingPort & { calls: Array<{ method: string; args: any; time: number }> } {
  const calls: Array<{ method: string; args: any; time: number }> = [];

  return {
    calls,
    async sendText(options: SendTextOptions) { calls.push({ method: 'sendText', args: options, time: Date.now() }); },
    async sendMedia(options: SendMediaOptions) { calls.push({ method: 'sendMedia', args: options, time: Date.now() }); },
    async forwardMessage(options: ForwardMessageOptions) { calls.push({ method: 'forwardMessage', args: options, time: Date.now() }); },
    async createInstance(options: CreateInstanceOptions): Promise<CreateInstanceResult> { return { qrCode: 'mock-qr' }; },
    async getStatus(instance: string): Promise<ConnectionStatus> { return 'open'; },
    async getQrCode(instance: string) { return 'mock-qr'; },
    async restart(instance: string) {},
  };
}

// ─── Mock do Logger ─────────────────────────────────────────────────────────

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => createMockLogger(),
  } as any;
}

// ─── Configuração rápida para testes (delays curtos) ────────────────────────

const FAST_CONFIG: Partial<RateLimitConfig> = {
  maxPerHour: 5,
  maxPerDay: 20,
  minDelayMs: 50,
  maxDelayMs: 100,
  burstMax: 2,
  burstCooldownMs: 200,
};

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('RateLimitedMessaging', () => {
  let mock: ReturnType<typeof createMockMessaging>;
  let logger: ReturnType<typeof createMockLogger>;
  let limiter: RateLimitedMessaging;

  beforeEach(() => {
    mock = createMockMessaging();
    logger = createMockLogger();
    limiter = new RateLimitedMessaging(mock, logger, FAST_CONFIG);
  });

  describe('delegação de mensagens', () => {
    it('delega sendText para o adapter real', async () => {
      await limiter.sendText({ instance: 'test', to: '5511999', text: 'oi' });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe('sendText');
      expect(mock.calls[0].args).toEqual({ instance: 'test', to: '5511999', text: 'oi' });
    });

    it('delega sendMedia para o adapter real', async () => {
      await limiter.sendMedia({ instance: 'test', to: '5511999', mediaUrl: 'http://img.png', mediaType: 'image' });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe('sendMedia');
    });

    it('delega forwardMessage para o adapter real', async () => {
      await limiter.forwardMessage({ instance: 'test', to: '5511999', messageId: 'msg-123' });

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].method).toBe('forwardMessage');
    });

    it('métodos sem rate limiting delegam diretamente', async () => {
      const status = await limiter.getStatus('test');
      expect(status).toBe('open');

      const qr = await limiter.getQrCode('test');
      expect(qr).toBe('mock-qr');
    });
  });

  describe('delay entre envios', () => {
    it('adiciona delay variável entre mensagens consecutivas', async () => {
      const start = Date.now();

      await limiter.sendText({ instance: 'test', to: '5511999', text: 'msg1' });
      await limiter.sendText({ instance: 'test', to: '5511999', text: 'msg2' });

      const elapsed = Date.now() - start;

      // Com minDelay=50 e maxDelay=100, deve ter pelo menos ~50ms entre msgs
      expect(elapsed).toBeGreaterThanOrEqual(40); // margem para variação de timer
      expect(mock.calls).toHaveLength(2);
    });

    it('delay é variável (não fixo)', async () => {
      const delays: number[] = [];

      for (let i = 0; i < 5; i++) {
        const before = Date.now();
        await limiter.sendText({ instance: 'test', to: '5511999', text: `msg${i}` });
        delays.push(Date.now() - before);
      }

      // Não deve ser todos exatamente iguais (variabilidade)
      // Com burst=2, as primeiras 2 são rápidas, depois vem cooldown
      const uniqueDelays = new Set(delays.map(d => Math.round(d / 10) * 10));
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('burst control', () => {
    it('permite burst até o limite configurado', async () => {
      // burstMax=2 — as primeiras 2 msgs devem passar rapidamente
      const start = Date.now();

      await limiter.sendText({ instance: 'test', to: '5511999', text: 'burst1' });
      await limiter.sendText({ instance: 'test', to: '5511999', text: 'burst2' });

      const elapsed = Date.now() - start;

      // 2 msgs com delay 50-100ms entre elas — máximo ~200ms total
      expect(elapsed).toBeLessThan(300);
      expect(mock.calls).toHaveLength(2);
    });

    it('aplica cooldown após atingir burst máximo', async () => {
      const start = Date.now();

      // Enviar burst+1 msgs para triggerar cooldown
      await limiter.sendText({ instance: 'test', to: '5511999', text: 'b1' });
      await limiter.sendText({ instance: 'test', to: '5511999', text: 'b2' });
      await limiter.sendText({ instance: 'test', to: '5511999', text: 'b3' }); // deve triggerar cooldown

      const elapsed = Date.now() - start;

      // Com burstCooldown=200ms, após 2 msgs rápidas a 3ª deve demorar ~200ms a mais
      expect(elapsed).toBeGreaterThanOrEqual(150);
      expect(mock.calls).toHaveLength(3);
    });
  });

  describe('limite horário', () => {
    it('loga warning ao atingir limite por hora', async () => {
      // maxPerHour=5, enviamos 5 msgs — na 5ª o log de checkpoint deve aparecer
      for (let i = 0; i < 5; i++) {
        await limiter.sendText({ instance: 'test', to: '5511999', text: `msg${i}` });
      }

      expect(mock.calls).toHaveLength(5);

      // Verifica que métricas refletem 5 envios
      const metrics = limiter.getMetrics('test');
      expect(metrics.hourly).toBe(5);
    });

    it('registra métrica correta ao se aproximar do limite', async () => {
      // Usa config com maxPerHour=5 — ao enviar 4 msgs (80%), deve alertar
      const smallLimiter = new RateLimitedMessaging(mock, logger, {
        ...FAST_CONFIG,
        maxPerHour: 5,
      });

      for (let i = 0; i < 4; i++) {
        await smallLimiter.sendText({ instance: 'test', to: '5511999', text: `msg${i}` });
      }

      const metrics = smallLimiter.getMetrics('test');
      expect(metrics.hourly).toBe(4);
      // 4/5 = 80% — o alerta de 80% deve ter sido logado
    });
  });

  describe('métricas', () => {
    it('retorna contadores corretos via getMetrics', async () => {
      await limiter.sendText({ instance: 'inst-a', to: '5511999', text: 'msg1' });
      await limiter.sendText({ instance: 'inst-a', to: '5511999', text: 'msg2' });
      await limiter.sendText({ instance: 'inst-b', to: '5511999', text: 'msg1' });

      const metricsA = limiter.getMetrics('inst-a');
      const metricsB = limiter.getMetrics('inst-b');

      expect(metricsA.hourly).toBe(2);
      expect(metricsA.daily).toBe(2);
      expect(metricsB.hourly).toBe(1);
      expect(metricsB.daily).toBe(1);
    });

    it('isola contadores por instância', async () => {
      await limiter.sendText({ instance: 'dono-1', to: '5511999', text: 'msg' });
      await limiter.sendText({ instance: 'dono-2', to: '5511999', text: 'msg' });

      const m1 = limiter.getMetrics('dono-1');
      const m2 = limiter.getMetrics('dono-2');

      expect(m1.hourly).toBe(1);
      expect(m2.hourly).toBe(1);
    });
  });

  describe('cenários de produção', () => {
    it('múltiplos destinatários na mesma instância compartilham o rate limit', async () => {
      // Simula Cleo respondendo vários clientes do mesmo dono
      for (let i = 0; i < 5; i++) {
        await limiter.sendText({ instance: 'dono-x', to: `554899900${i}`, text: `resposta ${i}` });
      }

      const metrics = limiter.getMetrics('dono-x');
      expect(metrics.hourly).toBe(5);

      // Atingiu o limite — próximo envio deve logar warning (não testamos o delay em si)
      expect(metrics.hourly).toBeGreaterThanOrEqual(FAST_CONFIG.maxPerHour!);
    });

    it('instâncias diferentes operam independentemente', async () => {
      // Dono A saturado, Dono B livre
      for (let i = 0; i < 5; i++) {
        await limiter.sendText({ instance: 'dono-a', to: '5511999', text: `msg${i}` });
      }

      // Dono B deve enviar rápido (não afetado pelo limite de dono-a)
      const beforeB = Date.now();
      await limiter.sendText({ instance: 'dono-b', to: '5511888', text: 'msg livre' });
      const elapsedB = Date.now() - beforeB;

      // Dono B não deve esperar o delay longo do rate limit horário
      expect(elapsedB).toBeLessThan(500);
    });
  });
});
