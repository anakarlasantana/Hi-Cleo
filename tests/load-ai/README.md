# Teste de Carga — Providers de IA

Mede os limites reais de cada provider (Groq, DeepSeek, Gemini) e da fallback chain sob carga crescente.

## O que testa

1. **Provider isolado** — dispara N chamadas simultâneas crescentes até encontrar rate limit
2. **Fallback chain** — simula o comportamento real de produção (tenta provider 1, se falha tenta o 2, etc.)
3. **Cenários de degradação** — com 1 ou 2 providers operantes

## Uso

```bash
cd backend
NODE_PATH=./node_modules npx tsx ../tests/load-ai/run.ts
```

## O que mede

- **Limite seguro** — máximo de chamadas simultâneas sem rate limit
- **Latência média e P95** — tempo de resposta sob carga
- **Tokens consumidos** — para estimar custos
- **RPM estimado** — requests por minuto que o provider aguenta
- **Donos suportados** — quantos clientes do beta o provider comporta

## Saída

Gera relatório em `docs/tecnico/limites-ia.md` com:
- Tabela resumo de limites
- Capacidade estimada para o beta
- Detalhes por nível de concorrência
- Recomendações e cenários de degradação

## Configuração

Variáveis de ambiente (usa `.env` da raiz):
- `GROQ_API_KEY` — testa Groq
- `DEEPSEEK_API_KEY` — testa DeepSeek
- `GEMINI_API_KEY` — testa Gemini

Quanto mais providers configurados, melhor o teste de fallback.

## Duração

~3-5 minutos (pausa entre níveis para rate limit resetar).

## Quando rodar

- Antes do lançamento do beta
- Após trocar de plano/tier em algum provider
- Quando adicionar novo provider à chain
- Se suspeitar de degradação de performance
