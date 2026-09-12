#!/usr/bin/env tsx
/**
 * Teste E2E de Qualidade — Orquestrador (modo persona-por-persona)
 *
 * Fluxo:
 * 1. Lê docs do produto (regras, personalidade)
 * 2. Gera personas variadas automaticamente via LLM
 * 3. Para CADA persona:
 *    a. Simula conversa completa com a Cleo real
 *    b. LLM-as-judge avalia qualidade
 *    c. Se falhou → exibe erros e PAUSA para correção (modo interativo)
 *    d. Usuário escolhe: [c]ontinuar, [r]etry, [q]uit
 * 4. Gera relatório final
 *
 * Modos:
 *   npx tsx tests/e2e-quality/run.ts            → interativo (pausa nos erros)
 *   npx tsx tests/e2e-quality/run.ts --no-pause → CI/CD (roda tudo sem parar)
 *
 * Cenários técnicos (payment_webhook, degraded_fallback, subscription_expired,
 * subscription_renewal, cancellation_flow) usam runners determinísticos em
 * scenarios/technical.ts.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { parseCli } from './cli.js';
import { createPersonaClient, createJudgeClient } from './ai-client.js';
import { closeDb, cleanupAll } from './simulator.js';
import { generatePersonas, type Persona } from './autonomous-user.js';
import { printFinalReport } from './report.js';
import { runPersonaWithRetry } from './runner.js';
import type { ConversationResult } from './types.js';

const __dirname = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

const { noPause, pauseAlways, singleScenario } = parseCli(process.argv);

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadDocs(): string {
  const root = resolve(__dirname, '../..');
  return config.docsPath
    .map(p => {
      try {
        return readFileSync(resolve(root, p), 'utf-8');
      } catch {
        console.warn(`⚠️  Doc não encontrado: ${p}`);
        return '';
      }
    })
    .join('\n\n---\n\n');
}

/** Personas fixas dos cenários técnicos (não geradas por IA) */
const TECHNICAL_PERSONAS: Persona[] = [
  {
    name: 'Teste Webhook Pagamento',
    phone: '5548999900001',
    scenario: 'payment_webhook',
    description: 'Teste técnico — webhook de pagamento MercadoPago',
  },
  {
    name: 'Teste Fallback Degradado',
    phone: '5548999900002',
    scenario: 'degraded_fallback',
    description: 'Teste técnico — resposta degradada quando IA indisponível',
  },
  {
    name: 'Teste Assinatura Expirada',
    phone: '5548999900003',
    scenario: 'subscription_expired',
    description: 'Teste técnico — Cleo fica 100% inoperante após expiração',
  },
  {
    name: 'Teste Renovação Antecipada',
    phone: '5548999900004',
    scenario: 'subscription_renewal',
    description: 'Teste técnico — renovação soma a partir da expiração atual',
  },
  {
    name: 'Teste Cancelamento',
    phone: '5548999900005',
    scenario: 'cancellation_flow',
    description: 'Teste técnico — cancelamento, reembolso CDC e grace period de dados',
  },
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const interactiveMode = !noPause && process.stdin.isTTY;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Hi Cleo — Teste E2E de Qualidade (Persona-por-Persona)    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Backend:      ${config.baseUrl}`);
  console.log(`║  Persona:      ${config.personaProvider} (${config.personaProvider === 'ollama' ? config.ollama.model : 'API'})`);
  console.log(`║  Judge:        ${config.judgeProvider} (${config.judgeProvider === 'ollama' ? config.ollama.model : 'API'})`);
  console.log(`║  Conversas:    ${config.conversationCount}`);
  console.log(`║  Max turnos:   ${config.maxTurnsPerConversation}`);
  console.log(`║  Threshold:    ${config.passThreshold}`);
  console.log(`║  Modo:         ${interactiveMode ? '🖥️  Interativo (pausa nos erros)' : '🤖 Automático (sem pausa)'}`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  if (interactiveMode) {
    console.log('💡 Dica: ao falhar, você pode corrigir o código e digitar [r] para re-executar a mesma persona.');
    console.log('   Use --no-pause para modo CI/CD (sem pausa).');
    console.log('');
  }

  // 1. Verificar saúde do backend
  try {
    const response = await fetch(`${config.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log('✅ Backend saudável');
  } catch (error: any) {
    console.error(`❌ Backend indisponível em ${config.baseUrl}/health`);
    console.error(`   Erro: ${error.message}`);
    console.error('   Rode: docker compose up --build');
    process.exit(1);
  }

  // 2. Criar AI clients (separados por papel)
  if (config.personaProvider === 'ollama' || config.judgeProvider === 'ollama') {
    try {
      const ollamaCheck = await fetch(`${config.ollama.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!ollamaCheck.ok) throw new Error(`HTTP ${ollamaCheck.status}`);
      const tags = await ollamaCheck.json() as { models: Array<{ name: string }> };
      const hasModel = tags.models?.some((m: { name: string }) => m.name.startsWith(config.ollama.model.split(':')[0]));
      if (!hasModel) {
        console.error(`❌ Modelo ${config.ollama.model} não encontrado no Ollama`);
        console.error(`   Rode: ollama pull ${config.ollama.model}`);
        process.exit(1);
      }
      console.log(`✅ Ollama saudável (${config.ollama.model})`);

      // Warmup: pré-carrega o modelo na memória (evita cold start no primeiro teste)
      console.log(`⏳ Aquecendo modelo ${config.ollama.model}...`);
      await fetch(`${config.ollama.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.ollama.model, prompt: 'oi', stream: false, options: { num_predict: 5 } }),
        signal: AbortSignal.timeout(120_000),
      });
      console.log(`✅ Modelo aquecido`);
    } catch (error: any) {
      console.error(`❌ Ollama indisponível em ${config.ollama.baseUrl}`);
      console.error(`   Erro: ${error.message}`);
      console.error('   Rode: ollama serve');
      process.exit(1);
    }
  }

  const personaAi = createPersonaClient();
  const judgeAi = createJudgeClient();
  console.log(`✅ Persona client criado (${config.personaProvider})`);
  console.log(`✅ Judge client criado (${config.judgeProvider})`);

  // 3. Ler docs
  console.log('📖 Lendo documentação do produto...');
  const docs = loadDocs();
  console.log(`   ${config.docsPath.length} docs carregados (${Math.round(docs.length / 1024)}KB)`);

  // 4. Gerar personas (exclui cenários técnicos)
  //    Em modo --single, carrega TODAS as personas pré-geradas para garantir
  //    que o cenário solicitado exista mesmo que esteja além de conversationCount.
  const personaCount = singleScenario ? Number.MAX_SAFE_INTEGER : config.conversationCount;
  console.log(`🎭 Gerando ${singleScenario ? 'todas as personas pré-geradas' : `${config.conversationCount} personas`}...`);
  const personas = await generatePersonas(personaAi, docs, personaCount);
  console.log('   Personas geradas:');
  personas.forEach((p, i) => console.log(`   ${i + 1}. ${p.name} (${p.scenario}) — ${p.description}`));
  console.log('');

  // 5. Adicionar cenários técnicos como personas fixas
  const allPersonas = [...personas, ...TECHNICAL_PERSONAS];

  // Filtro --single: roda apenas o cenário especificado
  const filteredPersonas = singleScenario
    ? allPersonas.filter(p => p.scenario === singleScenario)
    : allPersonas;

  if (singleScenario && filteredPersonas.length === 0) {
    console.error(`❌ Nenhuma persona encontrada para o cenário "${singleScenario}"`);
    console.error('   Verifique se o cenário está no personas.json ou se é um técnico (payment_webhook, degraded_fallback, subscription_expired, subscription_renewal, cancellation_flow).');
    await closeDb();
    process.exit(1);
  }

  if (singleScenario) {
    console.log(`🎯 Modo --single: rodando apenas cenário "${singleScenario}" (${filteredPersonas.length} persona)`);
    console.log('');
  }

  // 6. Rodar conversas PERSONA POR PERSONA
  const results: ConversationResult[] = [];
  let aborted = false;

  for (let i = 0; i < filteredPersonas.length; i++) {
    const persona = filteredPersonas[i];

    console.log('');
    console.log('━'.repeat(70));
    console.log(`  🎭 [${i + 1}/${filteredPersonas.length}] ${persona.name}`);
    console.log(`     Cenário: ${persona.scenario}`);
    console.log(`     ${persona.description}`);
    console.log('━'.repeat(70));

    const outcome = await runPersonaWithRetry({
      persona,
      personaAi,
      judgeAi,
      interactiveMode,
      pauseAlways,
    });

    results.push(...outcome.results);
    if (outcome.aborted) {
      aborted = true;
      break;
    }
  }

  // 7. Relatório final
  const allPassed = printFinalReport(results, aborted, filteredPersonas.length);

  if (results.length > 0) {
    // Cleanup
    const allPhones = results.map(r => r.persona.phone);
    for (const r of results) {
      if (r.persona.scenario === 'client_message') {
        allPhones.push(`55489990${r.persona.phone.slice(-5)}`);
      }
      if (r.persona.scenario === 'degraded_fallback') {
        allPhones.push(`55489998${r.persona.phone.slice(-5)}`);
      }
    }
    await cleanupAll(allPhones);
    await closeDb();
    process.exit(allPassed ? 0 : 1);
  }

  await closeDb();
  process.exit(1);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
