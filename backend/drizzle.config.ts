import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle é usado apenas para introspecção/Studio em dev.
 *
 * As migrations do projeto são SQL puro em `backend/migrations/` aplicadas pelo
 * runner `src/scripts/migrate.ts` (versionado em `schema_migrations`). O `out`
 * fica em `./drizzle` para o `db:generate` NÃO escrever na mesma pasta das
 * migrations manuais (antes ele criava `migrations/meta/_journal.json` vazio e
 * confundia os dois fluxos).
 */
export default defineConfig({
  schema: './src/shared/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

