/**
 * Gerador de relatório do teste de carga.
 * Produz markdown formatado com tabelas, limites e recomendações.
 */

export interface LevelResult {
  concurrency: number;
  total: number;
  success: number;
  failed: number;
  rateLimited: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  tokensUsed: number;
}

export interface LoadTestResult {
  provider: string;
  available: boolean;
  levels: LevelResult[];
  maxSafeConcurrency: number;
  rateLimitHitAt: number | null;
  avgTokensPerCall: number;
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function estimateCapacity(maxConcurrency: number, avgLatencyMs: number, tokensPerCall: number): {
  requestsPerMinute: number;
  usersSupported: number;
  costPerDay: string;
} {
  // RPM = (concurrency * 60000) / avgLatency
  const rpm = avgLatencyMs > 0 ? Math.round((maxConcurrency * 60000) / avgLatencyMs) : 0;
  // Cada dono gera ~10 interações/dia, pico de ~3 simultâneas por dono
  const usersSupported = Math.max(1, Math.floor(maxConcurrency / 3));
  // Custo diário (100 chamadas/dia com 10 donos)
  const tokensPerDay = rpm > 0 ? tokensPerCall * 100 : 0;
  const costPerDay = `~R$${((tokensPerDay / 1_000_000) * 0.14 * 5.5).toFixed(2)}`;

  return { requestsPerMinute: rpm, usersSupported, costPerDay };
}

export function generateReport(results: LoadTestResult[], concurrencyLevels: number[]): string {
  const lines: string[] = [];

  lines.push(`# Limites de IA — Teste de Carga`);
  lines.push('');
  lines.push(`**Data:** ${formatDate()}`);
  lines.push(`**Prompt simulado:** ~330 tokens (system + user + resposta)`);
  lines.push(`**Níveis testados:** ${concurrencyLevels.join(', ')} chamadas simultâneas`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Tabela resumo
  lines.push('## Resumo');
  lines.push('');
  lines.push('| Provider | Disponível | Limite Seguro | Rate Limit em | Latência Média | Tokens/Chamada |');
  lines.push('|----------|-----------|---------------|---------------|----------------|----------------|');

  for (const result of results) {
    if (!result.available) {
      lines.push(`| ${result.provider} | ❌ Sem key | — | — | — | — |`);
      continue;
    }
    const avgLatency = result.levels.length > 0
      ? Math.round(result.levels.reduce((s, l) => s + l.avgLatencyMs, 0) / result.levels.length)
      : 0;
    lines.push(`| ${result.provider} | ✅ | ${result.maxSafeConcurrency} simultâneas | ${result.rateLimitHitAt || 'Não atingido'} | ${avgLatency}ms | ${result.avgTokensPerCall} |`);
  }
  lines.push('');

  // Capacidade estimada
  lines.push('## Capacidade Estimada para o Beta');
  lines.push('');
  lines.push('| Provider | RPM estimado | Donos suportados | Custo/dia (10 donos) |');
  lines.push('|----------|-------------|-----------------|---------------------|');

  for (const result of results) {
    if (!result.available || result.levels.length === 0) continue;
    const avgLatency = result.levels.reduce((s, l) => s + l.avgLatencyMs, 0) / result.levels.length;
    const cap = estimateCapacity(result.maxSafeConcurrency, avgLatency, result.avgTokensPerCall);
    lines.push(`| ${result.provider} | ${cap.requestsPerMinute} | ~${cap.usersSupported} | ${cap.costPerDay} |`);
  }
  lines.push('');

  // Detalhes por provider
  lines.push('## Detalhes por Provider');
  lines.push('');

  for (const result of results) {
    if (!result.available || result.levels.length === 0) continue;

    lines.push(`### ${result.provider}`);
    lines.push('');
    lines.push('| Concorrência | Sucesso | Falhas | Rate Limited | Latência Avg | Latência P95 | Tokens |');
    lines.push('|-------------|---------|--------|-------------|-------------|-------------|--------|');

    for (const level of result.levels) {
      const status = level.rateLimited > 0 ? '⚠️' : '';
      lines.push(`| ${level.concurrency} ${status} | ${level.success}/${level.total} | ${level.failed} | ${level.rateLimited} | ${level.avgLatencyMs}ms | ${level.p95LatencyMs}ms | ${level.tokensUsed} |`);
    }
    lines.push('');
  }

  // Recomendações
  lines.push('## Recomendações');
  lines.push('');

  const available = results.filter(r => r.available && r.levels.length > 0);
  const bestProvider = available.sort((a, b) => b.maxSafeConcurrency - a.maxSafeConcurrency)[0];
  const chain = results.find(r => r.provider.includes('Fallback'));

  if (bestProvider) {
    lines.push(`- **Provider primário recomendado:** ${bestProvider.provider} (${bestProvider.maxSafeConcurrency} chamadas simultâneas sem rate limit)`);
  }
  if (chain) {
    lines.push(`- **Fallback chain:** suporta ${chain.maxSafeConcurrency} chamadas simultâneas (resiliência se 1 provider cair)`);
  }

  lines.push('');
  lines.push('### Cenários de degradação');
  lines.push('');
  lines.push('| Cenário | Capacidade | Ação necessária |');
  lines.push('|---------|-----------|-----------------|');

  if (available.length >= 2) {
    lines.push(`| Todos operantes | ${chain?.maxSafeConcurrency || bestProvider?.maxSafeConcurrency} simultâneas | Nenhuma |`);
    lines.push(`| Só ${available[0]?.provider.split(' ')[0]} | ${available[0]?.maxSafeConcurrency} simultâneas | Monitorar, sem urgência |`);
    if (available[1]) {
      lines.push(`| Só ${available[1]?.provider.split(' ')[0]} | ${available[1]?.maxSafeConcurrency} simultâneas | Verificar provider primário |`);
    }
  }
  lines.push(`| Todos fora | 0 | 🚨 Alerta crítico — Cleo inoperante |`);
  lines.push('');

  // Limites conhecidos dos free tiers
  lines.push('## Limites Documentados dos Free Tiers (referência)');
  lines.push('');
  lines.push('| Provider | TPM | RPM | Limite diário | Observação |');
  lines.push('|----------|-----|-----|---------------|-----------|');
  lines.push('| Groq Free | 8.000 | 30 | ~500k tokens | Descontinua modelos sem aviso |');
  lines.push('| Groq Dev Tier | 30.000 | 60 | ~5M tokens | Upgrade grátis no painel |');
  lines.push('| DeepSeek Free Grant | Sem limite rígido | 50 | 5M tokens (grant) | Mais estável para produção |');
  lines.push('| DeepSeek Pago | Sem limite | 500 | Ilimitado | $0.14/1M input, $0.28/1M output |');
  lines.push('| Gemini Free | 15.000 | 15 | 1.5M tokens | Rate limit muito restritivo |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`> Gerado automaticamente por \`tests/load-ai/run.ts\` em ${new Date().toISOString()}`);

  return lines.join('\n');
}
