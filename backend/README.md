# WhatsApp-first CRM — Backend

CRM inteligente via WhatsApp com IA (Gemini), regras automáticas e gestão de leads para pequenos empresários brasileiros.

> **Documentação complementar:**
> - [Ideia do produto](../docs/ideia.md) — visão geral, público-alvo e modelo de negócio
> - [Guia de setup detalhado](../docs/guia-setup-backend.md) — passo a passo completo com explicações

---

## O que é

Uma secretária virtual por WhatsApp que:
- Responde automaticamente leads de clientes usando IA (Gemini)
- Gerencia o ciclo de vida dos leads (novo, quente, convertido)
- Envia lembretes de follow-up para o dono do negócio
- Permite comandos por WhatsApp ("quem tá sem resposta?", "mostra meus clientes")

---

## Arquitetura

O projeto usa **Arquitetura Hexagonal (Ports & Adapters)** organizada por **feature/módulo**.

Cada módulo contém:
- `*.port.ts` — Interface (contrato). Define O QUE o módulo faz, não COMO.
- `*.service.ts` — Regra de negócio. Depende apenas de ports.
- `*.repository.ts` — Persistência. Implementa o port de dados.
- `*.adapter.ts` — Integração externa. Implementa o port de comunicação.
- `*.controller.ts` — Endpoint HTTP (quando aplicável).
- `*.cron.ts` — Jobs agendados (quando aplicável).

### Por que essa arquitetura?

- **Trocar libs sem dor** — quer sair do BullMQ pro RabbitMQ? Cria um novo adapter, muda uma linha no container.
- **Testar fácil** — services dependem de interfaces, não de Supabase/Redis/Gemini reais.
- **Escalar** — cada módulo é independente, pode virar um microserviço no futuro.

### Estrutura de pastas

```
src/
├── modules/                         # Módulos (feature-first)
│   ├── activation/                  # Ativação de contas via código
│   ├── assistente/                  # IA — interpreta comandos do usuário
│   ├── connection-monitor/          # Monitora conexão WhatsApp
│   ├── evolution/                   # Comunicação WhatsApp (Evolution API)
│   ├── queue/                       # Fila de mensagens assíncrona (BullMQ)
│   ├── leads/                       # Gestão de leads
│   ├── messages/                    # Histórico de mensagens
│   ├── onboarding/                  # Onboarding conversacional
│   ├── rules/                       # Motor de regras automáticas
│   ├── exclusion/                   # Contatos ignorados (pessoais)
│   ├── follow-up/                   # Lembretes agendados (cron)
│   └── webhooks/                    # Recebe eventos da Evolution API
│
├── shared/                          # Código compartilhado
│   ├── config/                      # Variáveis de ambiente (Zod)
│   ├── logger/                      # Logger estruturado (Pino)
│   ├── ports/                       # Ports globais (AiPort)
│   ├── types/                       # Tipos e entidades
│   └── database/                    # Schema SQL
│
├── container.ts                     # Injeção de dependências
└── index.ts                         # Entry point
```

### Princípios

1. **Feature-first** — tudo de um módulo vive junto
2. **Ports & Adapters** — services dependem de interfaces, não de implementações
3. **Container centralizado** — `container.ts` monta todas as dependências
4. **Módulos independentes** — cada módulo pode ser entendido isoladamente
5. **Fallback gracioso** — se Redis cai, processa síncrono; se Gemini falha, retenta

### Como trocar um provider

| Quer trocar... | O que fazer |
|---|---|
| Evolution API → Evolution Go | `MESSAGING_PROVIDER=evolution-go` no `.env` |
| Supabase → outro banco | Criar novo `.repository.ts` implementando o `.port.ts` |
| Gemini → OpenAI | Criar novo adapter implementando `AiPort` |
| BullMQ → RabbitMQ/SQS | Criar novo adapter implementando `QueuePort` e `WorkerPort` |
| Pino → Winston | Criar novo `logger.ts` exportando `createLogger()` com mesma interface |

---

## Fluxo de mensagens

```
WhatsApp → Evolution API → Webhook → Fila (BullMQ/Redis) → Worker
                                                              │
                                          ┌───────────────────┼───────────────────┐
                                          ▼                   ▼                   ▼
                                     Secretária          Lead novo           Follow-up
                                     (comandos)         (auto-resp)         (lembrete)
                                          │                   │                   │
                                          ▼                   ▼                   ▼
                                     Gemini IA          Regras auto          Cron job
                                          │                   │                   │
                                          └───────────────────┼───────────────────┘
                                                              ▼
                                                       Evolution API → WhatsApp
```

### Resiliência

- **Retry automático** — se Gemini/Evolution falhar, retenta 3x com backoff (5s, 15s, 45s)
- **Dead-Letter Queue** — mensagens que falharam 3x ficam salvas para análise
- **Fallback síncrono** — se Redis cair, processa direto (sem fila)
- **Monitor de conexão** — verifica WhatsApp a cada 5 min, alerta se desconectar
- **Graceful shutdown** — SIGTERM/SIGINT espera job atual terminar

