# Guia de Setup do Backend — Secretária Virtual WhatsApp

## Visão Geral: Como as peças se conectam

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────┐
│  WhatsApp do    │◄─────►│  Evolution API    │──────►│  Backend    │
│  usuário/cliente│       │  (Docker local)   │       │  Node.js    │
└─────────────────┘       └──────────────────┘       └──────┬──────┘
                                                            │
                          ┌──────────────────┐              │
                          │  Supabase        │◄─────────────┤
                          │  (banco de dados)│              │
                          └──────────────────┘              │
                                                            │
                          ┌──────────────────┐              │
                          │  Gemini (IA)     │◄─────────────┘
                          │  Google AI       │
                          └──────────────────┘
```

### O que cada ferramenta faz:

| Ferramenta | O que é | Pra que serve | Custo |
|------------|---------|---------------|-------|
| **Node.js + Express** | Servidor backend | Recebe webhooks, processa lógica, responde mensagens | Grátis |
| **Evolution API** | Gateway WhatsApp | Conecta ao WhatsApp, envia/recebe mensagens | Grátis (open source, roda local) |
| **Supabase** | Banco de dados (PostgreSQL) | Armazena usuários, leads, mensagens, regras | Grátis (free tier) |
| **Gemini** | IA do Google | Interpreta mensagens, reconhece intenções | Grátis (free tier: 15 req/min) |
| **ngrok** | Túnel público | Expõe localhost pra internet (só em dev) | Grátis (1 túnel) |
| **Docker** | Container | Roda a Evolution API isolada | Grátis |

---

## Contas Necessárias (todas gratuitas)

1. **Supabase** — https://supabase.com (login com GitHub)
2. **Google AI Studio** — https://aistudio.google.com/apikey (login com Google)
3. **ngrok** — https://ngrok.com (só pra desenvolvimento)

---

## Variáveis de Ambiente (.env)

Copie o `.env.example` para `.env` e preencha:

```env
# Servidor
PORT=3001
NODE_ENV=development

# Supabase (Settings > API no dashboard)
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key

# Gemini (Google AI Studio > Create API Key)
GEMINI_API_KEY=sua_key

# Evolution API (local via Docker)
MESSAGING_PROVIDER=evolution-api
EVOLUTION_API_URL=http://localhost:8081
EVOLUTION_API_KEY=minha-chave-dev-local

# WhatsApp (seu número real com DDI+DDD, sem + ou espaço)
SECRETARY_PHONE=5548999999999

# Webhook (URL do ngrok + path)
WEBHOOK_URL=https://sua-url.ngrok-free.app/webhooks/evolution
```

### Onde pegar cada variável:

| Variável | Onde encontrar |
|----------|---------------|
| SUPABASE_URL | Dashboard Supabase → Settings → API → Project URL |
| SUPABASE_ANON_KEY | Dashboard Supabase → Settings → API → anon public |
| SUPABASE_SERVICE_ROLE_KEY | Dashboard Supabase → Settings → API → service_role (clica Reveal) |
| GEMINI_API_KEY | https://aistudio.google.com/apikey → Create API Key |
| EVOLUTION_API_KEY | Definida no `docker-compose.yml` (padrão: `minha-chave-dev-local`) |
| WEBHOOK_URL | URL que o ngrok gera ao rodar `ngrok http 3001` |

---

## Passo a Passo: Subir Tudo do Zero

### 1. Instalar dependências
```bash
cd backend
npm install
```

### 2. Criar tabelas no Supabase

Opção A — Via migration (recomendado):
```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npm run db:migrate
```
O `project-ref` é o ID na URL do dashboard: `https://supabase.com/dashboard/project/XXXXXXX`

Opção B — Manual:
- Abre o SQL Editor no dashboard do Supabase
- Cola o conteúdo de `backend/supabase/migrations/20260518175654_create_initial_schema.sql`
- Clica Run

### 3. Subir Evolution API (Docker)
```bash
cd backend
docker compose up -d
```
Verifica se subiu: `docker ps` (deve mostrar container `evolution-api`)

Se a porta 8080 estiver ocupada, mude no `docker-compose.yml` para 8081 e atualize o `.env`.

### 4. Subir ngrok (terminal separado)
```bash
ngrok http 3001
```
- Acesse http://localhost:4040 no navegador pra ver a URL pública
- Copie a URL e atualize `WEBHOOK_URL` no `.env`

**Importante:** Toda vez que reiniciar o ngrok, a URL muda. Precisa atualizar o `.env` e a config do webhook na Evolution API.

### 5. Subir o backend (terminal separado)
```bash
cd backend
npm run dev
```
Deve aparecer:
```
🚀 Backend rodando em http://localhost:3001
📡 Webhook URL: https://xxx.ngrok-free.app/webhooks/evolution
🤖 Messaging Provider: evolution-api
```

### 6. Criar instância WhatsApp na Evolution API
```bash
curl -X POST http://localhost:8081/instance/create \
  -H "apikey: minha-chave-dev-local" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "secretary",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true,
    "webhook": {
      "url": "SUA_WEBHOOK_URL/webhooks/evolution",
      "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
    }
  }'
```

### 7. Conectar WhatsApp via QR Code
- Acesse `http://localhost:8081/instance/connect/secretary` no navegador
- Escaneie o QR Code com o WhatsApp do número definido em `SECRETARY_PHONE`
- Pronto — a secretária está online

---

## Ordem de Inicialização (resumo rápido)

Sempre que for trabalhar no projeto:

