# Hi Cleo — Secretária Virtual por WhatsApp

CRM inteligente via WhatsApp com IA para pequenos empresários brasileiros. Responde leads automaticamente, gerencia clientes e envia follow-ups.

---

## Início Rápido (Docker)

Suba toda a aplicação com um único comando:

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

- Docker e Docker Compose v2+
- Conta no [Supabase](https://supabase.com) (banco de dados)
- API Key do [Google AI Studio](https://aistudio.google.com/apikey) (Gemini)

---

## Estrutura do Projeto

```
/
├── docker-compose.yml          # Orquestra todos os serviços (dev)
├── docker-compose.prod.yml     # Override para produção
├── .env.example                # Template de variáveis de ambiente
├── backend/                    # API Express.js + TypeScript
│   ├── Dockerfile
│   └── src/
├── frontend/                   # Next.js 16 + Tailwind
│   ├── Dockerfile
│   └── app/
└── docs/                       # Documentação do projeto
```

---

## Ambientes

### Desenvolvimento (local)

```bash
docker compose up --build
```

Todos os serviços sobem juntos:
- **backend** — Express.js na porta 3001
- **frontend** — Next.js na porta 3000
- **redis** — BullMQ queue na porta 6379
- **evolution-api** — WhatsApp via Baileys na porta 8082
- **evolution-db** — PostgreSQL para Evolution na porta 5433

Healthchecks garantem que serviços só iniciam quando suas dependências estão prontas.

### Produção

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

O override de produção:
- Muda restart policy para `always`
- Remove portas internas do host (Redis, Postgres, Evolution)
- Adiciona limites de CPU e memória
- Adiciona volume persistente para Redis

---

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha. As variáveis estão organizadas em seções:

| Seção | Variáveis principais |
|-------|---------------------|
| Backend | `SUPABASE_URL`, `GEMINI_API_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` |
| Messaging | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `SECRETARY_PHONE` |
| Redis | `REDIS_HOST`, `REDIS_PORT` (dentro do Docker: `redis` e `6379`) |
| Frontend | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` |
| Evolution | `EVOLUTION_DB_USER`, `EVOLUTION_DB_PASSWORD` |

> Dentro do Docker, serviços se comunicam por hostname interno (`redis`, `evolution-api`, `backend`). Não use `localhost` nas variáveis de conexão entre serviços.

---

## Conectar WhatsApp

1. Acesse http://localhost:8082/manager/login
2. Use a API Key definida em `EVOLUTION_API_KEY`
3. Crie uma instância chamada `secretary`
4. Escaneie o QR code com o WhatsApp do número da secretária

---

## Scripts Úteis

| Comando | Descrição |
|---------|-----------|
| `docker compose up --build` | Sobe tudo (dev) |
| `docker compose down` | Para tudo |
| `docker compose down -v` | Para tudo e limpa volumes |
| `docker compose logs -f backend` | Logs do backend em tempo real |
| `docker compose ps` | Status dos containers |

### Sem Docker (desenvolvimento direto)

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

Nesse caso, suba Redis e Evolution API separadamente.

---

## Documentação

- [Débitos Técnicos](docs/debitos-tecnicos.md) — pendências e roadmap
- [Backend README](backend/README.md) — arquitetura, módulos e detalhes técnicos

---

## Stack

| Componente | Tecnologia |
|------------|-----------|
| Backend | Express.js + TypeScript |
| Frontend | Next.js 16 + Tailwind + Radix UI |
| IA | Google Gemini (com fallback Groq) |
| Banco | Supabase (PostgreSQL) |
| WhatsApp | Evolution API (Baileys) |
| Fila | BullMQ + Redis |
| Pagamento | Mercado Pago |
