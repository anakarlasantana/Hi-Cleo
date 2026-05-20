import type { MessageJobData, EnqueueResult } from './queue.types.js';

/**
 * Port para serviço de fila de mensagens.
 * Permite trocar BullMQ por RabbitMQ, SQS, etc. sem alterar o resto do sistema.
 */
export interface QueuePort {
  initialize(): Promise<void>;
  enqueue(data: MessageJobData): Promise<EnqueueResult>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Port para o worker que processa mensagens da fila.
 */
export interface WorkerPort {
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Port para o processador de mensagens.
 * Desacopla a lógica de negócio da infraestrutura de fila.
 */
export type MessageProcessorPort = (data: MessageJobData) => Promise<void>;
