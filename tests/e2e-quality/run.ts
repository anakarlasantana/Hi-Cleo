#!/usr/bin/env tsx
/**
 * Teste E2E de Qualidade — Orquestrador
 *
 * Fluxo:
 * 1. Lê docs do produto (regras, personalidade)
 * 2. Gera personas variadas automaticamente via LLM
 * 3. Para cada persona: simula conversa completa com a Cleo real
 * 4. LLM-as-judge avalia qualidade de cada conversa
 * 5. Gera relatório final
 *
 * Cenários técnicos (payment_webhook, degraded_fallback) usam
 * chamadas diretas ao simulator em vez de autonomous-user.
 *
 * Uso: npx tsx tests/e2e-quality/run.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config, type Scenario } from './config.js';
import { createAiClient } from './ai-client.js';
import {
  sendMessage,
  waitForResponse,
  startTrial,
  cleanupPhone,
  closeDb,
  createTestUser,
  simulatePaymentWebhook,
  getSubscriptionStatus,
  setTrialExpired,
  markAsProspected,
  sendMaterial,
  getMessages,
  waitForSecretaryResponse,
  cleanupAll,
  type Turn,
} from './simulator.js';
import { generatePersonas, generateFirstMessage, generateNextMessage, type Persona } from './autonomous-user.js';
import { evaluateConversation, evaluateDeterministic, isFunctionalScenario, type Verdict, type FunctionalScores } from './judge.js';

const __dirname = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

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

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConversationResult {
  persona: Persona;
  turns: Turn[];
  verdict: Verdict;
}

// ─── Cenários técnicos (sem autonomous-user) ─────────────────────────────────

/**
 * payment_webhook: Cria user com trial expirado, simula webhook de pagamento,
 * verifica se subscription ativou.
 */
async function runPaymentWebhook(persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];
  await cleanupPhone(persona.phone);

  // Setup: criar user com trial expirado
  const userId = await createTestUser(persona.phone, persona.name, {
    onboardingComplete: true,
  });

  // Expirar trial
  await setTrialExpired(persona.phone);

  // Simular webhook de pagamento
  const beforePayment = new Date();
  turns.push({ role: 'user', content: '[WEBHOOK] Pagamento aprovado MercadoPago', timestamp: beforePayment });

  await simulatePaymentWebhook(userId, 'basic');
  await sleep(config.messageDelay);

  // Verificar no banco se subscription ativou
  const subscription = await getSubscriptionStatus(persona.phone);
  const checks = [
    { label: 'Subscription criada no banco', passed: subscription !== null },
    { label: 'Status da subscription é active', passed: subscription?.status === 'active' },
    { label: 'Plan ID correto (basic)', passed: subscription?.planId === 'basic' },
  ];

  // Verificar se alguma mensagem de confirmação foi enviada
  const response = await waitForResponse(persona.phone, beforePayment);
  if (response) {
    turns.push({ role: 'assistant', content: response, timestamp: new Date() });
    checks.push({ label: 'Mensagem de confirmação enviada', passed: true });
  } else {
    checks.push({ label: 'Mensagem de confirmação enviada', passed: false });
  }

  const verdict = evaluateDeterministic('payment_webhook', checks);
  return { persona, turns, verdict };
}

/**
 * degraded_fallback: Cria user, envia mensagem e valida que ALGUMA resposta chegou.
 * Esse cenário testa o fallback quando a IA está degradada.
 */
async function runDegradedFallback(persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];
  await cleanupPhone(persona.phone);

  // Setup: criar user com onboarding completo e plano ativo
  await createTestUser(persona.phone, persona.name, {
    plan: 'basic',
    subscriptionStatus: 'active',
    onboardingComplete: true,
  });

  // Enviar mensagem simples (simula cliente)
  const testMessage = 'Oi, tudo bem? Queria saber sobre o serviço';
  const beforeSend = new Date();
  await sendMessage(persona.phone, testMessage);
  turns.push({ role: 'user', content: testMessage, timestamp: beforeSend });

  // Esperar resposta (mais tempo que o normal — fallback pode demorar)
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
  return { persona, turns, verdict };
}

