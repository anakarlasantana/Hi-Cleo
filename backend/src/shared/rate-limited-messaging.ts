/**
 * Rate Limiter de saída para WhatsApp — proteção anti-ban.
 *
 * Wrappa o MessagingPort real com:
 * - Sliding window por instância (max msgs/hora)
 * - Delay variável entre envios (simula humano)
 * - Fila interna para não descartar mensagens
 * - Logging de métricas
 *
 * Baseado nas diretrizes: docs/tecnico/whatsapp-anti-ban.md
 */

import type {
  MessagingPort,
  SendTextOptions,
  SendMediaOptions,
  ForwardMessageOptions,
  CreateInstanceOptions,
  CreateInstanceResult,
  ConnectionStatus,
  WebhookOptions,
} from '../modules/evolution/evolution.port.js';
import type { Logger } from './logger/logger.js';

export interface RateLimitConfig {
  /** Máximo de mensagens por hora por instância (default: 25) */
  maxPerHour: number;
  /** Máximo de mensagens por dia por instância (default: 200) */
  maxPerDay: number;
  /** Delay mínimo entre envios em ms (default: 2000) */
  minDelayMs: number;
  /** Delay máximo entre envios em ms (default: 5000) */
  maxDelayMs: number;
  /** Burst máximo — msgs seguidas sem delay extra (default: 3) */
  burstMax: number;
  /** Cooldown após burst em ms (default: 12000) */
  burstCooldownMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxPerHour: 25,
  maxPerDay: 200,
  minDelayMs: 2000,
  maxDelayMs: 5000,
  burstMax: 3,
  burstCooldownMs: 12000,
};

/**
 * Controle de rate por instância usando sliding window em memória.
 * Para produção com múltiplos workers, substituir por Redis (ZRANGEBYSCORE).
 */
class InstanceRateTracker {
  private hourlyRecords: Map<string, number[]> = new Map();
  private dailyRecords: Map<string, number[]> = new Map();
  private burstCounters: Map<string, { count: number; lastSend: number }> = new Map();

  getHourlyCount(instance: string): number {
    const records = this.hourlyRecords.get(instance) || [];
    const oneHourAgo = Date.now() - 3_600_000;
    const valid = records.filter(ts => ts > oneHourAgo);
    this.hourlyRecords.set(instance, valid);
    return valid.length;
  }

  getDailyCount(instance: string): number {
    const records = this.dailyRecords.get(instance) || [];
    const oneDayAgo = Date.now() - 86_400_000;
    const valid = records.filter(ts => ts > oneDayAgo);
    this.dailyRecords.set(instance, valid);
    return valid.length;
  }

  record(instance: string): void {
    const now = Date.now();
    const hourly = this.hourlyRecords.get(instance) || [];
    hourly.push(now);
    this.hourlyRecords.set(instance, hourly);

    const daily = this.dailyRecords.get(instance) || [];
    daily.push(now);
    this.dailyRecords.set(instance, daily);

    // Burst tracking
    const burst = this.burstCounters.get(instance) || { count: 0, lastSend: 0 };
    burst.count++;
    burst.lastSend = now;
    this.burstCounters.set(instance, burst);
  }

  getBurstCount(instance: string): number {
    const burst = this.burstCounters.get(instance);
    if (!burst) return 0;

    // Reset burst se passou o cooldown
    const timeSinceLastSend = Date.now() - burst.lastSend;
    if (timeSinceLastSend > 10_000) {
      burst.count = 0;
      return 0;
    }
    return burst.count;
  }

  resetBurst(instance: string): void {
    this.burstCounters.set(instance, { count: 0, lastSend: Date.now() });
  }
}

export class RateLimitedMessaging implements MessagingPort {
  private readonly inner: MessagingPort;
  private readonly config: RateLimitConfig;
  private readonly logger: Logger;
  private readonly tracker: InstanceRateTracker;
  private lastSendTime: Map<string, number> = new Map();

  constructor(inner: MessagingPort, logger: Logger, config?: Partial<RateLimitConfig>) {
    this.inner = inner;
    this.logger = logger.child({ module: 'rate-limiter' });
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tracker = new InstanceRateTracker();

    this.logger.info({
      maxPerHour: this.config.maxPerHour,
      maxPerDay: this.config.maxPerDay,
      minDelayMs: this.config.minDelayMs,
      maxDelayMs: this.config.maxDelayMs,
    }, 'RateLimitedMessaging inicializado');
  }

  // ─── Métodos públicos (delegados com rate limiting) ────────────────────────

  async sendText(options: SendTextOptions): Promise<void> {
    await this.throttle(options.instance, 'sendText', options.to);
    await this.inner.sendText(options);
    this.tracker.record(options.instance);
  }

  async sendMedia(options: SendMediaOptions): Promise<void> {
    await this.throttle(options.instance, 'sendMedia', options.to);
    await this.inner.sendMedia(options);
    this.tracker.record(options.instance);
  }

