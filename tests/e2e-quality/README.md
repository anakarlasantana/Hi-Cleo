# Teste E2E de Qualidade — Usuário Autônomo + LLM-as-Judge

Testa a Cleo de forma autônoma: uma LLM simula usuários reais conversando com a Cleo (via sistema real), e outra LLM avalia a qualidade das respostas.

## Como funciona

```
1. Lê docs do produto (regras, personalidade, arquitetura)
2. Gera personas variadas via IA (zero input manual)
3. Para cada persona:
   - LLM gera mensagens como usuário real (informal, vago, com erros)
   - Envia via webhook → Cleo processa normalmente via fila
   - Coleta resposta do banco
   - LLM decide próxima mensagem ou encerra
4. LLM-as-judge avalia cada conversa em 5-6 dimensões
5. Cenários técnicos são avaliados de forma determinística
6. Gera relatório com scores e problemas
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

## Cenários cobertos

### Conversacionais (avaliados por LLM-as-judge)

| Cenário | O que testa |
|---------|------------|
| `onboarding` | Dono ativando e configurando a Cleo pela primeira vez (7 steps) |
| `client_message` | Cliente de um dono mandando mensagem para o negócio |
| `owner_command` | Dono pedindo algo à Cleo (leads, follow-up, status, etc.) |
| `edge_case` | Situações limite (fora do horário, msgs vagas, áudio simulado) |
| `trial_flow` | Dono que acabou de iniciar trial e está testando limites |
| `invite_flow` | Dono convidando colaborador para conectar WhatsApp |
| `material_flow` | Dono enviando material e pedindo para reenviar a um cliente |
| `local_classifier` | Saudações simples que devem ser resolvidas sem IA |
| `configure_rules` | Dono mudando horário ou configurações via chat |
| `prospection_response` | Ex-trial respondendo mensagem de prospecção |

### Técnicos (avaliados deterministicamente)

| Cenário | O que testa |
|---------|------------|
| `payment_webhook` | Webhook do MercadoPago ativa subscription corretamente |
| `degraded_fallback` | Com IA indisponível, sistema envia resposta degradada |

## Dimensões avaliadas

### Cenários conversacionais (5 dimensões)

| Dimensão | O que mede |
|----------|-----------|
| **relevancia** | Respostas fazem sentido no contexto? |
| **tom_de_voz** | Soa natural e empática? |
| **factualidade** | Inventou informações? (1.0 = não inventou) |
| **completude** | Atendeu o que o usuário precisava? |
| **naturalidade** | Respostas fluidas, não robóticas? |

### Cenários funcionais (6 dimensões = 5 acima + 1 extra)

| Dimensão extra | O que mede |
|---------------|-----------|
| **corretude_funcional** | O sistema executou a ação corretamente? (convite criado, trial iniciado, material salvo, etc.) |

## Configuração

Via variáveis de ambiente (ou usa defaults sensatos):

| Variável | Default | Descrição |
|----------|---------|-----------|
| `E2E_AI_PROVIDER` | `deepseek` | LLM para simular usuário e julgar (`deepseek`, `groq`, `gemini`) |
| `E2E_CONVERSATION_COUNT` | `8` | Quantas conversas autônomas gerar |
| `E2E_MAX_TURNS` | `12` | Máximo de turnos por conversa |
| `E2E_MESSAGE_DELAY` | `5000` | Delay entre msgs (ms, pro backend processar) |
| `E2E_PASS_THRESHOLD` | `0.7` | Score mínimo para passar (0.0 a 1.0) |
| `DATABASE_URL` | `postgresql://...localhost:5434...` | Conexão com o banco (para ler respostas) |

## Arquitetura

```
tests/e2e-quality/
├── run.ts              # Orquestrador (entry point)
├── config.ts           # Configuração + definição de cenários
├── ai-client.ts        # Cliente de IA (DeepSeek/Groq/Gemini)
├── simulator.ts        # Envia webhooks + coleta respostas + helpers de banco
├── autonomous-user.ts  # LLM que age como usuário real
├── judge.ts            # LLM que avalia qualidade (+ avaliação determinística)
└── README.md           # Este arquivo
```

### simulator.ts — Funções disponíveis

| Função | Uso |
|--------|-----|
| `sendMessage(phone, text)` | Envia webhook na instância secretary |
| `sendMessageAsClient(instance, phone, text)` | Envia webhook como cliente do dono |
| `waitForResponse(phone, after)` | Espera resposta outbound no banco |
| `waitForSecretaryResponse(phone, after)` | Espera resposta na instância secretary |
| `startTrial(phone, name)` | Cria trial via API e retorna código |
| `createTestUser(phone, name, opts)` | Cria user direto no banco |
| `simulatePaymentWebhook(userId, planId)` | Simula webhook MercadoPago |
| `getTrialStatus(phone)` | Consulta status do trial |
| `getSubscriptionStatus(phone)` | Consulta subscription |
| `sendMaterial(phone, fileName, mimeType)` | Simula envio de documento |
| `setTrialExpired(phone)` | Marca trial como expirado |
| `setTrialResponsesUsed(phone, count)` | Seta respostas usadas |
| `markAsProspected(phone)` | Marca como contactado por prospecção |
| `getMessages(phone, limit)` | Busca últimas mensagens |
| `getFollowUps(userId)` | Consulta follow-ups agendados |
| `cleanupPhone(phone)` | Limpa dados de um telefone |
| `cleanupAll(phones)` | Limpa múltiplos telefones |
| `closeDb()` | Fecha pool de conexões |

## Requisitos

- Backend rodando com Docker (`docker compose up --build`)
- Pelo menos uma chave de IA no `.env` (DEEPSEEK_API_KEY, GROQ_API_KEY ou GEMINI_API_KEY)
- Banco acessível na porta 5434 (mapeamento padrão do docker-compose.yml)
- `tsx` instalado (já é devDep do backend)

## Custo por execução

Com DeepSeek (provider padrão):
- 8-12 conversas × ~10 chamadas = ~80-120 chamadas
- Custo estimado: ~R$0,08 por execução
- Groq free tier: R$0 (com rate limit)

## Quando rodar

- Antes de cada deploy para produção
- Após mudanças em prompts, nodes ou lógica de processamento
- Após trocar/atualizar modelos de IA
- Após mudanças no fluxo de onboarding, pagamento ou trial
- Como validação de smoke test em CI (com threshold mais baixo)
