/**
 * Interação com o usuário via stdin (modo interativo de pausa/retentativa).
 */

import { createInterface } from 'readline';

/** Escolha do usuário no menu de pausa */
export type PauseDecision = 'continue' | 'retry' | 'abort';

/**
 * Pergunta ao usuário via stdin e retorna a resposta.
 */
export function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Exibe o menu de pausa após uma persona (falha, sucesso com --pause-always
 * ou erro de execução) e aguarda a escolha do usuário.
 */
export async function promptAfterPersona(kind: 'failed' | 'passed' | 'error'): Promise<PauseDecision> {
  console.log('┌─────────────────────────────────────────────────────────┐');
  if (kind === 'failed') {
    console.log('│  ❌ Persona FALHOU. Corrija o código e escolha:         │');
  } else if (kind === 'error') {
    console.log('│  💥 Erro de execução. Corrija e escolha:                │');
  } else {
    console.log('│  ✅ Persona PASSOU. Escolha:                            │');
  }
  console.log('│                                                         │');
  console.log('│  [c] Continuar para a próxima persona                   │');
  console.log('│  [r] Re-executar esta persona (após correção)           │');
  console.log('│  [q] Encerrar e gerar relatório parcial                 │');
  console.log('└─────────────────────────────────────────────────────────┘');

  const answer = await askUser('\n  👉 Escolha (c/r/q): ');

  if (answer === 'r' || answer === 'retry') return 'retry';
  if (answer === 'q' || answer === 'quit') return 'abort';
  return 'continue';
}
