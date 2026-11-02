import { Queue } from 'bullmq';
import type IORedis from 'ioredis';
import type { Logger } from '../../shared/logger/logger.js';
import { createRedisConnection } from '../../shared/config/redis.js';
import type { MessageJobData, QueueServiceConfig, EnqueueResult } from './queue.types.js';
import type { QueuePort } from './queue.port.js';

const QUEUE_NAME = 'webhook-messages';

export class QueueService implements QueuePort {
  private queue: Queue | null = null;
  private connection: IORedis | null = null;
  private isRedisAvailable = false;
  private readonly config: QueueServiceConfig;
  private readonly logger: Logger;

  constructor(config: QueueServiceConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ module: 'queue' });
  }

  async initialize(): Promise<void> {
    try {
      // createRedisConnection injeta host/port/senha — ver shared/config/redis.ts
      this.connection = createRedisConnection({
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });

      this.connection.on('ready', () => {
        this.isRedisAvailable = true;
        this.logger.info('Redis conectado');
      });

      this.connection.on('error', (err: Error) => {
        this.isRedisAvailable = false;
        this.logger.error({ err }, 'Redis erro de conexão');
      });

      this.connection.on('close', () => {
        this.isRedisAvailable = false;
        this.logger.warn('Redis desconectado');
      });

      this.queue = new Queue(QUEUE_NAME, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: this.config.maxRetries,
          backoff: { type: 'custom' },
          removeOnComplete: { count: 1000 },
          removeOnFail: false,
        },
      });

      this.logger.info({ queueName: QUEUE_NAME }, 'QueueService inicializado');
    } catch (error) {
      this.isRedisAvailable = false;
      this.logger.error({ err: error }, 'Falha ao inicializar QueueService');
    }
  }

  async enqueue(data: MessageJobData): Promise<EnqueueResult> {
    if (!this.isRedisAvailable || !this.queue) {
      return { enqueued: false };
    }

    try {
      const job = await this.queue.add('process-message', data, {
        jobId: `${data.phone}-${data.timestamp}`,
      });

      this.logger.info({ jobId: job.id, phone: data.phone, instance: data.instance }, 'job enfileirado');
      return { enqueued: true, jobId: job.id };
    } catch (error) {
      this.logger.error({ err: error, phone: data.phone }, 'falha ao enfileirar');
      return { enqueued: false };
    }
  }

  getBackoffDelay(attemptsMade: number): number {
    const delays = this.config.backoffDelays;
    const index = Math.min(attemptsMade - 1, delays.length - 1);
    return delays[index] || 5000;
  }

  async isHealthy(): Promise<boolean> {
    return this.isRedisAvailable;
  }

  async close(): Promise<void> {
    await this.queue?.close();
    await this.connection?.quit();
    this.logger.info('QueueService encerrado');
  }
}
