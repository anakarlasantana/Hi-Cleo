import pino from 'pino';
import path from 'path';
import { env } from '../config/env.js';

export type Logger = pino.Logger;

export function truncate(text: string, maxLength = 200): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function isPinoPrettyAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(): Logger {
  const isDev = env.NODE_ENV === 'development';

  // Dev com pino-pretty: formatado e colorido no terminal
  if (isDev && isPinoPrettyAvailable()) {
    return pino({
      level: env.LOG_LEVEL,
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    });
  }

  // Produção/Docker: escreve em stdout (Docker captura) + arquivo (persistência)
  // Em Docker, stdout é essencial para `docker logs` funcionar.
  return pino({
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: {
      targets: [
        // stdout — visível via `docker logs`
        { target: 'pino/file', options: { destination: 1 }, level: env.LOG_LEVEL },
        // Arquivo com rotação diária — persistência local
        {
          target: 'pino-roll',
          options: {
            file: path.join(env.LOG_DIR, 'app.log'),
            frequency: 'daily',
            limit: { count: 7 },
            mkdir: true,
          },
          level: env.LOG_LEVEL,
        },
      ],
    },
  });
}
