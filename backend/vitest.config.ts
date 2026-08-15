import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      GEMINI_API_KEY: 'test-key',
      EVOLUTION_API_KEY: 'test-key',
      SECRETARY_PHONE: '5511999999999',
      MERCADO_PAGO_ACCESS_TOKEN: 'test-token',
      MERCADO_PAGO_WEBHOOK_SECRET: 'test-secret',
    },
    setupFiles: ['./src/test-setup.ts'],
  },
});
