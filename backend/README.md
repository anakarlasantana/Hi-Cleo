# Hi Cleo — Backend

API do CRM WhatsApp-first com IA (Gemini), gestão de leads, pagamentos e envio de materiais.

> **Docs complementares:**
> - [Ideia do produto](../docs/ideia.md) — visão geral e modelo de negócio
> - [Débitos técnicos](../docs/debitos-tecnicos.md) — roadmap e pendências

---

## Arquitetura

**Hexagonal (Ports & Adapters)** organizada por **feature/módulo**.

Cada módulo contém:
- `*.port.ts` — Interface (contrato). Define O QUE faz, não COMO.
- `*.service.ts` — Regra de negócio. Depende apenas de ports.
- `*.repository.ts` — Persistência. Implementa o port de dados.
- `*.adapter.ts` — Integração externa. Implementa o port de comunicação.
- `*.controller.ts` — Endpoint HTTP (quando aplicável).
- `*.cron.ts` — Jobs agendados (quando aplicável).

### Princípios

1. **Feature-first** — tudo de um módulo vive junto
2. **Ports & Adapters** — services dependem de interfaces, não de implementações
3. **Container centralizado** — `container.ts` monta todas as dependências
4. **Módulos independentes** — cada módulo pode ser entendido isoladamente
5. **Fallback gracioso** — se Redis cai, processa síncrono; se Gemini falha, usa Groq

### Estrutura de pastas

```
src/
├── modules/
│   ├── activation/          # Ativação de contas via código
│   ├── assistente/          # IA — interpreta comandos (Gemini + Groq fallback)
│   ├── cancellation/        # Cancelamento de assinaturas
│   ├── connection-monitor/  # Monitora conexão WhatsApp (cron 5min)
│   ├── contact-monitor/     # Alerta de threshold de contatos
│   ├── evolution/           # Adapters WhatsApp (Evolution API + Go)
│   ├── exclusion/           # Contatos ignorados (pessoais)
│   ├── follow-up/           # Lembretes automáticos (cron)
│   ├── leads/               # Gestão de leads (CRUD + busca)
│   ├── messages/            # Histórico de mensagens + mídia
│   ├── onboarding/          # Onboarding conversacional
│   ├── payment/             # Mercado Pago (PIX/cartão)
│   ├── plans/               # Planos e preços (do banco)
│   ├── queue/               # Fila assíncrona (BullMQ)
│   ├── rules/               # Motor de regras automáticas
│   ├── subscription/        # Gestão de assinaturas
│   ├── terms/               # Aceite de termos LGPD
│   ├── invites/             # Convites para colaboradores (multi-user)
│   └── webhooks/            # Recebe eventos da Evolution API
│
├── shared/
│   ├── config/              # Env vars (Zod validation)
│   ├── logger/              # Pino (rotação diária em prod)
│   ├── middleware/          # Segurança (helmet, rate-limit, sanitize)
│   ├── ports/               # Ports globais (AiPort)
│   └── types/               # Tipos e entidades
│
├── container.ts             # Injeção de dependências
└── index.ts                 # Entry point + middleware setup
```

### Como trocar um provider

| Quer trocar... | O que fazer |
|---|---|
| Evolution API → Evolution Go | `MESSAGING_PROVIDER=evolution-go` no `.env` |
| Supabase → outro banco | Criar novo `.repository.ts` implementando o `.port.ts` |
| Gemini → OpenAI | Criar novo adapter implementando `AiPort` |
| BullMQ → RabbitMQ/SQS | Criar novo adapter implementando `QueuePort` e `WorkerPort` |
| Pino → Winston | Criar novo `logger.ts` exportando `createLogger()` |

---

## Regras de Desenvolvimento

### Nomenclatura
- Funções e variáveis: nomes descritivos, em inglês
- Prefixar transformações: `apply`, `format`, `parse`, `calculate`, `validate`
- Constantes: descrevem o que representam (`MONTHLY_INTEREST_RATE`, não `RATE`)
- Banco de dados: tabelas e colunas em inglês
- Comentários: português permitido
- Valores monetários: sempre em centavos (inteiros)

### Controllers
- Usa `Router()` do Express + importa `container` direto
- Validação de body com Zod
- Erros genéricos pro cliente, detalhes no logger
- Nunca expor `error.message` diretamente na resposta

### Services
- Recebe dependências via constructor
- Depende apenas de interfaces (ports), nunca de implementações
- Preços e configurações vêm do banco, não hardcoded

### Crons
- Exporta função `startXxxCron()` que se auto-configura
- Usa `env.MONITOR_INSTANCE` (nunca string literal `'secretary'`)
- Schedule configurável via env var

### Segurança
- Rate limiting em todas as rotas `/api/*`
- Payload limit: 50kb API, 5MB webhooks
- Sanitizar inputs antes de enviar pra IA (`sanitizeForAiPrompt`)
- Validar telefone antes de processar (`validatePhoneNumber`)
- Mascarar dados pessoais nos logs (`maskPhone`, `maskEmail`)

### Comandos da Cleo (intents reconhecidas via IA)