// ─── Conversa individual (cenários com autonomous-user) ──────────────────────

async function runConversation(ai: ReturnType<typeof createAiClient>, persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];

  // Limpar dados anteriores
  await cleanupPhone(persona.phone);

  // Setup específico por cenário
  let activationCode: string | undefined;

  switch (persona.scenario) {
    case 'onboarding': {
      try {
        activationCode = await startTrial(persona.phone, persona.name);
      } catch (error: any) {
        await cleanupPhone(persona.phone);
        await sleep(1000);
        activationCode = await startTrial(persona.phone, persona.name);
      }
      break;
    }

    case 'trial_flow': {
      try {
        activationCode = await startTrial(persona.phone, persona.name);
      } catch (error: any) {
        await cleanupPhone(persona.phone);
        await sleep(1000);
        activationCode = await startTrial(persona.phone, persona.name);
      }
      break;
    }

    case 'invite_flow': {
      // Criar user com onboarding completo e plano ativo
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'prospection_response': {
      // Criar user, expirar trial, marcar como prospected
      await createTestUser(persona.phone, persona.name, {
        onboardingComplete: true,
      });
      await setTrialExpired(persona.phone);
      await markAsProspected(persona.phone);
      break;
    }

    case 'material_flow': {
      // Criar user completo
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      // Enviar documento antes da conversa começar
      await sendMaterial(persona.phone, 'catalogo-produtos.pdf', 'application/pdf');
      await sleep(2000); // Dar tempo pro sistema processar o documento
      break;
    }

    case 'local_classifier': {
      // Criar user completo — mensagens simples não precisam de IA
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'configure_rules': {
      // Criar user completo
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }

    case 'client_message':
    case 'owner_command':
    case 'edge_case': {
      // Cenários originais que precisam de user pré-existente
      await createTestUser(persona.phone, persona.name, {
        plan: 'basic',
        subscriptionStatus: 'active',
        onboardingComplete: true,
      });
      break;
    }
  }

  // Definir max de turnos por cenário (técnicos são mais curtos)
  const maxTurns = getMaxTurns(persona.scenario);

  // Primeira mensagem
  const firstMsg = await generateFirstMessage(ai, persona, activationCode);
  const beforeSend = new Date();
  await sendMessage(persona.phone, firstMsg);
  turns.push({ role: 'user', content: firstMsg, timestamp: beforeSend });

  // Aguarda resposta da Cleo
  await sleep(config.messageDelay);
  const firstResponse = await waitForResponse(persona.phone, beforeSend);
  if (firstResponse) {
    turns.push({ role: 'assistant', content: firstResponse, timestamp: new Date() });
  }

  // Loop de conversa (usuário autônomo decide o que mandar)
  for (let turn = 0; turn < maxTurns - 1; turn++) {
    // Gera próxima mensagem do usuário
    const nextMsg = await generateNextMessage(ai, persona, turns);
    if (!nextMsg) break; // Conversa acabou naturalmente

    const beforeNext = new Date();
    await sendMessage(persona.phone, nextMsg);
    turns.push({ role: 'user', content: nextMsg, timestamp: beforeNext });

    // Aguarda resposta
    await sleep(config.messageDelay);
    const response = await waitForResponse(persona.phone, beforeNext);
    if (response) {
      turns.push({ role: 'assistant', content: response, timestamp: new Date() });
    } else {
      // Cleo não respondeu (pode ser normal em alguns cenários)
      break;
    }
  }

  // Avaliar a conversa completa
  const verdict = await evaluateConversation(ai, persona, turns, config.passThreshold);

  return { persona, turns, verdict };
}

/** Retorna max de turnos baseado no cenário */
function getMaxTurns(scenario: Scenario): number {
  switch (scenario) {
    case 'local_classifier':
      return 2; // Saudação + resposta, fim
    case 'invite_flow':
    case 'configure_rules':
    case 'material_flow':
    case 'prospection_response':
      return 4; // Conversas curtas e objetivas
    case 'trial_flow':
      return 6;
    default:
      return config.maxTurnsPerConversation;
  }
}

/** Cenários técnicos que NÃO usam autonomous-user */
const TECHNICAL_SCENARIOS: Scenario[] = ['payment_webhook', 'degraded_fallback'];

function isTechnicalScenario(scenario: Scenario): boolean {
  return TECHNICAL_SCENARIOS.includes(scenario);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Hi Cleo — Teste E2E de Qualidade (Autônomo)       ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Backend:      ${config.baseUrl}`);
  console.log(`║  Provider IA:  ${config.aiProvider}`);
  console.log(`║  Conversas:    ${config.conversationCount}`);
  console.log(`║  Max turnos:   ${config.maxTurnsPerConversation}`);
  console.log(`║  Threshold:    ${config.passThreshold}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

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

  // 2. Criar AI client
  const ai = createAiClient();
  console.log(`✅ AI client criado (${config.aiProvider})`);

  // 3. Ler docs
  console.log('📖 Lendo documentação do produto...');
  const docs = loadDocs();
  console.log(`   ${config.docsPath.length} docs carregados (${Math.round(docs.length / 1024)}KB)`);

  // 4. Gerar personas (exclui cenários técnicos)
  console.log(`🎭 Gerando ${config.conversationCount} personas via IA...`);
  const personas = await generatePersonas(ai, docs, config.conversationCount);
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

  // 6. Rodar conversas
  const results: ConversationResult[] = [];

  for (let i = 0; i < allPersonas.length; i++) {
    const persona = allPersonas[i];
    console.log(`━━━ [${i + 1}/${allPersonas.length}] ${persona.name} (${persona.scenario}) ━━━`);

    try {
      let result: ConversationResult;

      if (persona.scenario === 'payment_webhook') {
        result = await runPaymentWebhook(persona);
      } else if (persona.scenario === 'degraded_fallback') {
        result = await runDegradedFallback(persona);
      } else {
        result = await runConversation(ai, persona);
      }

      results.push(result);

      // Mostrar resumo da conversa
      console.log(`   💬 ${result.turns.length} turnos`);
      console.log(`   📊 Média: ${result.verdict.media} ${result.verdict.pass ? '✅' : '❌'}`);
      if (result.verdict.problemas.length > 0) {
        result.verdict.problemas.forEach(p => console.log(`   ⚠️  ${p}`));
      }
    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
      const defaultScores = isFunctionalScenario(persona.scenario)
        ? { relevancia: 0, tom_de_voz: 0, factualidade: 0, completude: 0, naturalidade: 0, corretude_funcional: 0 }
        : { relevancia: 0, tom_de_voz: 0, factualidade: 0, completude: 0, naturalidade: 0 };

      results.push({
        persona,
        turns: [],
        verdict: {
          scores: defaultScores,
          media: 0,
          pass: false,
          razao: `Erro na execução: ${error.message}`,
          problemas: [error.message],
        },
      });
    }
    console.log('');
  }

  // 7. Relatório final
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('                                    RELATÓRIO FINAL');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');
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

  // Conversas que falharam (detalhes)
  const failed = results.filter(r => !r.verdict.pass);
  if (failed.length > 0) {
    console.log('');
    console.log('❌ Conversas que falharam:');
    for (const f of failed) {
      console.log(`\n   [${f.persona.name}] — ${f.verdict.razao}`);
      if (f.turns.length > 0) {
        console.log('   Transcript:');
        f.turns.slice(0, 6).forEach(t => {
          const prefix = t.role === 'user' ? '   👤' : '   🤖';
          console.log(`   ${prefix} ${t.content.slice(0, 100)}`);
        });
        if (f.turns.length > 6) console.log(`   ... (${f.turns.length - 6} turnos omitidos)`);
      }
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════════════');

  // Cleanup
  const allPhones = allPersonas.map(p => p.phone);
  await cleanupAll(allPhones);
  await closeDb();

  // Exit code baseado no resultado
  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