  async forwardMessage(options: ForwardMessageOptions): Promise<void> {
    await this.throttle(options.instance, 'forwardMessage', options.to);
    await this.inner.forwardMessage(options);
    this.tracker.record(options.instance);
  }

  // ─── Métodos que NÃO precisam de rate limiting ─────────────────────────────

  async createInstance(options: CreateInstanceOptions): Promise<CreateInstanceResult> {
    return this.inner.createInstance(options);
  }

  async ensureInstance(options: CreateInstanceOptions): Promise<void> {
    return this.inner.ensureInstance(options);
  }

  async setWebhook(instance: string, options: WebhookOptions): Promise<void> {
    return this.inner.setWebhook(instance, options);
  }

  async getStatus(instance: string): Promise<ConnectionStatus> {
    return this.inner.getStatus(instance);
  }

  async getQrCode(instance: string): Promise<string> {
    return this.inner.getQrCode(instance);
  }

  async restart(instance: string): Promise<void> {
    return this.inner.restart(instance);
  }

  // ─── Métodos de métricas (para monitoramento) ──────────────────────────────

  getMetrics(instance: string): { hourly: number; daily: number; burst: number } {
    return {
      hourly: this.tracker.getHourlyCount(instance),
      daily: this.tracker.getDailyCount(instance),
      burst: this.tracker.getBurstCount(instance),
    };
  }

  // ─── Lógica interna ────────────────────────────────────────────────────────

  private async throttle(instance: string, method: string, to: string): Promise<void> {
    // 1. Verificar limite horário
    const hourlyCount = this.tracker.getHourlyCount(instance);
    if (hourlyCount >= this.config.maxPerHour) {
      const waitMs = this.calculateWaitForNextSlot(instance);
      this.logger.warn({
        instance,
        hourlyCount,
        maxPerHour: this.config.maxPerHour,
        waitMs,
        method,
        to: to.slice(0, 4) + '****',
      }, 'rate limit horário atingido — aguardando slot');
      await this.sleep(waitMs);
    }

    // 2. Verificar limite diário
    const dailyCount = this.tracker.getDailyCount(instance);
    if (dailyCount >= this.config.maxPerDay) {
      this.logger.error({
        instance,
        dailyCount,
        maxPerDay: this.config.maxPerDay,
        method,
        to: to.slice(0, 4) + '****',
      }, 'rate limit DIÁRIO atingido — mensagem será enviada com delay longo');
      // Delay de 5 minutos para dar tempo do bucket diário renovar
      await this.sleep(300_000);
    }

    // 3. Delay variável entre envios (anti-detecção de automação)
    const burstCount = this.tracker.getBurstCount(instance);
    if (burstCount >= this.config.burstMax) {
      // Cooldown após burst
      const cooldown = this.randomBetween(
        this.config.burstCooldownMs * 0.8,
        this.config.burstCooldownMs * 1.3,
      );
      this.logger.debug({ instance, burstCount, cooldown }, 'burst cooldown');
      await this.sleep(cooldown);
      this.tracker.resetBurst(instance);
    } else {
      // Delay normal entre msgs
      const lastSend = this.lastSendTime.get(instance) || 0;
      const elapsed = Date.now() - lastSend;
      const targetDelay = this.randomBetween(this.config.minDelayMs, this.config.maxDelayMs);

      if (elapsed < targetDelay) {
        const remainingDelay = targetDelay - elapsed;
        await this.sleep(remainingDelay);
      }
    }

    // Registrar momento do envio
    this.lastSendTime.set(instance, Date.now());

    // 4. Log de métricas a cada 5 msgs
    if ((hourlyCount + 1) % 5 === 0) {
      this.logger.info({
        instance,
        hourlyCount: hourlyCount + 1,
        dailyCount: dailyCount + 1,
        maxPerHour: this.config.maxPerHour,
        utilizationPct: Math.round(((hourlyCount + 1) / this.config.maxPerHour) * 100),
      }, 'rate limiter — checkpoint');
    }

    // 5. Alerta a 80% da capacidade
    if (hourlyCount + 1 >= this.config.maxPerHour * 0.8 && hourlyCount < this.config.maxPerHour * 0.8) {
      this.logger.warn({
        instance,
        hourlyCount: hourlyCount + 1,
        maxPerHour: this.config.maxPerHour,
      }, '⚠️ rate limiter a 80% da capacidade horária');
    }
  }

  private calculateWaitForNextSlot(instance: string): number {
    // Encontra o timestamp mais antigo dentro da janela e calcula quando expira
    // Simplificação: espera um delay proporcional para o próximo slot
    const baseWait = 3_600_000 / this.config.maxPerHour; // ~144s para 25/hora
    return this.randomBetween(baseWait * 0.8, baseWait * 1.5);
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(min + Math.random() * (max - min));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
