import { Worker, type Job } from 'bullmq';
import { createRedisConnection } from '../../shared/config/redis.js';
import type { MessageJobData, QueueServiceConfig } from './queue.types.js';
import type { MessageProcessorPort, WorkerPort } from './queue.port.js';
import type { Logger } from '../../shared/logger/logger.js';

const QUEUE_NAME = 'webhook-messages';

export class MessageWorker implements WorkerPort {
  private worker: Worker | null = null;
  private readonly config: QueueServiceConfig;
  private readonly processor: MessageProcessorPort;
  private readonly logger: Logger;

  constructor(config: QueueServiceConfig, processor: MessageProcessorPort, logger: Logger) {
    this.config = config;
    this.processor = processor;
    this.logger = logger.child({ module: 'worker' });
  }

  async start(): Promise<void> {
    const connection = createRedisConnection({
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker<MessageJobData>(
      QUEUE_NAME,
      async (job: Job<MessageJobData>) => {
        await this.processor(job.data);
      },
      {
        connection,
        concurrency: 5,
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            const delays = this.config.backoffDelays;
            const index = Math.min(attemptsMade - 1, delays.length - 1);
            return delays[index] || 5000;
          },
        },
      }
    );

    this.worker.on('completed', (job: Job<MessageJobData>) => {
      this.logger.info({ jobId: job.id, phone: job.data.phone, instance: job.data.instance }, 'job concluído');
    });

    this.worker.on('failed', (job: Job<MessageJobData> | undefined, error: Error) => {
      if (!job) return;
      const isExhausted = job.attemptsMade >= this.config.maxRetries;

      if (isExhausted) {
        this.logger.error({
          jobId: job.id,
          phone: job.data.phone,
          instance: job.data.instance,
          error: error.message,
          attempts: job.attemptsMade,
          payload: job.data,
        }, 'job movido para DLQ após esgotar retries');
      } else {
        this.logger.warn({
          jobId: job.id,
          phone: job.data.phone,
          instance: job.data.instance,
          error: error.message,
          attempt: job.attemptsMade,
        }, 'job falhou, será retentado');
      }
    });

    this.logger.info('MessageWorker iniciado');
  }

  async shutdown(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.logger.info('MessageWorker encerrado gracefully');
    }
  }
}