---

## Setup — Desenvolvimento

### Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Conta no [Supabase](https://supabase.com)
- API Key do [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)
- [ngrok](https://ngrok.com) (para expor webhook localmente)

### Passo a passo

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Preencha os valores no .env (ver seção Variáveis de Ambiente)

# 3. Subir infraestrutura (Evolution API + Redis + Postgres)
docker compose up -d

# 4. Criar tabelas no Supabase
# Copie o conteúdo de src/shared/database/schema.sql
# Cole no Supabase → SQL Editor → Run

# 5. Expor webhook com ngrok (em outro terminal)
ngrok http 3001
# Copie a URL gerada e coloque em WEBHOOK_URL no .env

# 6. Conectar WhatsApp
# Acesse http://localhost:8082/manager/login
# API Key: valor de EVOLUTION_API_KEY no .env
# Crie instância "secretary" → escaneie QR code

# 7. Rodar backend
npm run dev
```

### Docker Compose (infraestrutura local)

O `docker-compose.yml` sobe:
- **evolution-api** — WhatsApp via Baileys (porta 8082)
- **evolution-db** — Postgres para Evolution API (porta 5433)
- **evolution-redis** — Redis para cache e filas (porta 6379)

### Testando

1. Peça para alguém mandar mensagem no número conectado
2. Acompanhe os logs no terminal (Pino formatado com cores)
3. O bot responde automaticamente

---

## Setup — Produção

### Infraestrutura necessária

| Serviço | Opções |
|---|---|
| Servidor | VPS (Hetzner, DigitalOcean) ou container (Railway, Render) |
| Banco | Supabase (já configurado) |
| Redis | Redis Cloud, ou Redis no mesmo servidor |
| WhatsApp | Evolution API no mesmo servidor (Docker) |
| DNS/SSL | Cloudflare ou Let's Encrypt |

### Checklist de deploy

1. Configurar variáveis de ambiente de produção (`NODE_ENV=production`)
2. Apontar `WEBHOOK_URL` para URL pública com HTTPS
3. Configurar `MONITOR_ADMIN_PHONE` para receber alertas
4. Garantir volume persistente para Evolution API (sessão WhatsApp)
5. Configurar restart automático dos containers (`restart: unless-stopped`)
6. Logs vão para arquivo com rotação (diária, 7 dias)

### Variáveis específicas de produção

```env
NODE_ENV=production
LOG_LEVEL=info
LOG_DIR=./logs
MONITOR_ADMIN_PHONE=5585999999999
```

---

## Variáveis de Ambiente

| Variável | Descrição | Default |
|---|---|---|
| `PORT` | Porta do servidor | 3001 |
| `NODE_ENV` | Ambiente (development/production) | development |
| `MESSAGING_PROVIDER` | `evolution-api` ou `evolution-go` | evolution-api |
| `EVOLUTION_API_URL` | URL da Evolution API | http://localhost:8082 |
| `EVOLUTION_API_KEY` | API Key da Evolution | — |
| `SUPABASE_URL` | URL do projeto Supabase | — |
| `SUPABASE_ANON_KEY` | Anon key do Supabase | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | — |
| `GEMINI_API_KEY` | API Key do Google AI | — |
| `SECRETARY_PHONE` | Número da secretária virtual | — |
| `WEBHOOK_URL` | URL pública para webhooks | — |
| `REDIS_HOST` | Host do Redis | localhost |
| `REDIS_PORT` | Porta do Redis | 6379 |
| `QUEUE_MAX_RETRIES` | Tentativas de retry por mensagem | 3 |
| `QUEUE_BACKOFF_DELAYS` | Delays de retry em ms | 5000,15000,45000 |
| `LOG_LEVEL` | Nível de log (info/warn/error/debug) | info |
| `LOG_DIR` | Diretório de logs (produção) | ./logs |
| `MONITOR_INSTANCE` | Instância WhatsApp monitorada | secretary |
| `MONITOR_ADMIN_PHONE` | Número que recebe alertas | — |

---

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Desenvolvimento com hot-reload (tsx watch) |
| `npm run build` | Compila TypeScript para dist/ |
| `npm run start` | Roda build de produção |
| `npm run test` | Roda testes (vitest) |

---

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/webhooks/evolution` | Webhook da Evolution API |
| POST | `/api/activation/generate` | Gera código de ativação |
| GET | `/api/activation/validate/:code` | Valida código |

---

## Stack

| Componente | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js + TypeScript | Ecossistema rico, tipagem forte |
| Framework | Express | Simples, maduro, extensível |
| IA | Google Gemini | Free tier generoso, boa qualidade |
| Banco | Supabase (PostgreSQL) | Managed, auth built-in, realtime |
| Mensageria | Evolution API (Baileys) | WhatsApp sem API oficial, gratuito |
| Fila | BullMQ + Redis | Retry, backoff, DLQ, alta performance |
| Logger | Pino | Mais rápido logger para Node.js |
| Validação | Zod | Schema validation com TypeScript |
| Testes | Vitest + fast-check | Rápido, property-based testing |
