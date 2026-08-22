# Teste E2E de Qualidade — Usuário Autônomo + LLM-as-Judge

Testa a Cleo de forma autônoma: uma LLM simula usuários reais conversando com a Cleo (via sistema real), e outra LLM avalia a qualidade das respostas.

**Funciona sem WhatsApp conectado** — o teste simula webhooks diretamente no backend e lê respostas do banco (padrão persist-then-dispatch).

## Como funciona

```
1. Lê docs do produto (regras, personalidade, arquitetura)
2. Carrega personas pré-geradas (ou gera via IA se não existirem)
3. Para CADA persona (uma por vez):
   a. Setup: cria user/trial/session no banco conforme cenário
   b. Simula webhook → Backend processa normalmente (fila, IA, regras)
   c. Resposta salva no banco → Teste lê e coleta
   d. LLM-as-judge avalia qualidade
   e. Se falhou → exibe erros detalhados (modo interativo: pausa para correção)
4. Cenários técnicos são avaliados de forma determinística
5. Gera relatório final com scores e problemas
```

**Nenhum cenário é escrito na mão** — a IA gera tudo baseada nos docs.

## Uso rápido

```bash
# Via Docker (recomendado — inclui banco, Redis, backend)
./tests/e2e-quality/run-e2e.sh

# Rodar apenas um cenário específico (debug)
./tests/e2e-quality/run-e2e.sh --single onboarding

# Modo local (fora do Docker)
cd backend
DATABASE_URL="postgresql://hicleo:hicleo123@localhost:5434/hicleo" \
NODE_PATH=./node_modules npx tsx ../tests/e2e-quality/run.ts

# Rodar um cenário específico localmente
NODE_PATH=./node_modules npx tsx ../tests/e2e-quality/run.ts --single client_message
```

## Flags do CLI

| Flag | Descrição |
|------|-----------|
| `--no-pause` | Modo CI/CD — roda tudo sem parar (automático em Docker) |
| `--pause-always` | Pausa após TODAS as personas (inclusive ✅), útil para inspeção |
| `--single <cenário>` | Roda apenas a persona do cenário especificado |

## Modo interativo (padrão em terminal)

Quando uma persona falha, o teste pausa e exibe:
- Scores detalhados (relevância, tom, factualidade, completude, naturalidade)
- Problemas encontrados pelo judge
- Transcript completo da conversa

Opções:
- `[c]` — Continuar para a próxima persona
- `[r]` — Re-executar (após corrigir código)
- `[q]` — Encerrar e gerar relatório parcial

## Independência do WhatsApp

O teste **não depende** do WhatsApp estar conectado:

1. **Entrada:** o teste faz POST em `/webhooks/evolution` com o mesmo payload que a Evolution API enviaria
2. **Processamento:** o backend processa normalmente (BullMQ, IA, classificação, regras)
3. **Persistência:** a resposta é salva no banco ANTES de tentar enviar via WhatsApp
4. **Leitura:** o teste lê a resposta da tabela `messages` (direction='outbound')
5. **Envio:** se a Evolution API estiver offline, o envio falha silenciosamente (resposta já persistida)

Isso é possível graças ao padrão **persist-then-dispatch** implementado no `message.processor.ts`.

## Cenários cobertos

### Conversacionais (avaliados por LLM-as-judge)

| Cenário | O que testa |
|---------|------------|
| `onboarding` | Dono ativando e configurando a Cleo pela primeira vez |
| `client_message` | Cliente de um dono mandando mensagem para o negócio |
| `owner_command` | Dono pedindo algo à Cleo (leads, follow-up, status) |
| `edge_case` | Situações limite (msgs vagas, emojis, spam) |
| `trial_flow` | Dono que acabou de iniciar trial e está testando |
| `invite_flow` | Dono convidando colaborador para conectar WhatsApp |
| `material_flow` | Dono enviando material e pedindo para reenviar |
| `local_classifier` | Saudações simples resolvidas sem IA |
| `configure_rules` | Dono mudando configurações via chat |
| `prospection_response` | Ex-trial respondendo mensagem de prospecção |

