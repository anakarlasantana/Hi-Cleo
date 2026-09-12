/**
 * Tipos compartilhados entre os módulos do teste E2E.
 */

import type { Persona } from './autonomous-user.js';
import type { Turn } from './simulator.js';
import type { Verdict } from './judge.js';

/** Resultado completo da execução de uma persona */
export interface ConversationResult {
  persona: Persona;
  turns: Turn[];
  verdict: Verdict;
}
