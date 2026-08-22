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
 *    c. Se falhou → exibe erros e PAUSA para correção
 *    d. Usuário escolhe: [c]ontinuar, [r]etry, [q]uit
 * 4. Gera relatório final
 *
 * Modos:
 *   npx tsx tests/e2e-quality/run.ts           → interativo (pausa nos erros)
 *   npx tsx tests/e2e-quality/run.ts --no-pause → CI/CD (roda tudo sem parar)
 *
 * Cenários técnicos (payment_webhook, degraded_fallback) usam
 * chamadas diretas ao simulator em vez de autonomous-user.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { config, type Scenario } from './config.js';
import { createPersonaClient, createJudgeClient, type AiClient } from './ai-client.js';
import {
  sendMessage,
  sendMessageAsClient,
  waitForResponse,
  startTrial,
  cleanupPhone,
  closeDb,
  createTestUser,
  createWhatsappSession,
  getSubscriptionStatus,
  setTrialExpired,
  markAsProspected,
  sendMaterial,
  cleanupAll,
  getPool,
  type Turn,
} from './simulator.js';
import { generatePersonas, generateFirstMessage, generateNextMessage, type Persona } from './autonomous-user.js';
import { evaluateConversation, evaluateDeterministic, isFunctionalScenario, type Verdict, type FunctionalScores } from './judge.js';

const __dirname = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

// ─── CLI Flags ──────────────────────────────────────────────────────────────

const NO_PAUSE = process.argv.includes('--no-pause');
const PAUSE_ALWAYS = process.argv.includes('--pause-always');

/** Flag --single <scenario>: roda apenas a persona do cenário especificado */
const SINGLE_SCENARIO = (() => {
  const idx = process.argv.indexOf('--single');
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) {
    console.error('❌ --single requer um cenário. Ex: --single onboarding');
    console.error('   Cenários disponíveis: onboarding, client_message, owner_command, edge_case,');
    console.error('   trial_flow, payment_webhook, invite_flow, prospection_response,');
    console.error('   material_flow, local_classifier, configure_rules, degraded_fallback');
    process.exit(1);
  }
  return value as Scenario;
})();

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pergunta ao usuário via stdin e retorna a resposta.
 * Usado para pausar entre personas quando há falha.
 */
function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function formatTable(results: ConversationResult[]): string {
  // Verifica se algum resultado tem corretude_funcional
  const hasFunctional = results.some(r => 'corretude_funcional' in r.verdict.scores);

  if (hasFunctional) {
    const header = '│ Persona                          │ Cenário            │ Relev │ Tom  │ Fact │ Comp │ Nat  │ Func │ Média │ OK? │';
    const sep =    '├──────────────────────────────────┼────────────────────┼───────┼──────┼──────┼──────┼──────┼──────┼───────┼─────┤';
    const topSep = '┌──────────────────────────────────┬────────────────────┬───────┬──────┬──────┬──────┬──────┬──────┬───────┬─────┐';
    const botSep = '└──────────────────────────────────┴────────────────────┴───────┴──────┴──────┴──────┴──────┴──────┴───────┴─────┘';

    const rows = results.map(r => {
      const name = r.persona.name.slice(0, 32).padEnd(32);
      const scenario = r.persona.scenario.slice(0, 18).padEnd(18);
      const s = r.verdict.scores;
      const func = 'corretude_funcional' in s ? (s as FunctionalScores).corretude_funcional.toFixed(2) : ' —  ';
      const ok = r.verdict.pass ? '✅' : '❌';
      return `│ ${name} │ ${scenario} │ ${s.relevancia.toFixed(2)} │ ${s.tom_de_voz.toFixed(2)} │ ${s.factualidade.toFixed(2)} │ ${s.completude.toFixed(2)} │ ${s.naturalidade.toFixed(2)} │ ${func} │ ${r.verdict.media.toFixed(2)}  │ ${ok}  │`;
    });

    return [topSep, header, sep, ...rows, botSep].join('\n');
  }

  // Tabela original sem coluna funcional
  const header = '│ Persona                          │ Cenário            │ Relev │ Tom  │ Fact │ Comp │ Nat  │ Média │ OK? │';
  const sep =    '├──────────────────────────────────┼────────────────────┼───────┼──────┼──────┼──────┼──────┼───────┼─────┤';
  const topSep = '┌──────────────────────────────────┬────────────────────┬───────┬──────┬──────┬──────┬──────┬───────┬─────┐';
  const botSep = '└──────────────────────────────────┴────────────────────┴───────┴──────┴──────┴──────┴──────┴───────┴─────┘';

  const rows = results.map(r => {
    const name = r.persona.name.slice(0, 32).padEnd(32);
    const scenario = r.persona.scenario.slice(0, 18).padEnd(18);
    const s = r.verdict.scores;
    const ok = r.verdict.pass ? '✅' : '❌';
    return `│ ${name} │ ${scenario} │ ${s.relevancia.toFixed(2)} │ ${s.tom_de_voz.toFixed(2)} │ ${s.factualidade.toFixed(2)} │ ${s.completude.toFixed(2)} │ ${s.naturalidade.toFixed(2)} │ ${r.verdict.media.toFixed(2)}  │ ${ok}  │`;
  });

  return [topSep, header, sep, ...rows, botSep].join('\n');
}

