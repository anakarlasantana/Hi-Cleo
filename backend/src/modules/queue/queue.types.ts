import type { MediaType } from '../../shared/types/index.js';

export interface MediaJobData {
  type: MediaType;
  mimeType: string;
  fileName: string | null;
  key: string | null;
  rawMessage?: Record<string, unknown>;
  durationSeconds?: number;
}

export interface MessageJobData {
  phone: string;
  instance: string;
  text: string;
  pushName?: string;
  isSecretaryInstance: boolean;
  timestamp: number;
  remoteJid: string;
  messageKey?: string;
  /** Key completo do webhook (remoteJid + fromMe + id) para transcrição de áudio */
  webhookKey?: { remoteJid: string; fromMe: boolean; id: string };
  media?: MediaJobData;
}

export interface QueueServiceConfig {
  redisHost: string;
  redisPort: number;
  maxRetries: number;
  backoffDelays: number[];
}

export interface EnqueueResult {
  enqueued: boolean;
  jobId?: string;
}
