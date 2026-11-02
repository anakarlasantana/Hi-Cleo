/**
 * Runner de migrations e seeds do Hi Cleo.
 *
 * Por que existe (2026-11-02): as migrations eram montadas em
 * `/docker-entrypoint-initdb.d`, que o Postgres **só executa com volume vazio**
 * ("Skipping initialization" no log). Resultado: a próxima migration nunca era
 * aplicada em dev nem na VPS. O script antigo (`scripts/migrate.ts`) também
 * quebrava com `import.meta.dirname` (undefined em CJS) e não tinha controle de
 * versão — reaplicava todos os arquivos.
 *
 * Como funciona agora:
 * - tabela `schema_migrations` guarda o que já foi aplicado (forward-only);
 * - cada arquivo roda em transação e é registrado junto (falhou ⇒ rollback);
 * - `pg_advisory_lock` garante um único migrador mesmo com N réplicas;
 * - `seeds/` roda em TODA execução (arquivos idempotentes por UPSERT), então
 *   mudanças em dados de referência (ex.: preços dos planos) chegam ao banco.
 *
 * Uso:
 *   node dist/scripts/migrate.js          (container, via serviço `migrate`)
 *   npx tsx src/scripts/migrate.ts        (host: exporte DATABASE_URL)
 *   ... --dry-run                         (só lista o que está pendente)
 */
import 'dotenv/config';
import pg from 'pg';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const { Pool } = pg;

/** Lock consultivo fixo — duas instâncias não migram ao mesmo tempo. */
const MIGRATION_LOCK_ID = 918_273_645;

/** Remove a extensão `.sql` para usar como versão (`0001_initial_schema`). */
export function versionOf(file: string): string {
  return file.replace(/\.sql$/i, '');
}

/**
 * Arquivos ainda não aplicados, em ordem alfabética (0001 → 0004 → …).
 * Exportada para teste: é a regra central da idempotência.
 */
export function selectPending(files: string[], applied: ReadonlySet<string>): string[] {
  return [...files].sort().filter((file) => !applied.has(versionOf(file)));
}

/**
 * Encontra `migrations/` ou `seeds/` tanto no container (WORKDIR /app) quanto
 * rodando do host (`backend/` ou a raiz do repo). `MIGRATIONS_DIR`/`SEEDS_DIR`
 * têm prioridade e são definidos no compose.
 */
export function resolveDataDir(kind: 'migrations' | 'seeds'): string | undefined {
  const fromEnv = process.env[kind === 'migrations' ? 'MIGRATIONS_DIR' : 'SEEDS_DIR'];
  const candidates = [
    fromEnv,
    resolve(process.cwd(), kind),
    resolve(process.cwd(), '..', kind),
    resolve(process.cwd(), 'backend', kind),
    resolve(process.cwd(), '..', 'backend', kind),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((dir) => existsSync(dir));
}

interface MigrateOptions {
  databaseUrl?: string;
  dryRun?: boolean;
  /** Injetável para teste; default `console.log`. */
  log?: (message: string) => void;
}

/**
 * Aplica migrations pendentes e depois todos os seeds.
 * Retorna quantas migrations foram aplicadas e quantas ficaram pendentes.
 */
export async function runMigrations(
  options: MigrateOptions = {},
): Promise<{ applied: number; pending: number }> {
  const log = options.log ?? ((message: string) => console.log(message));
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL não definida. No Docker ela vem do compose; rodando no host, exporte ' +
        'DATABASE_URL=postgresql://hicleo:hicleo123@localhost:5434/hicleo',
    );
  }

  const migrationsDir = resolveDataDir('migrations');
  if (!migrationsDir) {
    throw new Error('diretório de migrations não encontrado (defina MIGRATIONS_DIR)');
  }

  const seedsDir = resolveDataDir('seeds');
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query<{ version: string }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));

    const files = readdirSync(migrationsDir).filter((file) => file.toLowerCase().endsWith('.sql'));
    const pending = selectPending(files, applied);

    log(`Migrations: ${files.length} encontrada(s), ${pending.length} pendente(s)`);

    let appliedCount = 0;

    if (options.dryRun) {
      for (const file of pending) log(`  • pendente: ${file}`);
    } else {
      for (const file of pending) {
        const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [versionOf(file)]);
          await client.query('COMMIT');
          appliedCount++;
          log(`  ✅ ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(`falha em ${file}: ${(error as Error).message}`);
        }
      }
    }

    // Seeds rodam SEMPRE (idempotentes por UPSERT): mantém dados de referência
    // atualizados sem virar "migration nova" a cada ajuste de preço/feature.
    if (seedsDir) {
      const seedFiles = readdirSync(seedsDir).filter((file) => file.toLowerCase().endsWith('.sql')).sort();

      for (const file of seedFiles) {
        if (options.dryRun) {
          log(`  • seed (sempre): ${file}`);
          continue;
        }

        const sql = readFileSync(resolve(seedsDir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('COMMIT');
          log(`  🌱 ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(`falha no seed ${file}: ${(error as Error).message}`);
        }
      }
    }

    const remaining = pending.length - appliedCount;
    log(`Migrations concluídas: ${appliedCount} aplicada(s), ${remaining} pendente(s).`);
    return { applied: appliedCount, pending: remaining };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

// Executa apenas quando chamado diretamente (node dist/scripts/migrate.js ou
// tsx src/scripts/migrate.ts) — importar em teste não dispara nada.
const invokedDirectly = /migrate\.(ts|js)$/.test(process.argv[1] ?? '');

if (invokedDirectly) {
  runMigrations({ dryRun: process.argv.includes('--dry-run') })
    .then(({ pending }) => process.exit(pending > 0 ? 1 : 0))
    .catch((error: Error) => {
      console.error(`❌ Erro nas migrations: ${error.message}`);
      process.exit(1);
    });
}