function formatSingleResult(result: ConversationResult): string {
  const { persona, turns, verdict } = result;
  const lines: string[] = [];

  lines.push(`   💬 ${turns.length} turnos`);
  lines.push(`   📊 Média: ${verdict.media.toFixed(2)} ${verdict.pass ? '✅ PASSOU' : '❌ FALHOU'}`);

  const s = verdict.scores;
  lines.push(`   📈 Scores: relevância=${s.relevancia.toFixed(2)} tom=${s.tom_de_voz.toFixed(2)} factual=${s.factualidade.toFixed(2)} completude=${s.completude.toFixed(2)} naturalidade=${s.naturalidade.toFixed(2)}`);

  if (verdict.problemas.length > 0) {
    lines.push('');
    lines.push('   ⚠️  Problemas:');
    verdict.problemas.forEach(p => lines.push(`      • ${p}`));
  }

  if (!verdict.pass && verdict.razao) {
    lines.push(`   📝 Razão: ${verdict.razao}`);
  }

  if (!verdict.pass && turns.length > 0) {
    lines.push('');
    lines.push('   📜 Transcript:');
    turns.forEach(t => {
      const prefix = t.role === 'user' ? '   👤' : '   🤖';
      lines.push(`   ${prefix} ${t.content.slice(0, 120)}${t.content.length > 120 ? '...' : ''}`);
    });
  }

  return lines.join('\n');
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConversationResult {
  persona: Persona;
  turns: Turn[];
  verdict: Verdict;
}

// ─── Cenários técnicos (sem autonomous-user) ─────────────────────────────────

async function runPaymentWebhook(persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];
  await cleanupPhone(persona.phone);

  const userId = await createTestUser(persona.phone, persona.name, {
    onboardingComplete: true,
  });

  await setTrialExpired(persona.phone);

  const beforePayment = new Date();
  turns.push({ role: 'user', content: '[SIMULAÇÃO] Pagamento aprovado — ativando subscription', timestamp: beforePayment });

  const db = getPool();
  await db.query(
    `UPDATE users SET plan = 'basic', subscription_status = 'active',
     subscription_started_at = NOW(), subscription_expires_at = NOW() + INTERVAL '30 days'
     WHERE id = $1`,
    [userId],
  );

  await sleep(1000);

  const subscription = await getSubscriptionStatus(persona.phone);
  const checks = [
    { label: 'Subscription existe no banco', passed: subscription !== null },
    { label: 'Status da subscription é active', passed: subscription?.status === 'active' },
    { label: 'Plan ID correto (basic)', passed: subscription?.planId === 'basic' },
    { label: 'Data de expiração definida', passed: subscription?.currentPeriodEnd !== null },
  ];

  turns.push({ role: 'assistant', content: `Subscription ativada: status=${subscription?.status}, plan=${subscription?.planId}`, timestamp: new Date() });

  const verdict = evaluateDeterministic('payment_webhook', checks);
  return { persona, turns, verdict };
}

