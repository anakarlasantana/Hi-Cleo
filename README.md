# Hi Cleo — Secretária Virtual por WhatsApp

CRM inteligente via WhatsApp com IA para pequenos empresários brasileiros. Responde leads automaticamente, gerencia clientes, envia follow-ups e encaminha materiais.

---

## Início Rápido (Docker)

```bash
# 1. Copie e preencha as variáveis de ambiente
cp .env.example .env

# 2. Suba tudo (backend, frontend, Redis, Evolution API, Postgres)
docker compose up --build
```

Acesse:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Evolution API Manager: http://localhost:8082

### Pré-requisitos

- Docker e Docker Compose v2+ (o PostgreSQL sobe automaticamente via Docker)
- API Key do [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)

---

## Estrutura do Projeto

```
/
├── docker-compose.yml          # Orquestra todos os serviços (dev)
├── docker-compose.prod.yml     # Produção (VPS limpa, tudo incluso)
├── .env.example                # Template de variáveis de ambiente
├── .env                        # Variáveis reais (gitignored, symlinked)
├── backend/                    # API Express.js + TypeScript
│   ├── Dockerfile              # Multi-stage build
│   ├── src/
│   │   ├── modules/            # Módulos feature-first
│   │   ├── shared/             # Config, logger, middleware, types
│   │   ├── container.ts        # DI container
│   │   └── index.ts            # Entry point
│   └── drizzle/                # Migrations versionadas (Drizzle Kit)
├── frontend/                   # Next.js 16 + Tailwind
│   ├── Dockerfile              # Multi-stage build (standalone)
│   ├── app/                    # Pages (checkout, ativação, conexão)
│   ├── services/               # Chamadas HTTP centralizadas
│   ├── lib/                    # Utilitários (api-client, sanitize, masks)
│   └── components/             # UI components
└── docs/                       # Documentação do projeto
```

---

## Ambientes

### Desenvolvimento (local)

```bash
docker compose up --build
```

Todos os serviços sobem juntos com healthchecks e rede compartilhada.

### Produção (VPS limpa)

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Mesmo stack, com: `restart: always`, limites de CPU/RAM, portas internas fechadas, volumes persistentes.

---

## Variáveis de Ambiente

Um único `.env` na raiz governa tudo (symlinked para backend/ e frontend/).

| Seção | Variáveis principais |
|-------|---------------------|
| Backend | `DATABASE_URL`, `GEMINI_API_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` |
| Messaging | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `SECRETARY_PHONE` |
| Redis | `REDIS_HOST=redis`, `REDIS_PORT=6379` |
| Segurança | `CORS_ORIGIN`, `RATE_LIMIT_GLOBAL`, `RATE_LIMIT_PAYMENTS` |
| Frontend | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` |
| URLs | `SITE_URL`, `CHECKOUT_URL`, `WEBHOOK_URL` |

> Dentro do Docker, serviços se comunicam por hostname interno (`redis`, `evolution-api`, `backend`).

---

## Segurança

A aplicação implementa múltiplas camadas de segurança:

- Helmet.js (headers de segurança, CSP)
- CORS restrito por domínio (`CORS_ORIGIN`)
- Rate limiting: 200 req/min global na API, 5/min em pagamentos
- Payload limits: 50kb para API, 5MB para webhooks (mídia)
- Validação Zod nos controllers (tipos e formatos)
- Sanitização de inputs (prompt injection, caracteres de controle)
- Webhook Mercado Pago com validação HMAC
- Webhook Evolution com validação por secret + IP interno
- Dados pessoais mascarados nos logs (LGPD)
- Endpoint `/api/activation/generate` protegido (só chamado internamente)

---

## Conectar WhatsApp

1. Acesse http://localhost:8082/manager/login
2. Use a API Key definida em `EVOLUTION_API_KEY`
3. Crie instância com nome igual a `MONITOR_INSTANCE` (default: `secretary`)
4. Escaneie o QR code com o WhatsApp do número da secretária

---

## Scripts Úteis

| Comando | Descrição |
|---------|-----------|
| `docker compose up --build` | Sobe tudo (dev) |
| `docker compose -f docker-compose.prod.yml up -d --build` | Sobe tudo (prod) |
| `docker compose down` | Para tudo |
| `docker compose down -v` | Para tudo e limpa volumes |
| `docker compose logs -f backend` | Logs do backend |
| `cd backend && npm test` | Roda testes unitários (69 testes) |
| `cd backend && npx tsc --noEmit` | Verifica tipagem TypeScript |
| `cd backend && npm run db:generate` | Gera migrations a partir do schema |
| `cd backend && npm run db:migrate` | Aplica migrations pendentes |
| `cd backend && npm run db:push` | Sincroniza schema direto no banco (dev) |
| `cd backend && npm run db:studio` | Abre Drizzle Studio (GUI do banco) |

---

## Documentação

- [Índice da Documentação](docs/README.md) — ponto de entrada para toda a documentação
- [Backend README](backend/README.md) — arquitetura, módulos e regras de desenvolvimento

---

## Stack

| Componente | Tecnologia |
|------------|-----------|
| Backend | Express.js + TypeScript |
| Frontend | Next.js 16 + Tailwind + Radix UI |
| IA | Google Gemini (fallback Groq) |
| Banco | PostgreSQL 16 + Drizzle ORM |
| WhatsApp | Evolution API/Go (Baileys) |
| Fila | BullMQ + Redis |
| Pagamento | Mercado Pago (PIX + cartão) |
| Segurança | Helmet + express-rate-limit + Zod |
| Testes | Vitest |
