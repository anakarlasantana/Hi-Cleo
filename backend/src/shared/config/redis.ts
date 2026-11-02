import IORedis from 'ioredis';
import { env } from './env.js';

/**
 * Factory única de conexão Redis.
 *
 * Existe para evitar a duplicação da configuração nos três pontos que abrem
 * conexão própria (queue.service, queue.worker e o health check). Quando a
 * senha era passada apenas no compose, mas não no `new IORedis({ host, port })`,
 * produção quebrava com `NOAUTH Authentication required` — a fila não conectava
 * e o /health retornava 503, deixando o backend unhealthy e travando
 * frontend e nginx (depends_on: service_healthy).
 *
 * A senha só é enviada quando configurada: em dev o Redis sobe sem
 * `--requirepass` (docker-compose.yml), em produção exige senha.
 */
export function createRedisConnection(overrides: Record<string, unknown> = {}): IORedis {
  return new IORedis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
    ...overrides,
  });
}