async function runDegradedFallback(persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];
  await cleanupPhone(persona.phone);

  const ownerPhone = `55489998${persona.phone.slice(-5)}`;
  await cleanupPhone(ownerPhone);
  const userId = await createTestUser(ownerPhone, 'Dono Fallback Test', {
    plan: 'basic',
    subscriptionStatus: 'active',
    onboardingComplete: true,
  });

  const ownerInstance = 'test-e2e';
  await createWhatsappSession(userId, ownerInstance);

  const testMessage = 'Oi, tudo bem? Queria saber sobre o serviço';
  const beforeSend = new Date();
  await sendMessageAsClient(ownerInstance, persona.phone, testMessage);
  turns.push({ role: 'user', content: testMessage, timestamp: beforeSend });

  await sleep(config.messageDelay + 3000);
  const response = await waitForResponse(persona.phone, beforeSend);

  const checks = [
    { label: 'Alguma resposta foi recebida (fallback gracioso)', passed: response !== null },
    { label: 'Resposta não está vazia', passed: !!response && response.trim().length > 0 },
  ];

  if (response) {
    turns.push({ role: 'assistant', content: response, timestamp: new Date() });
    checks.push({ label: 'Resposta está em português', passed: /[àáâãéêíóôõúça-z]/i.test(response) });
  }

  const verdict = evaluateDeterministic('degraded_fallback', checks);
  await cleanupPhone(ownerPhone);

  return { persona, turns, verdict };
}

// ─── Conversa individual (cenários com autonomous-user) ──────────────────────

async function runConversation(personaAi: AiClient, judgeAi: AiClient, persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];

  await cleanupPhone(persona.phone);

  let activationCode: string | undefined;

  switch (persona.scenario) {
    case 'onboarding': {
      try {
        activationCode = await startTrial(persona.phone, persona.name);
      } catch {
        await cleanupPhone(persona.phone);
        await sleep(1000);
        activationCode = await startTrial(persona.phone, persona.name);
      }
      break;
    }

    case 'trial_flow': {
      try {
        activationCode = await startTrial(persona.phone, persona.name);
      } catch {
        await cleanupPhone(persona.phone);
        await sleep(1000);
        activationCode = await startTrial(persona.phone, persona.name);
      }
      break;
    }

    case 'invite_flow': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'prospection_response': {
      await createTestUser(persona.phone, persona.name, {
        onboardingComplete: true,
      });
      await setTrialExpired(persona.phone);
      await markAsProspected(persona.phone);
      break;
    }

    case 'material_flow': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      await sendMaterial(persona.phone, 'catalogo-produtos.pdf', 'application/pdf');
      await sleep(2000);
      break;
    }

    case 'local_classifier': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'configure_rules': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'client_message': {
      const ownerPhone = `55489990${persona.phone.slice(-5)}`;
      await cleanupPhone(ownerPhone);
      const userId = await createTestUser(ownerPhone, 'Dono Teste', {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      const ownerInstance = 'test-e2e';
      await createWhatsappSession(userId, ownerInstance);
      (persona as any)._ownerInstance = ownerInstance;
      break;
    }

    case 'owner_command':
    case 'edge_case': {
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }
  }

  const maxTurns = getMaxTurns(persona.scenario);

  const isClientScenario = persona.scenario === 'client_message';
  const ownerInstance = (persona as any)._ownerInstance as string | undefined;

  async function send(phone: string, text: string): Promise<void> {
    if (isClientScenario && ownerInstance) {
      await sendMessageAsClient(ownerInstance, phone, text);
    } else {
      await sendMessage(phone, text);
    }
  }

  // Primeira mensagem
  const firstMsg = await generateFirstMessage(personaAi, persona, activationCode);
  const beforeSend = new Date();
  await send(persona.phone, firstMsg);
  turns.push({ role: 'user', content: firstMsg, timestamp: beforeSend });

  await sleep(config.messageDelay);
  const firstResponse = await waitForResponse(persona.phone, beforeSend);
  if (firstResponse) {
    turns.push({ role: 'assistant', content: firstResponse, timestamp: new Date() });
  }

  // Loop de conversa
  for (let turn = 0; turn < maxTurns - 1; turn++) {
    const nextMsg = await generateNextMessage(personaAi, persona, turns);
    if (!nextMsg) break;

    const beforeNext = new Date();
    await send(persona.phone, nextMsg);
    turns.push({ role: 'user', content: nextMsg, timestamp: beforeNext });

    await sleep(config.messageDelay);
    const response = await waitForResponse(persona.phone, beforeNext);
    if (response) {
      turns.push({ role: 'assistant', content: response, timestamp: new Date() });
    } else {
      break;
    }
  }

  const verdict = await evaluateConversation(judgeAi, persona, turns, config.passThreshold);

  return { persona, turns, verdict };
}

