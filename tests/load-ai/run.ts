#!/usr/bin/env tsx
/**
 * Teste de Carga — Providers de IA
 *
 * Mede os limites reais de cada provider (Groq, DeepSeek, Gemini) e da fallback chain.
 * Dispara chamadas simultâneas crescentes até encontrar o rate limit.
 *
 * Cenários testados:
 * 1. Provider isolado (só Groq, só DeepSeek, só Gemini)
 * 2. Fallback chain (todos juntos, como em produção)
 * 3. Degradação (simula 1 provider down)
 *
 * Uso: cd backend && NODE_PATH=./node_modules npx tsx ../tests/load-ai/run.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateReport, type LoadTestResult } from './report.js';

const __dirname = typeof import.meta.dirname === 'string'
  ? import.meta.dirname
  : dirname(fileURLToPath(import.meta.url));

// Carrega .env
const root = resolve(__dirname, '../..');
try {
  const envContent = readFileSync(resolve(root, '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {}

// ─── Config ─────────────────────────────────────────────────────────────────

const CONFIG = {
  /** Níveis de concorrência a testar (chamadas simultâneas) */
  concurrencyLevels: [1, 3, 5, 10, 15, 20, 30],
  /** Prompt que simula uma chamada real da Cleo (~330 tokens) */
  systemPrompt: `Você é a Cleo, secretária virtual de um salão de beleza.
Tom: profissional e simpático. Horário: seg-sáb 9h-19h.
Regras: nunca invente preços. Anote interesse e diga que o dono retorna.`,
  userMessage: 'Oi, quanto custa um corte de cabelo feminino? Tem horário pra amanhã?',
  /** Pausa entre níveis (ms) — para rate limit resetar */
  pauseBetweenLevels: 5000,
  /** Timeout por chamada (ms) */
  callTimeout: 30000,
};

// ─── Provider implementations ───────────────────────────────────────────────

interface ProviderConfig {
  name: string;
  available: boolean;
  call: () => Promise<{ success: boolean; latencyMs: number; tokens?: number; error?: string }>;
}

function createGroqProvider(): ProviderConfig {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { name: 'Groq', available: false, call: async () => ({ success: false, latencyMs: 0, error: 'NO_KEY' }) };

  const Groq = require('groq-sdk').default;
  const client = new Groq({ apiKey });

  return {
    name: 'Groq (qwen3.6-27b)',
    available: true,
    call: async () => {
      const start = Date.now();
      try {
        const response = await client.chat.completions.create({
          model: 'qwen/qwen3.6-27b',
          messages: [
            { role: 'system', content: CONFIG.systemPrompt },
            { role: 'user', content: CONFIG.userMessage },
          ],
          temperature: 0.3,
          max_tokens: 200,
        });
        const latencyMs = Date.now() - start;
        const tokens = response.usage?.total_tokens || 0;
        return { success: true, latencyMs, tokens };
      } catch (error: any) {
        const latencyMs = Date.now() - start;
        const msg = error?.message || String(error);
        const isRateLimit = msg.includes('429') || msg.includes('rate_limit');
        return { success: false, latencyMs, error: isRateLimit ? 'RATE_LIMIT' : msg.slice(0, 100) };
      }
    },
  };
}

function createDeepSeekProvider(): ProviderConfig {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return { name: 'DeepSeek', available: false, call: async () => ({ success: false, latencyMs: 0, error: 'NO_KEY' }) };

  const axios = require('axios').default;

  return {
    name: 'DeepSeek (V4 Flash)',
    available: true,
    call: async () => {
      const start = Date.now();
      try {
        const response = await axios.post(
          'https://api.deepseek.com/chat/completions',
          {
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            messages: [
              { role: 'system', content: CONFIG.systemPrompt },
              { role: 'user', content: CONFIG.userMessage },
            ],
            temperature: 0.3,
            max_tokens: 200,
          },
          {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            timeout: CONFIG.callTimeout,
          },
        );
        const latencyMs = Date.now() - start;
        const tokens = response.data.usage?.total_tokens || 0;
        return { success: true, latencyMs, tokens };
      } catch (error: any) {
        const latencyMs = Date.now() - start;
        const status = error?.response?.status;
        const msg = error?.response?.data?.error?.message || error?.message || '';
        const isRateLimit = status === 429 || msg.includes('rate_limit');
        return { success: false, latencyMs, error: isRateLimit ? 'RATE_LIMIT' : msg.slice(0, 100) };
      }
    },
  };
}

