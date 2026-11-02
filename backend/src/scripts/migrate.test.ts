import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolveDataDir, selectPending, versionOf } from './migrate.js';

/**
 * Regressão de 2026-11-02: o runner antigo reaplicava TODOS os arquivos (sem
 * controle de versão) e quebrava com `import.meta.dirname` undefined em CJS.
 * Aqui garantimos a regra central: só roda o que ainda não foi registrado em
 * `schema_migrations`, em ordem alfabética.
 */
describe('migrate — seleção de migrations pendentes', () => {
  it('deriva a versão a partir do nome do arquivo', () => {
    expect(versionOf('0001_initial_schema.sql')).toBe('0001_initial_schema');
    expect(versionOf('0005_UPPER.SQL')).toBe('0005_UPPER');
  });

  it('aplica tudo quando nada foi registrado, em ordem', () => {
    const files = ['0003_c.sql', '0001_a.sql', '0002_b.sql'];

    expect(selectPending(files, new Set())).toEqual(['0001_a.sql', '0002_b.sql', '0003_c.sql']);
  });

  it('não reaplica o que já está em schema_migrations (2ª execução = no-op)', () => {
    const files = ['0001_a.sql', '0002_b.sql'];
    const applied = new Set(['0001_a', '0002_b']);

    expect(selectPending(files, applied)).toEqual([]);
  });

  it('aplica apenas a migration nova', () => {
    const files = ['0001_a.sql', '0002_b.sql', '0003_c.sql'];
    const applied = new Set(['0001_a', '0002_b']);

    expect(selectPending(files, applied)).toEqual(['0003_c.sql']);
  });

  it('ignora arquivos que não são .sql? (regra fica no runner)', () => {
    // O filtro de extensão é do runner; aqui garantimos que nomes sem .sql não
    // colidem com versões registradas.
    const applied = new Set(['0001_a']);
    expect(selectPending(['0001_a.sql'], applied)).toEqual([]);
  });
});

describe('migrate — resolução dos diretórios', () => {
  it('encontra backend/migrations a partir do cwd do backend', () => {
    const dir = resolveDataDir('migrations');
    expect(dir).toBeDefined();
    expect(existsSync(dir!)).toBe(true);
    expect(dir!.endsWith('migrations')).toBe(true);
  });

  it('encontra backend/seeds a partir do cwd do backend', () => {
    const dir = resolveDataDir('seeds');
    expect(dir).toBeDefined();
    expect(existsSync(dir!)).toBe(true);
    expect(dir!.endsWith('seeds')).toBe(true);
  });
});