function getMaxTurns(scenario: Scenario): number {
  switch (scenario) {
    case 'local_classifier':
      return 2;
    case 'invite_flow':
    case 'configure_rules':
    case 'material_flow':
    case 'prospection_response':
      return 4;
    case 'trial_flow':
      return 6;
    default:
      return config.maxTurnsPerConversation;
  }
}

const TECHNICAL_SCENARIOS: Scenario[] = ['payment_webhook', 'degraded_fallback'];

function isTechnicalScenario(scenario: Scenario): boolean {
  return TECHNICAL_SCENARIOS.includes(scenario);
}

// ─── Execução de uma persona com retry ──────────────────────────────────────

async function executePersona(
  personaAi: AiClient,
  judgeAi: AiClient,
  persona: Persona,
): Promise<ConversationResult> {
  if (persona.scenario === 'payment_webhook') {
    return runPaymentWebhook(persona);
  } else if (persona.scenario === 'degraded_fallback') {
    return runDegradedFallback(persona);
  } else {
    return runConversation(personaAi, judgeAi, persona);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const interactiveMode = !NO_PAUSE && process.stdin.isTTY;

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
  console.log(`🎭 Gerando ${config.conversationCount} personas via IA...`);
  const personas = await generatePersonas(personaAi, docs, config.conversationCount);
  console.log('   Personas geradas:');
  personas.forEach((p, i) => console.log(`   ${i + 1}. ${p.name} (${p.scenario}) — ${p.description}`));
  console.log('');

  // 5. Adicionar cenários técnicos como personas fixas
  const technicalPersonas: Persona[] = [
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
  ];

  const allPersonas = [...personas, ...technicalPersonas];

  // Filtro --single: roda apenas o cenário especificado
  const filteredPersonas = SINGLE_SCENARIO
    ? allPersonas.filter(p => p.scenario === SINGLE_SCENARIO)
    : allPersonas;

  if (SINGLE_SCENARIO && filteredPersonas.length === 0) {
    console.error(`❌ Nenhuma persona encontrada para o cenário "${SINGLE_SCENARIO}"`);
    console.error('   Verifique se o cenário está no personas.json ou se é um técnico (payment_webhook, degraded_fallback).');
    await closeDb();
    process.exit(1);
  }

  if (SINGLE_SCENARIO) {
    console.log(`🎯 Modo --single: rodando apenas cenário "${SINGLE_SCENARIO}" (${filteredPersonas.length} persona)`);
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

    // Loop de retry para a mesma persona
    let shouldRetry = true;
    while (shouldRetry) {
      shouldRetry = false;

      try {
        const result = await executePersona(personaAi, judgeAi, persona);
        results.push(result);

        // Mostrar resultado detalhado
        console.log('');
        console.log(formatSingleResult(result));
        console.log('');

        // Decisão: pausar ou continuar?
        const shouldPause = interactiveMode && (
          !result.verdict.pass || PAUSE_ALWAYS
        );

        if (shouldPause) {
          console.log('┌─────────────────────────────────────────────────────────┐');
          if (!result.verdict.pass) {
            console.log('│  ❌ Persona FALHOU. Corrija o código e escolha:         │');
          } else {
            console.log('│  ✅ Persona PASSOU. Escolha:                            │');
          }
          console.log('│                                                         │');
          console.log('│  [c] Continuar para a próxima persona                   │');
          console.log('│  [r] Re-executar esta persona (após correção)           │');
          console.log('│  [q] Encerrar e gerar relatório parcial                 │');
          console.log('└─────────────────────────────────────────────────────────┘');

          const answer = await askUser('\n  👉 Escolha (c/r/q): ');

          if (answer === 'r' || answer === 'retry') {
            console.log('\n  🔄 Re-executando persona...\n');
            // Remove o resultado anterior (será substituído pelo retry)
            results.pop();
            shouldRetry = true;
          } else if (answer === 'q' || answer === 'quit') {
            console.log('\n  ⏹️  Encerrando teste...\n');
            aborted = true;
            break;
          }
          // 'c' ou qualquer outra coisa = continuar
        }
      } catch (error: any) {
        console.error(`   ❌ Erro na execução: ${error.message}`);

        const defaultScores = isFunctionalScenario(persona.scenario)
          ? { relevancia: 0, tom_de_voz: 0, factualidade: 0, completude: 0, naturalidade: 0, corretude_funcional: 0 }
          : { relevancia: 0, tom_de_voz: 0, factualidade: 0, completude: 0, naturalidade: 0 };

        const errorResult: ConversationResult = {
          persona,
          turns: [],
          verdict: {
            scores: defaultScores,
            media: 0,
            pass: false,
            razao: `Erro na execução: ${error.message}`,
            problemas: [error.message],
          },
        };

        results.push(errorResult);
        console.log('');
        console.log(formatSingleResult(errorResult));

        if (interactiveMode) {
          console.log('');
          console.log('┌─────────────────────────────────────────────────────────┐');
          console.log('│  💥 Erro de execução. Corrija e escolha:                │');
          console.log('│                                                         │');
          console.log('│  [c] Continuar para a próxima persona                   │');
          console.log('│  [r] Re-executar esta persona (após correção)           │');
          console.log('│  [q] Encerrar e gerar relatório parcial                 │');
          console.log('└─────────────────────────────────────────────────────────┘');

          const answer = await askUser('\n  👉 Escolha (c/r/q): ');

          if (answer === 'r' || answer === 'retry') {
            console.log('\n  🔄 Re-executando persona...\n');
            results.pop();
            shouldRetry = true;
          } else if (answer === 'q' || answer === 'quit') {
            console.log('\n  ⏹️  Encerrando teste...\n');
            aborted = true;
            break;
          }
        }
      }
    }

    if (aborted) break;
  }

  // 7. Relatório final
  console.log('');
  console.log('═'.repeat(100));
  console.log('                                    RELATÓRIO FINAL');
  if (aborted) {
    console.log(`                            (parcial — ${results.length}/${filteredPersonas.length} personas executadas)`);
  }
  console.log('═'.repeat(100));
  console.log('');

  if (results.length > 0) {
    console.log(formatTable(results));
    console.log('');

    const passed = results.filter(r => r.verdict.pass).length;
    const total = results.length;
    const avgScore = results.reduce((sum, r) => sum + r.verdict.media, 0) / total;

    console.log(`📊 Resultado: ${passed}/${total} conversas passaram (threshold: ${config.passThreshold})`);
    console.log(`📊 Score médio: ${avgScore.toFixed(2)}`);

    // Separar resultados por tipo
    const conversationalResults = results.filter(r => !isTechnicalScenario(r.persona.scenario));
    const technicalResults = results.filter(r => isTechnicalScenario(r.persona.scenario));

    if (technicalResults.length > 0) {
      const techPassed = technicalResults.filter(r => r.verdict.pass).length;
      console.log(`📊 Técnicos: ${techPassed}/${technicalResults.length} passaram`);
    }

    if (conversationalResults.length > 0) {
      const convPassed = conversationalResults.filter(r => r.verdict.pass).length;
      const convAvg = conversationalResults.reduce((sum, r) => sum + r.verdict.media, 0) / conversationalResults.length;
      console.log(`📊 Conversacionais: ${convPassed}/${conversationalResults.length} passaram (média: ${convAvg.toFixed(2)})`);
    }

    // Problemas encontrados
    const allProblems = results.flatMap(r => r.verdict.problemas);
    if (allProblems.length > 0) {
      console.log('');
      console.log('⚠️  Problemas encontrados:');
      [...new Set(allProblems)].forEach(p => console.log(`   • ${p}`));
    }

    // Conversas que falharam (resumo)
    const failed = results.filter(r => !r.verdict.pass);
    if (failed.length > 0) {
      console.log('');
      console.log('❌ Personas que falharam:');
      for (const f of failed) {
        console.log(`   • [${f.persona.name}] (${f.persona.scenario}) — ${f.verdict.razao}`);
      }
    }

    console.log('');
    console.log('═'.repeat(100));

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

    // Exit code
    const allPassed = passed === total;
    process.exit(allPassed ? 0 : 1);
  } else {
    console.log('   Nenhuma persona foi executada.');
    await closeDb();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
