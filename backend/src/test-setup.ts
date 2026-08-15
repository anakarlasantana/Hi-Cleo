import { vi } from 'vitest';

// Mock do módulo database para evitar conexão real com PostgreSQL nos testes unitários
vi.mock('./shared/config/database.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => [] }), orderBy: () => [] }) }),
    insert: () => ({ values: () => ({ returning: () => [], onConflictDoUpdate: () => ({}) }) }),
    update: () => ({ set: () => ({ where: () => ({}) }) }),
    delete: () => ({ where: () => ({}) }),
    execute: () => [],
  },
  pool: {
    query: () => ({ rows: [] }),
    end: () => Promise.resolve(),
  },
  closeDatabase: () => Promise.resolve(),
}));