1. `docker compose up -d` (Evolution API)
2. `ngrok http 3001` (túnel — terminal separado)
3. Atualizar `WEBHOOK_URL` no `.env` se a URL mudou
4. `npm run dev` (backend — terminal separado)

**Terminais necessários:** 2 (ngrok + backend). Docker roda em background.

---

## O que já está implementado ✅

- Webhook recebe mensagens do WhatsApp
- Criação automática de leads (contatos)
- Armazenamento de mensagens
- Onboarding conversacional (configura o usuário por chat)
- Reconhecimento de intenções (IA + fallback por keywords)
- Comandos: listar leads, leads de hoje, sem resposta, clientes quentes, ignorar/designorar contato
- Regras automáticas (boas-vindas, fora do horário)
- Follow-up automático (cron a cada hora)
- Sistema de ativação por código
- Suporte a Evolution API e Evolution Go (troca por config)

---

## O que falta implementar 🚧

### Prioridade alta (necessário pra testar o fluxo completo):

1. **Rota de conexão WhatsApp do usuário**
   - Endpoint pra gerar QR Code e verificar status
   - Arquivo sugerido: `backend/src/modules/whatsapp/whatsapp.controller.ts`
   - Precisa: criar instância na Evolution, retornar QR, salvar sessão no banco

2. **Intent: agendar_followup**
   - No `webhooks.controller.ts`, função `executeIntent`
   - Precisa: parsear data da mensagem, chamar `followUpRepo.schedule()`

### Prioridade média (funcionalidades extras):

3. **Intent: status_lead**
   - Mostrar detalhes de um lead específico (última mensagem, status, quando falou)

4. **Intent: enviar_material**
   - Criar tabela `materials` no banco
   - Implementar upload/envio de documentos/imagens

5. **Intent: configurar_regra**
   - Permitir mudar horário comercial, mensagens automáticas via chat

### Prioridade baixa (melhorias):

6. **RPC `get_leads_sem_resposta`** no Supabase
   - Stored procedure pra query otimizada (já tem fallback funcionando)

7. **Tratamento de áudio**
   - O tipo `WebhookPayload` já prevê `audioMessage`, mas não processa ainda

---

## Estrutura de Pastas

```
backend/
├── src/
│   ├── index.ts              ← Servidor Express (entry point)
│   ├── container.ts          ← Injeção de dependências (conecta tudo)
│   ├── modules/
│   │   ├── activation/       ← Códigos de ativação pós-pagamento
│   │   ├── assistente/       ← IA (reconhecimento de intenções)
│   │   ├── evolution/        ← Adaptadores WhatsApp (envio/recebimento)
│   │   ├── exclusion/        ← Contatos ignorados
│   │   ├── follow-up/        ← Lembretes automáticos (cron)
│   │   ├── leads/            ← Gestão de contatos/clientes
│   │   ├── messages/         ← Histórico de mensagens
│   │   ├── onboarding/       ← Configuração inicial por conversa
│   │   ├── rules/            ← Regras automáticas (boas-vindas, etc)
│   │   └── webhooks/         ← Recebe mensagens da Evolution API
│   └── shared/
│       ├── config/           ← Configurações (env, supabase, gemini)
│       ├── database/         ← Schema SQL de referência
│       ├── ports/            ← Interfaces (contratos)
│       └── types/            ← Tipos TypeScript
├── supabase/
│   └── migrations/           ← Migrations do banco
├── docker-compose.yml        ← Evolution API
├── package.json
└── tsconfig.json
```

---

## Padrão do Código

O projeto usa **Ports & Adapters (Hexagonal Architecture)**:

- **Port** (`.port.ts`) = interface/contrato (o que precisa fazer)
- **Repository** (`.repository.ts`) = implementação do banco (Supabase)
- **Adapter** (`.adapter.ts`) = implementação de serviço externo (Evolution, Gemini)
- **Service** (`.service.ts`) = lógica de negócio
- **Controller** (`.controller.ts`) = rotas HTTP

Pra adicionar algo novo, siga esse padrão: defina a interface primeiro, implemente depois.

---

## Comandos Úteis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Roda o backend em modo desenvolvimento (hot reload) |
| `npm run build` | Compila TypeScript pra JavaScript |
| `npm run start` | Roda a versão compilada (produção) |
| `npm run db:migrate` | Aplica migrations no Supabase remoto |
| `npm run db:status` | Mostra status das migrations |
| `docker compose up -d` | Sobe Evolution API em background |
| `docker compose down` | Para Evolution API |
| `docker ps` | Lista containers rodando |
| `ngrok http 3001` | Cria túnel público pro backend |

---

## Dúvidas Comuns

**P: Toda vez que reinicio o ngrok a URL muda?**
R: Sim. No free tier a URL é aleatória. Precisa atualizar o `.env` e reconfigurar o webhook na Evolution API. Em produção isso não existe.

**P: Posso fechar o terminal do ngrok?**
R: Não enquanto estiver testando. Sem ngrok, a Evolution API não consegue enviar webhooks pro seu backend.

**P: O Docker precisa ficar rodando?**
R: Sim, a Evolution API roda dentro do Docker. Se desligar (`docker compose down`), o WhatsApp desconecta.

**P: Se eu mudar a porta da Evolution API?**
R: Atualiza em 2 lugares: `docker-compose.yml` (ports) e `.env` (EVOLUTION_API_URL).

**P: Ctrl+C mata o quê?**
R: Mata o processo do terminal onde você apertou. Backend (`npm run dev`) e ngrok morrem com Ctrl+C. Docker não — ele roda em background.
