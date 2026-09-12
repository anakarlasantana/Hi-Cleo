/**
 * Flags de linha de comando do teste E2E (--no-pause, --pause-always, --single).
 */

import type { Scenario } from './config.js';

export interface CliOptions {
  /** Modo CI/CD — roda tudo sem pausar */
  noPause: boolean;
  /** Pausa após TODAS as personas (inclusive as que passaram) */
  pauseAlways: boolean;
  /** Cenário único a executar (null = todos) */
  singleScenario: Scenario | null;
}

/** Parseia argv e retorna as opções do runner */
export function parseCli(argv: string[]): CliOptions {
  const noPause = argv.includes('--no-pause');
  const pauseAlways = argv.includes('--pause-always');

  let singleScenario: Scenario | null = null;
  const idx = argv.indexOf('--single');
  if (idx !== -1) {
    const value = argv[idx + 1];
    if (!value || value.startsWith('--')) {
      console.error('❌ --single requer um cenário. Ex: --single onboarding');
      console.error('   Cenários disponíveis: onboarding, client_message, owner_command, edge_case,');
      console.error('   trial_flow, payment_webhook, invite_flow, prospection_response,');
      console.error('   material_flow, local_classifier, configure_rules, degraded_fallback');
      process.exit(1);
    }
    singleScenario = value as Scenario;
  }

  return { noPause, pauseAlways, singleScenario };
}
