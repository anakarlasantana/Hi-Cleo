/**
 * Runner — despacha a persona para o executor correto (técnico ou
 * conversacional) e controla o loop de retry/pausa interativa.
 */

import type { AiClient } from './ai-client.js';
import type { Persona } from './autonomous-user.js';
import { isFunctionalScenario } from './judge.js';
import { promptAfterPersona } from './interactive.js';
import { formatSingleResult } from './report.js';
import { runConversation } from './scenarios/conversational.js';
import {
  runCancellationFlow,
  runDegradedFallback,
  runPaymentWebhook,
  runSubscriptionExpired,
  runSubscriptionRenewal,
} from './scenarios/technical.js';
import type { ConversationResult } from './types.js';

/** Executa uma persona roteando para o runner adequado ao cenário */
async function executePersona(
  personaAi: AiClient,
  judgeAi: AiClient,
  persona: Persona,
): Promise<ConversationResult> {
  switch (persona.scenario) {
    case 'payment_webhook':
      return runPaymentWebhook(persona);
    case 'degraded_fallback':
      return runDegradedFallback(persona);
    case 'subscription_expired':
      return runSubscriptionExpired(persona);
    case 'subscription_renewal':
      return runSubscriptionRenewal(persona);
    case 'cancellation_flow':
      return runCancellationFlow(persona);
    default:
      return runConversation(personaAi, judgeAi, persona);
  }
}

/** Cria um resultado de erro (score 0) para exceções de execução */
function buildErrorResult(persona: Persona, error: Error): ConversationResult {
  const defaultScores = isFunctionalScenario(persona.scenario)
    ? { relevancia: 0, tom_de_voz: 0, factualidade: 0, completude: 0, naturalidade: 0, corretude_funcional: 0 }
    : { relevancia: 0, tom_de_voz: 0, factualidade: 0, completude: 0, naturalidade: 0 };

  // Falha do avaliador/provedor (ex: 429 de cota) não é defeito do produto — o
  // relatório precisa dizer isso, senão um 0.00 parece regressão de qualidade.
  const isInfra = /(429|quota|rate limit|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)/i.test(error.message);

  return {
    persona,
    turns: [],
    verdict: {
      scores: defaultScores,
      media: 0,
      pass: false,
      razao: isInfra
        ? `Avaliação interrompida por falha de infraestrutura (${error.message}) — não é defeito do produto; reexecute o cenário.`
        : `Erro na execução: ${error.message}`,
      problemas: [isInfra ? `Infraestrutura: ${error.message}` : error.message],
    },
  };
}

export interface RunPersonaOutcome {
  results: ConversationResult[];
  /** true se o usuário escolheu encerrar o teste nesta persona */
  aborted: boolean;
}

/**
 * Executa UMA persona com suporte a retry/abort no modo interativo.
 * Retorna os resultados produzidos (pode substituir em caso de retry).
 */
export async function runPersonaWithRetry(options: {
  persona: Persona;
  personaAi: AiClient;
  judgeAi: AiClient;
  interactiveMode: boolean;
  pauseAlways: boolean;
}): Promise<RunPersonaOutcome> {
  const { persona, personaAi, judgeAi, interactiveMode, pauseAlways } = options;
  const results: ConversationResult[] = [];

  while (true) {
    try {
      const result = await executePersona(personaAi, judgeAi, persona);
      results.push(result);

      console.log('');
      console.log(formatSingleResult(result));
      console.log('');

      const shouldPause = interactiveMode && (!result.verdict.pass || pauseAlways);
      if (shouldPause) {
        const decision = await promptAfterPersona(result.verdict.pass ? 'passed' : 'failed');
        if (decision === 'retry') {
          console.log('\n  🔄 Re-executando persona...\n');
          results.pop();
          continue;
        }
        if (decision === 'abort') {
          console.log('\n  ⏹️  Encerrando teste...\n');
          return { results, aborted: true };
        }
      }

      return { results, aborted: false };
    } catch (error: any) {
      console.error(`   ❌ Erro na execução: ${error.message}`);

      const errorResult = buildErrorResult(persona, error);
      results.push(errorResult);

      console.log('');
      console.log(formatSingleResult(errorResult));

      if (interactiveMode) {
        console.log('');
        const decision = await promptAfterPersona('error');
        if (decision === 'retry') {
          console.log('\n  🔄 Re-executando persona...\n');
          results.pop();
          continue;
        }
        if (decision === 'abort') {
          console.log('\n  ⏹️  Encerrando teste...\n');
          return { results, aborted: true };
        }
      }

      return { results, aborted: false };
    }
  }
}
