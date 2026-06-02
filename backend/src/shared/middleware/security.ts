import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

// --- Helmet: headers de segurança ---
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...(env.CORS_ORIGIN?.split(',') || ['*'])],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// --- CORS: origens permitidas ---
export function buildCorsOptions() {
  const origins = env.CORS_ORIGIN?.split(',').map((o) => o.trim()) || ['*'];

  return {
    origin: origins.length === 1 && origins[0] === '*'
      ? true
      : origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  };
}

// --- Rate Limiting ---

/** Rate limit global para rotas /api/* (browser) */
export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: env.RATE_LIMIT_GLOBAL,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um momento e tente novamente.' },
  keyGenerator: (req: Request) => {
    // Usar X-Forwarded-For se atrás de proxy (Docker/nginx)
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || 'unknown';
  },
});

/** Rate limit específico para criação de pagamentos */
export const paymentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: env.RATE_LIMIT_PAYMENTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de tentativas de pagamento atingido. Aguarde 1 minuto.' },
  keyGenerator: (req: Request) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || 'unknown';
  },
});

// --- Validação de origem interna (webhooks Docker) ---

const DOCKER_INTERNAL_PREFIXES = ['172.', '10.', '192.168.', '127.0.0.1', '::1', '::ffff:172.'];

export function validateInternalOrigin(req: Request, res: Response, next: NextFunction): void {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || '';

  const isInternal = DOCKER_INTERNAL_PREFIXES.some((prefix) => clientIp.includes(prefix));

  if (!isInternal && env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Acesso negado: origem não autorizada' });
    return;
  }

  next();
}
