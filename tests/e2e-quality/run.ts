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
 * Uso: npx tsx tests/e2e-quality/run.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { createAiClient } from './ai-client.js';
import { sendMessage, waitForResponse, startTrial, cleanupPhone, closeDb, type Turn } from './simulator.js';
import { generatePersonas, generateFirstMessage, generateNextMessage, type Persona } from './autonomous-user.js';
import { evaluateConversation, type Verdict } from './judge.js';

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
  const header = '│ Persona                          │ Cenário         │ Relev │ Tom  │ Fact │ Comp │ Nat  │ Média │ OK? │';
  const sep =    '├──────────────────────────────────┼─────────────────┼───────┼──────┼──────┼──────┼──────┼───────┼─────┤';
  const topSep = '┌──────────────────────────────────┬─────────────────┬───────┬──────┬──────┬──────┬──────┬───────┬─────┐';
  const botSep = '└──────────────────────────────────┴─────────────────┴───────┴──────┴──────┴──────┴──────┴───────┴─────┘';

  const rows = results.map(r => {
    const name = r.persona.name.slice(0, 32).padEnd(32);
    const scenario = r.persona.scenario.slice(0, 15).padEnd(15);
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

// ─── Conversa individual ────────────────────────────────────────────────────

async function runConversation(ai: ReturnType<typeof createAiClient>, persona: Persona): Promise<ConversationResult> {
  const turns: Turn[] = [];

  // Limpar dados anteriores
  await cleanupPhone(persona.phone);

  // Se é onboarding, precisa criar trial primeiro
  let activationCode: string | undefined;
  if (persona.scenario === 'onboarding') {
    try {
      activationCode = await startTrial(persona.phone, persona.name);
    } catch (error: any) {
      // Se trial falha (já existe, rate limit), tentar limpar e repetir
      await cleanupPhone(persona.phone);
      await sleep(1000);
      activationCode = await startTrial(persona.phone, persona.name);
    }
  }

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
  for (let turn = 0; turn < config.maxTurnsPerConversation - 1; turn++) {
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

  // 4. Gerar personas
  console.log(`🎭 Gerando ${config.conversationCount} personas via IA...`);
  const personas = await generatePersonas(ai, docs, config.conversationCount);
  console.log('   Personas geradas:');
  personas.forEach((p, i) => console.log(`   ${i + 1}. ${p.name} (${p.scenario}) — ${p.description}`));
  console.log('');

  // 5. Rodar conversas
  const results: ConversationResult[] = [];

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    console.log(`━━━ [${i + 1}/${personas.length}] ${persona.name} (${persona.scenario}) ━━━`);

    try {
      const result = await runConversation(ai, persona);
      results.push(result);

      // Mostrar resumo da conversa
      console.log(`   💬 ${result.turns.length} turnos`);
      console.log(`   📊 Média: ${result.verdict.media} ${result.verdict.pass ? '✅' : '❌'}`);
      if (result.verdict.problemas.length > 0) {
        result.verdict.problemas.forEach(p => console.log(`   ⚠️  ${p}`));
      }
    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
      results.push({
        persona,
        turns: [],
        verdict: {
          scores: { relevancia: 0, tom_de_voz: 0, factualidade: 0, completude: 0, naturalidade: 0 },
          media: 0,
          pass: false,
          razao: `Erro na execução: ${error.message}`,
          problemas: [error.message],
        },
      });
    }
    console.log('');
  }

  // 6. Relatório final
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('                                    RELATÓRIO FINAL');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(formatTable(results));
  console.log('');

  const passed = results.filter(r => r.verdict.pass).length;
  const total = results.length;
  const avgScore = results.reduce((sum, r) => sum + r.verdict.media, 0) / total;

  console.log(`📊 Resultado: ${passed}/${total} conversas passaram (threshold: ${config.passThreshold})`);
  console.log(`📊 Score médio: ${avgScore.toFixed(2)}`);

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
      console.log('   Transcript:');
      f.turns.slice(0, 6).forEach(t => {
        const prefix = t.role === 'user' ? '   👤' : '   🤖';
        console.log(`   ${prefix} ${t.content.slice(0, 100)}`);
      });
      if (f.turns.length > 6) console.log(`   ... (${f.turns.length - 6} turnos omitidos)`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════════════');

  // Cleanup
  await closeDb();

  // Exit code baseado no resultado
  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