| Comando (linguagem natural) | Intent | Ação |
|---|---|---|
| "ajuda", "o que você faz?", "comandos" | `help` | Lista todas as capacidades por categoria |
| "mostra meus clientes", "leads" | `list_leads` | Lista leads com status 'new' |
| "clientes novos de hoje" | `leads_today` | Leads criados nas últimas 24h |
| "quem tá sem resposta?" | `no_reply` | Leads sem retorno (threshold configurável) |
| "clientes quentes" | `hot_leads` | Leads com status 'hot' |
| "como tá o João?" | `lead_status` | Ficha completa: status, última msg, tempo inativo |
| "agenda retorno pro João amanhã 14h" | `schedule_followup` | Agenda lembrete com data/hora |
| "manda material pro João" | `send_material` | Forward do último arquivo para o lead |
| "muda horário pra 8h às 20h" | `configure_rule` | Atualiza horário de atendimento |
| "ignora 11999..." | `ignore_contact` | Marca contato como pessoal |
| "quem tá ignorado?" | `list_ignored` | Lista contatos excluídos |
| "para de ignorar 11999..." | `stop_ignoring` | Remove da lista de exclusão |
| "convida 11999..." | `invite_user` | Gera convite para colaborador |
| "desconecta 11999..." | `disconnect_user` | Remove colaborador e libera slot |

---

## Fluxo de mensagens

```
WhatsApp → Evolution API → Webhook → Validação → Fila (BullMQ) → Worker
                                                                     │
                                         ┌───────────────────────────┼──────────────────┐
                                         ▼                           ▼                  ▼
                                    Secretária                  Lead novo          Follow-up
                                    (comandos)                 (auto-resp)         (lembrete)
                                         │                           │                  │
                                         ▼                           ▼                  ▼
                                    Gemini IA                   Regras auto         Cron job
                                         │                           │                  │
                                         └───────────────────────────┼──────────────────┘
                                                                     ▼
                                                              Evolution API → WhatsApp
```

### Mídia (imagem, áudio, vídeo, documento)

- Webhook extrai metadados + messageId de qualquer tipo de mídia
- Metadados salvos no banco (tipo, mime, nome do arquivo, messageId)
- Arquivo em si fica no WhatsApp (sem storage próprio)
- Forward usa o messageId original pra reenviar o arquivo real

### Resiliência

- Retry 3x com backoff (5s, 15s, 45s)
- Dead-Letter Queue para mensagens que falharam
- Fallback síncrono se Redis indisponível
- Monitor de conexão WhatsApp (5 em 5 min) — alerta admin + notifica users desconectados
- Graceful shutdown (SIGTERM/SIGINT)
- AI fallback (Gemini → Groq)
- Renovação idempotente (user existente reutilizado, não duplicado)

---

## Setup — Desenvolvimento

### Docker Compose (recomendado)

```bash
cp .env.example .env  # na raiz
docker compose up --build
```

Backend disponível em http://localhost:3001.

### Sem Docker

```bash
npm install
cp ../.env.example ../.env  # ou use o symlink existente
npm run dev
```

Precisa de Redis e Evolution API rodando separadamente.

---

## Setup — Produção

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Sobe todos os serviços numa VPS limpa com Docker. Ver [checklist completo](../docs/debitos-tecnicos.md#22-deploy-no-servidor-vps-limpa-com-docker).

---

## Endpoints

| Método | Rota | Descrição | Proteção |
|---|---|---|---|
| GET | `/health` | Health check | Nenhuma |
| POST | `/webhooks/evolution` | Webhook Evolution API | Secret + IP interno |
| POST | `/webhooks/mercadopago` | Webhook Mercado Pago | HMAC signature |
| POST | `/api/activation/generate` | Gera código ativação | Secret interno |
| GET | `/api/activation/validate/:code` | Valida código | Rate limit |
| GET | `/api/activation/plans` | Lista planos | Rate limit |
| GET | `/api/activation/qrcode/:code` | QR Code conexão | Rate limit |
| POST | `/api/payments` | Cria pagamento | Rate limit + Zod |
| GET | `/api/payments/price` | Calcula preço | Rate limit |
| GET | `/api/payments/:orderId/status` | Status pagamento | Rate limit |
| POST | `/api/cancellation/request` | Solicita cancelamento | Rate limit + ownership |

---

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Dev com hot-reload (tsx watch) |
| `npm run build` | Compila TypeScript → dist/ |
| `npm run start` | Roda build de produção |
| `npm run test` | Roda testes (vitest) |
| `npm run lint` | Lint (eslint) |

---

## Stack

| Componente | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | Tipagem forte, ecossistema, WebSocket nativo |
| Framework | Express | Simples, maduro |
| IA | Gemini (fallback Groq) | Free tier generoso |
| Banco | Supabase (PostgreSQL) | Managed, RLS, realtime |
| WhatsApp | Evolution API/Go | Open-source, gratuito |
| Fila | BullMQ + Redis | Retry, backoff, DLQ |
| Pagamento | Mercado Pago | PIX + cartão, SDK oficial |
| Logger | Pino | Performance, rotação |
| Validação | Zod | Runtime + TypeScript |
| Segurança | Helmet + express-rate-limit | Headers + throttling |
| Testes | Vitest | Rápido, compatível |
