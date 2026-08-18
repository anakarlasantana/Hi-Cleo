# Teste E2E de Qualidade — Usuário Autônomo + LLM-as-Judge

Testa a Cleo de forma autônoma: uma LLM simula usuários reais conversando com a Cleo (via sistema real), e outra LLM avalia a qualidade das respostas.

## Como funciona

```
1. Lê docs do produto (regras, personalidade, fluxos)
2. Gera personas variadas via IA (zero input manual)
3. Para cada persona:
   - LLM gera mensagens como usuário real (informal, vago, com erros)
   - Envia via webhook → Cleo processa normalmente via fila
   - Coleta resposta do banco
   - LLM decide próxima mensagem ou encerra
4. LLM-as-judge avalia cada conversa em 5 dimensões
5. Gera relatório com scores e problemas
```

**Nenhum cenário é escrito na mão** — a IA gera tudo baseada nos docs.

## Uso rápido

```bash
# Pré-requisito: backend rodando com Docker
docker compose up --build -d

# Rodar (usa a mesma .env do projeto)
cd backend
npm run test:e2e:quality
```

## Configuração

Via variáveis de ambiente (ou usa defaults sensatos):

| Variável | Default | Descrição |
|----------|---------|-----------|
| `E2E_AI_PROVIDER` | `deepseek` | LLM para simular usuário e julgar (`deepseek`, `groq`, `gemini`) |
| `E2E_CONVERSATION_COUNT` | `5` | Quantas conversas autônomas gerar |
| `E2E_MAX_TURNS` | `12` | Máximo de turnos por conversa |
| `E2E_MESSAGE_DELAY` | `5000` | Delay entre msgs (ms, pro backend processar) |
| `E2E_PASS_THRESHOLD` | `0.7` | Score mínimo para passar (0.0 a 1.0) |
| `DATABASE_URL` | `postgresql://...localhost:5434...` | Conexão com o banco (para ler respostas) |

## Exemplo de saída

```
╔══════════════════════════════════════════════════════╗
║   Hi Cleo — Teste E2E de Qualidade (Autônomo)       ║
╠══════════════════════════════════════════════════════╣
║  Backend:      http://localhost:3001
║  Provider IA:  deepseek
║  Conversas:    5
║  Threshold:    0.7
╚══════════════════════════════════════════════════════╝

✅ Backend saudável
✅ AI client criado (deepseek)
📖 Lendo documentação do produto...
🎭 Gerando 5 personas via IA...
   1. Pedro Lima (onboarding) — Corretor de imóveis configurando a Cleo
   2. Ana Costa (client_message) — Cliente perguntando sobre aulas de inglês
   3. Carlos Mendes (owner_command) — Dono pedindo lista de leads
   4. Julia Santos (edge_case) — Cliente mandando msg às 23h
   5. Roberto Alves (onboarding) — Personal trainer ativando a Cleo

━━━ [1/5] Pedro Lima (onboarding) ━━━
   💬 14 turnos
   📊 Média: 0.88 ✅

━━━ [2/5] Ana Costa (client_message) ━━━
   💬 6 turnos
   📊 Média: 0.92 ✅

...

═══════════════════════════════════════════════════════
📊 Resultado: 4/5 conversas passaram (threshold: 0.7)
📊 Score médio: 0.85
═══════════════════════════════════════════════════════
```

## Dimensões avaliadas

| Dimensão | O que mede |
|----------|-----------|
| **relevancia** | Respostas fazem sentido no contexto? |
| **tom_de_voz** | Soa natural e empática? |
| **factualidade** | Inventou informações? (1.0 = não inventou) |
| **completude** | Atendeu o que o usuário precisava? |
| **naturalidade** | Respostas fluidas, não robóticas? |

## Cenários gerados automaticamente

A IA gera 4 tipos de cenários:

- **onboarding** — Dono ativando e configurando a Cleo pela primeira vez
- **client_message** — Cliente de um dono mandando mensagem para o negócio
- **owner_command** — Dono pedindo algo à Cleo (leads, follow-up, etc.)
- **edge_case** — Situações limite (fora do horário, msgs vagas, áudio)

## Arquitetura

```
tests/e2e-quality/
├── run.ts              # Orquestrador (entry point)
├── config.ts           # Configuração centralizada
├── ai-client.ts        # Cliente de IA (DeepSeek/Groq/Gemini)
├── simulator.ts        # Envia webhooks + coleta respostas do banco
├── autonomous-user.ts  # LLM que age como usuário real
├── judge.ts            # LLM que avalia qualidade das respostas
└── README.md           # Este arquivo
```

## Requisitos

- Backend rodando com Docker (`docker compose up --build`)
- Pelo menos uma chave de IA no `.env` (DEEPSEEK_API_KEY, GROQ_API_KEY ou GEMINI_API_KEY)
- Banco acessível na porta 5434 (mapeamento padrão do docker-compose.yml)
- `tsx` instalado (já é devDep do backend)

## Custo por execução

Com DeepSeek (provider padrão):
- 5 conversas × ~10 chamadas = ~50 chamadas
- Custo estimado: ~R$0,05 por execução
- Groq free tier: R$0 (com rate limit)
