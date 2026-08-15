import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const { Pool } = pg;

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const migrationsDir = join(import.meta.dirname, '..', 'migrations');
  const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`Aplicando ${files.length} migration(s)...`);

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await pool.query(sql);
    console.log(`  ✅ ${file}`);
  }

  await pool.end();
  console.log('Migrations concluídas.');
}

migrate().catch((err) => {
  console.error('❌ Erro nas migrations:', err);
  process.exit(1);
});