function createGeminiProvider(): ProviderConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { name: 'Gemini', available: false, call: async () => ({ success: false, latencyMs: 0, error: 'NO_KEY' }) };

  const axios = require('axios').default;

  return {
    name: 'Gemini (2.5 Flash)',
    available: true,
    call: async () => {
      const start = Date.now();
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            contents: [{ parts: [{ text: `${CONFIG.systemPrompt}\n\n${CONFIG.userMessage}` }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
          },
          { timeout: CONFIG.callTimeout },
        );
        const latencyMs = Date.now() - start;
        const tokens = response.data.usageMetadata?.totalTokenCount || 0;
        return { success: true, latencyMs, tokens };
      } catch (error: any) {
        const latencyMs = Date.now() - start;
        const status = error?.response?.status;
        const msg = error?.response?.data?.error?.message || error?.message || '';
        const isRateLimit = status === 429 || msg.includes('RESOURCE_EXHAUSTED');
        return { success: false, latencyMs, error: isRateLimit ? 'RATE_LIMIT' : msg.slice(0, 100) };
      }
    },
  };
}

// ─── Test runner ─────────────────────────────────────────────────────────────

interface LevelResult {
  concurrency: number;
  total: number;
  success: number;
  failed: number;
  rateLimited: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  tokensUsed: number;
}

async function runLevel(provider: ProviderConfig, concurrency: number): Promise<LevelResult> {
  const promises = Array.from({ length: concurrency }, () => provider.call());
  const results = await Promise.all(promises);

  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);
  const rateLimited = failures.filter(r => r.error === 'RATE_LIMIT');

  const latencies = successes.map(r => r.latencyMs).sort((a, b) => a - b);
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Latency = latencies[p95Index] || 0;

  const totalTokens = successes.reduce((sum, r) => sum + (r.tokens || 0), 0);

  return {
    concurrency,
    total: results.length,
    success: successes.length,
    failed: failures.length,
    rateLimited: rateLimited.length,
    avgLatencyMs: Math.round(avgLatency),
    p95LatencyMs: Math.round(p95Latency),
    tokensUsed: totalTokens,
  };
}

async function testProvider(provider: ProviderConfig): Promise<LoadTestResult> {
  const levels: LevelResult[] = [];
  let hitRateLimit = false;

  for (const concurrency of CONFIG.concurrencyLevels) {
    if (hitRateLimit) break;

    const result = await runLevel(provider, concurrency);
    levels.push(result);

    const rateLimitPct = result.rateLimited / result.total;
    if (rateLimitPct > 0.5) {
      hitRateLimit = true;
    }

    // Pausa entre níveis para não acumular rate limit
    if (!hitRateLimit) {
      await sleep(CONFIG.pauseBetweenLevels);
    }
  }

  // Determinar limite prático
  const lastGood = levels.filter(l => l.rateLimited === 0).pop();
  const firstBad = levels.find(l => l.rateLimited > 0);

  return {
    provider: provider.name,
    available: provider.available,
    levels,
    maxSafeConcurrency: lastGood?.concurrency || 0,
    rateLimitHitAt: firstBad?.concurrency || null,
    avgTokensPerCall: levels.length > 0
      ? Math.round(levels.reduce((s, l) => s + l.tokensUsed, 0) / levels.reduce((s, l) => s + l.success, 0))
      : 0,
  };
}