### Técnicos (avaliados deterministicamente)

| Cenário | O que testa |
|---------|------------|
| `payment_webhook` | Webhook do MercadoPago ativa subscription corretamente |
| `degraded_fallback` | Com IA indisponível, sistema envia resposta degradada |

## Dimensões avaliadas

| Dimensão | O que mede |
|----------|-----------|
| **relevancia** | Respostas fazem sentido no contexto? |
| **tom_de_voz** | Soa natural e empática? |
| **factualidade** | Inventou informações? (1.0 = não inventou) |
| **completude** | Atendeu o que o usuário precisava? |
| **naturalidade** | Respostas fluidas, não robóticas? |
| **corretude_funcional** | (cenários funcionais) Ação executada corretamente? |

## Configuração

| Variável | Default | Descrição |
|----------|---------|-----------|
| `E2E_PERSONA_PROVIDER` | `ollama` | LLM para simular usuário (`ollama`, `deepseek`, `groq`, `gemini`) |
| `E2E_JUDGE_PROVIDER` | `ollama` | LLM para julgar (`ollama`, `deepseek`, `groq`, `gemini`) |
| `E2E_CONVERSATION_COUNT` | `5` | Quantas conversas autônomas gerar |
| `E2E_MAX_TURNS` | `12` | Máximo de turnos por conversa |
| `E2E_MESSAGE_DELAY` | `8000` | Delay entre msgs (ms, inclui rate limiter) |
| `E2E_PASS_THRESHOLD` | `0.7` | Score mínimo para passar (0.0 a 1.0) |
| `E2E_OLLAMA_MODEL` | `qwen3:8b` | Modelo Ollama para personas e judge |
| `DATABASE_URL` | `postgresql://...localhost:5434...` | Conexão com o banco |

## Arquitetura

```
tests/e2e-quality/
├── run.ts              # Orquestrador (persona-por-persona)
├── config.ts           # Configuração + definição de cenários
├── ai-client.ts        # Cliente de IA (Ollama/DeepSeek/Groq/Gemini)
├── simulator.ts        # Webhooks + coleta de respostas do banco
├── autonomous-user.ts  # LLM que age como usuário real
├── judge.ts            # LLM que avalia qualidade + avaliação determinística
├── personas.json       # Personas pré-geradas (evita geração via IA)
├── Dockerfile          # Container para rodar via Docker Compose
├── run-e2e.sh          # Script wrapper (verifica deps + roda)
└── README.md           # Este arquivo
```

## Requisitos

- **Backend rodando** com Docker (`docker compose up --build -d`)
- **Ollama rodando** localmente (`ollama serve` + `ollama pull qwen3:8b`)
- **Banco acessível** na porta 5434 (mapeamento padrão do docker-compose)
- WhatsApp **NÃO é necessário** (respostas são lidas do banco)

## Rate Limiter de Saída

O backend inclui um rate limiter anti-ban do WhatsApp (ver `docs/tecnico/whatsapp-anti-ban.md`):
- Máx 25 msgs/hora por instância
- Delay variável 2-5s entre envios
- O `E2E_MESSAGE_DELAY` de 8s já considera esse delay extra

Para desabilitar durante testes (se necessário):
```env
WA_RATE_LIMIT_PER_HOUR=9999
WA_MIN_DELAY_MS=0
WA_MAX_DELAY_MS=0
```

## Custo por execução

| Provider | Custo estimado |
|----------|---------------|
| Ollama (local) | R$0 (grátis, sem rate limit) |
| DeepSeek | ~R$0,08 por execução |
| Groq free tier | R$0 (com rate limit) |

## Quando rodar

- Antes de cada deploy para produção
- Após mudanças em prompts, nodes ou lógica de processamento
- Após trocar/atualizar modelos de IA
- Após mudanças no fluxo de onboarding, pagamento ou trial
- Como smoke test em CI (`--no-pause` + threshold mais baixo)
