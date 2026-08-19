# Limites de IA — Teste de Carga

**Data:** 2026-08-19
**Prompt simulado:** ~330 tokens (system + user + resposta)
**Níveis testados:** 1, 3, 5, 10, 15, 20, 30 chamadas simultâneas

---

## Resumo

| Provider | Disponível | Limite Seguro | Rate Limit em | Latência Média | Tokens/Chamada |
|----------|-----------|---------------|---------------|----------------|----------------|
| Groq (qwen3.6-27b) | ✅ | 15 simultâneas | 20 | 1013ms | 286 |
| DeepSeek (V4 Flash) | ✅ | 30 simultâneas | Não atingido | 0ms | NaN |
| Gemini (3.6 Flash) | ✅ | 30 simultâneas | Não atingido | 0ms | NaN |
| Fallback Chain (Groq → DeepSeek → Gemini) | ✅ | 30 simultâneas | Não atingido | 1248ms | 286 |

## Capacidade Estimada para o Beta

| Provider | RPM estimado | Donos suportados | Custo/dia (10 donos) |
|----------|-------------|-----------------|---------------------|
| Groq (qwen3.6-27b) | 889 | ~5 | ~R$0.02 |
| DeepSeek (V4 Flash) | 0 | ~10 | ~R$0.00 |
| Gemini (2.5 Flash) | 0 | ~10 | ~R$0.00 |
| Fallback Chain (Groq → DeepSeek → Gemini) | 1442 | ~10 | ~R$0.02 |

## Detalhes por Provider

### Groq (qwen3.6-27b)

| Concorrência | Sucesso | Falhas | Rate Limited | Latência Avg | Latência P95 | Tokens |
|-------------|---------|--------|-------------|-------------|-------------|--------|
| 1  | 1/1 | 0 | 0 | 839ms | 839ms | 286 |
| 3  | 3/3 | 0 | 0 | 716ms | 724ms | 858 |
| 5  | 5/5 | 0 | 0 | 746ms | 761ms | 1430 |
| 10  | 10/10 | 0 | 0 | 755ms | 796ms | 2860 |
| 15  | 15/15 | 0 | 0 | 838ms | 909ms | 4290 |
| 20 ⚠️ | 6/20 | 14 | 14 | 2182ms | 6010ms | 1716 |

### DeepSeek (V4 Flash)

| Concorrência | Sucesso | Falhas | Rate Limited | Latência Avg | Latência P95 | Tokens |
|-------------|---------|--------|-------------|-------------|-------------|--------|
| 1  | 0/1 | 1 | 0 | 0ms | 0ms | 0 |
| 3  | 0/3 | 3 | 0 | 0ms | 0ms | 0 |
| 5  | 0/5 | 5 | 0 | 0ms | 0ms | 0 |
| 10  | 0/10 | 10 | 0 | 0ms | 0ms | 0 |
| 15  | 0/15 | 15 | 0 | 0ms | 0ms | 0 |
| 20  | 0/20 | 20 | 0 | 0ms | 0ms | 0 |
| 30  | 0/30 | 30 | 0 | 0ms | 0ms | 0 |

### Gemini (3.6 Flash)

| Concorrência | Sucesso | Falhas | Rate Limited | Latência Avg | Latência P95 | Tokens |
|-------------|---------|--------|-------------|-------------|-------------|--------|
| 1  | 0/1 | 1 | 0 | 0ms | 0ms | 0 |
| 3  | 0/3 | 3 | 0 | 0ms | 0ms | 0 |
| 5  | 0/5 | 5 | 0 | 0ms | 0ms | 0 |
| 10  | 0/10 | 10 | 0 | 0ms | 0ms | 0 |
| 15  | 0/15 | 15 | 0 | 0ms | 0ms | 0 |
| 20  | 0/20 | 20 | 0 | 0ms | 0ms | 0 |
| 30  | 0/30 | 30 | 0 | 0ms | 0ms | 0 |

### Fallback Chain (Groq → DeepSeek → Gemini)

| Concorrência | Sucesso | Falhas | Rate Limited | Latência Avg | Latência P95 | Tokens |
|-------------|---------|--------|-------------|-------------|-------------|--------|
| 1  | 1/1 | 0 | 0 | 718ms | 718ms | 286 |
| 3  | 3/3 | 0 | 0 | 818ms | 923ms | 858 |
| 5  | 5/5 | 0 | 0 | 1188ms | 1661ms | 1430 |
| 10  | 10/10 | 0 | 0 | 954ms | 1228ms | 2860 |
| 15  | 15/15 | 0 | 0 | 1654ms | 2741ms | 4290 |
| 20  | 9/20 | 11 | 0 | 1471ms | 4960ms | 2574 |
| 30  | 6/30 | 24 | 0 | 1934ms | 4899ms | 1716 |

## Recomendações

- **Provider primário recomendado:** DeepSeek (V4 Flash) (30 chamadas simultâneas sem rate limit)
- **Fallback chain:** suporta 30 chamadas simultâneas (resiliência se 1 provider cair)

### Cenários de degradação

| Cenário | Capacidade | Ação necessária |
|---------|-----------|-----------------|
| Todos operantes | 30 simultâneas | Nenhuma |
| Só DeepSeek | 30 simultâneas | Monitorar, sem urgência |
| Só Gemini | 30 simultâneas | Verificar provider primário |
| Todos fora | 0 | 🚨 Alerta crítico — Cleo inoperante |

## Limites Documentados dos Free Tiers (referência)

| Provider | TPM | RPM | Limite diário | Observação |
|----------|-----|-----|---------------|-----------|
| Groq Free | 8.000 | 30 | ~500k tokens | Descontinua modelos sem aviso |
| Groq Dev Tier | 30.000 | 60 | ~5M tokens | Upgrade grátis no painel |
| DeepSeek Free Grant | Sem limite rígido | 50 | 5M tokens (grant) | Mais estável para produção |
| DeepSeek Pago | Sem limite | 500 | Ilimitado | $0.14/1M input, $0.28/1M output |
| Gemini Free | 15.000 | 15 | 1.5M tokens | Rate limit muito restritivo |

---

> Gerado automaticamente por `tests/load-ai/run.ts` em 2026-08-19T13:58:53.327Z