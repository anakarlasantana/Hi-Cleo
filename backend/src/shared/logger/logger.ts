import pino from 'pino';
import path from 'path';
import { env } from '../config/env.js';

export type Logger = pino.Logger;

export function truncate(text: string, maxLength = 200): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function createLogger(): Logger {
  const isDev = env.NODE_ENV === 'development';

  if (isDev) {
    return pino({
      level: env.LOG_LEVEL,
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    });
  }

  return pino({
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
      target: 'pino-roll',
      options: {
        file: path.join(env.LOG_DIR, 'app.log'),
        frequency: 'daily',
        limit: { count: 7 },
        mkdir: true,
      },
    },
  });
}
