import * as Sentry from '@sentry/node';
import { env } from './env.js';

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    beforeSend(event) {
      // Sanitizar dados sensíveis antes de enviar ao Sentry
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['apikey'];
        delete event.request.headers['x-webhook-secret'];
      }
      return event;
    },
  });
}

export { Sentry };