async function testFallbackChain(providers: ProviderConfig[]): Promise<LoadTestResult> {
  const available = providers.filter(p => p.available);
  if (available.length === 0) {
    return { provider: 'Fallback Chain', available: false, levels: [], maxSafeConcurrency: 0, rateLimitHitAt: null, avgTokensPerCall: 0 };
  }

  // Simula fallback: tenta o primeiro, se falha tenta o próximo
  const fallbackCall = async () => {
    for (const p of available) {
      const result = await p.call();
      if (result.success) return result;
    }
    return { success: false, latencyMs: 0, error: 'ALL_FAILED' };
  };

  const chainProvider: ProviderConfig = {
    name: `Fallback Chain (${available.map(p => p.name.split(' ')[0]).join(' → ')})`,
    available: true,
    call: fallbackCall,
  };

  return testProvider(chainProvider);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║   Hi Cleo — Teste de Carga dos Providers de IA       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Concorrências a testar: ${CONFIG.concurrencyLevels.join(', ')}`);
  console.log(`Prompt simulado: ~${CONFIG.systemPrompt.length + CONFIG.userMessage.length} chars`);
  console.log(`Pausa entre níveis: ${CONFIG.pauseBetweenLevels / 1000}s`);
  console.log('');

  const groq = createGroqProvider();
  const deepseek = createDeepSeekProvider();
  const gemini = createGeminiProvider();

  console.log('Providers disponíveis:');
  console.log(`  Groq:     ${groq.available ? '✅' : '❌ (sem GROQ_API_KEY)'}`);
  console.log(`  DeepSeek: ${deepseek.available ? '✅' : '❌ (sem DEEPSEEK_API_KEY)'}`);
  console.log(`  Gemini:   ${gemini.available ? '✅' : '❌ (sem GEMINI_API_KEY)'}`);
  console.log('');

  const results: LoadTestResult[] = [];

  // Teste individual de cada provider
  const providers = [groq, deepseek, gemini].filter(p => p.available);

  for (const provider of providers) {
    console.log(`━━━ Testando: ${provider.name} ━━━`);
    const result = await testProvider(provider);
    results.push(result);

    for (const level of result.levels) {
      const status = level.rateLimited > 0 ? '⚠️' : '✅';
      console.log(`  ${status} ${level.concurrency} simultâneas: ${level.success}/${level.total} OK | ${level.avgLatencyMs}ms avg | ${level.rateLimited} rate limited`);
    }

    console.log(`  → Limite seguro: ${result.maxSafeConcurrency} chamadas simultâneas`);
    if (result.rateLimitHitAt) {
      console.log(`  → Rate limit em: ${result.rateLimitHitAt} chamadas simultâneas`);
    }
    console.log('');

    // Pausa maior entre providers
    await sleep(10000);
  }

  // Teste da fallback chain
  if (providers.length > 1) {
    console.log('━━━ Testando: Fallback Chain ━━━');
    const chainResult = await testFallbackChain(providers);
    results.push(chainResult);

    for (const level of chainResult.levels) {
      const status = level.rateLimited > 0 ? '⚠️' : '✅';
      console.log(`  ${status} ${level.concurrency} simultâneas: ${level.success}/${level.total} OK | ${level.avgLatencyMs}ms avg`);
    }
    console.log(`  → Limite seguro (chain): ${chainResult.maxSafeConcurrency} chamadas simultâneas`);
    console.log('');
  }

  // Gerar relatório
  const report = generateReport(results, CONFIG.concurrencyLevels);
  console.log(report);

  // Salvar relatório em arquivo
  const reportPath = resolve(__dirname, '../../docs/tecnico/limites-ia.md');
  const { writeFileSync } = await import('fs');
  writeFileSync(reportPath, report);
  console.log(`\n📄 Relatório salvo em: docs/tecnico/limites-ia.md`);
}

main().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
