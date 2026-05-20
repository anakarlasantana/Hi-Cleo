export interface MessageJobData {
  phone: string;
  instance: string;
  text: string;
  pushName?: string;
  isSecretaryInstance: boolean;
  timestamp: number;
  remoteJid: string;
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
