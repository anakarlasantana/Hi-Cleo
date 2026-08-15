import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env.js';
import * as schema from '../schema.js';

const { Pool } = pg;

// Pool de conexões com limites seguros para containers com pouca RAM
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20, // Máximo de conexões simultâneas
  idleTimeoutMillis: 30000, // Fecha conexão idle após 30s
  connectionTimeoutMillis: 5000, // Timeout ao conectar
  // SSL apenas quando explicitamente configurado na connection string (?sslmode=require)
});

// Instância Drizzle tipada com schema completo
export const db = drizzle(pool, { schema });

// Encerramento gracioso do pool (para SIGTERM/SIGINT)
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
