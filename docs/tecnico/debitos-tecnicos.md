# Débitos Técnicos

Organizado por prioridade.

---

## ✅ CONCLUÍDOS

### 🟢 Beta funcional (2026-10-28) — P1, P2 e P3

Bugs de fluxo que impediam o uso real do sistema, corrigidos com testes de regressão.

| # | Item | Correção |
|---|------|----------|
| B1 | **Sessão WhatsApp nunca era gravada** — `whatsapp_sessions` não recebia registro ao conectar, então `findByInstance` retornava null e a Cleo não respondia a nenhum cliente | Webhook passa a tratar `connection.update` (`open` → `sessionRepo.activateSession`, `close` → `markDisconnected`); SSE do QR também persiste (idempotente). Migration `0002` cria índice único parcial em `instance_name WHERE status='active'` |
| B2 | **QR e SSE usavam instâncias diferentes** (`user-<id>-<ts>` × `activation-<code>`) — a tela nunca detectava a conexão | `shared/config/instance-name.ts` com nomes determinísticos (`user-<id>`, `invite-<token>`), usados por QR, SSE, webhook e monitor |
| B3 | **QR não criava a instância na Evolution** → `502` no primeiro acesso | Novo `MessagingPort.ensureInstance()` (getStatus → 404 ⇒ createInstance com webhook) antes do connect |
| B4 | **Dono era tratado como lead** — mensagem no próprio número gerava lead e resposta de atendimento | Guard `isOwnerMessage()` no `message.processor` + `handleOwnerMessage()` dedicado |
| B5 | **Respostas ao dono saíam pela instância `secretary`** | Agora usam a instância que recebeu a mensagem |
| B6 | **Convite do colaborador sem SSE e com nome de instância aleatório** | `GET /api/invites/:token/qrcode/status` (SSE) + `ensureInstance`; front trocado de polling para SSE |
| B7 | **`_editing` travava o onboarding** (string `'true'` vazando + `handleStep('confirm_name')` inexistente + mapa estático ignorando edição parcial) | `nextAfter()` aplica o modo edição em todos os passos; flag limpa ao voltar ao resumo |
| B8 | **`business_hours` dependia 100% da IA** — JSON válido sem campos perdia o horário | Parser local determinístico aplicado antes da IA |
| B9 | **Perfil do colaborador incompleto** (`tone_of_voice`/`target_audience` ausentes) e `businesses` criado 2x | `acceptInvite` grava perfil completo; `createBusiness` virou upsert idempotente |
| B10 | **Preços dos planos 100x errados** (seed em reais, código em centavos) → checkout cobraria R$ 0,49 | Migration `0003` normaliza seed para centavos + `plans.repository` sem `×100` |
| B11 | **Label "10% off no PIX" sem desconto** (código morto, risco CDC/CONAR) | Campo removido; PIX = preço cheio, alinhado ao doc de regras de negócio |
| B12 | **`plan_name` em texto livre** → pagamento órfão e erro em `/api/activation/slots` | Migration `0004` com FKs `payments.plan_name` e `users.plan` → `plan_limits` |
| B13 | **Preços duplicados** (landing hardcoded × banco) | `Pricing` consome `/api/activation/plans` (fallback local só se a API falhar) |
| B14 | **QR de código já usado** gerava instância órfã | `GET /activation/qrcode/:code` responde 400 para código já utilizado |

**Testes:** 124 → **165** (novos: `webhooks.controller`, `message.processor`, `invites.controller`, `price-calculator`, `plans.repository`; ampliados: `activation.controller`, `onboarding.service`).

### 🟢 Multi-intent e qualidade de resposta do dono (2026-10-28)

Encontrados rodando o **E2E de qualidade** (cenário `owner_command`, que falhava com 0.54).

| # | Problema | Correção |
|---|----------|----------|
| C1 | **Só o primeiro pedido era executado** — "ver clientes novos hoje E quem está sem resposta" respondia só a primeira parte; a dona repetia e a Cleo entrava em loop | Prompt com bloco MÚLTIPLOS PEDIDOS + `additional_intents`; `RecognizedIntent.additionalIntents`; `fallbackRecognize` passa a detectar **todos** os pedidos por keyword; `executeIntent` virou orquestrador sobre `executeSingleIntent` |
| C2 | Seções de lista **coladas** numa linha só | `sections.join` usava a string literal `\\n\\n` (sem quebra real). Trocado por separador visível `———` + títulos em negrito em cada seção |
| C3 | Seção de "sem resposta" **duplicada** | `leads_today` já cobre `no_reply`; o orquestrador executava os dois. Par `leads_today`+`no_reply` agora roda uma vez só |
| C4 | **`/comando` desconhecido** ia para a IA conversacional → resposta com brincadeira e lixo de template | Guard de slash command no `handleOwnerMessage`: explica e sugere linguagem natural |
| C5 | **Lixo de template vazado** (`"Tá de sacanagem, chefe! 😜】"`) | `stripThinkingTags` agora remove `【】「」⟨⟩`, prefixos `Reasoning:`/`Final Answer:` e colapsa espaços |

**Resultado no E2E:** `owner_command` **0.54 → 1.00** (relevância, tom, factualidade, completude e naturalidade todos 1.00).

**Testes:** 165 → **188** (`recognize-intent` +5 multi-intent, `message.processor.multi-intent` +5, `sanitize` +6, `activation.service` +3, `onboarding.service` +2, `invites.controller` +7 no pacote anterior).

### 🟢 E2E de qualidade: persona, judge e listas do dono (2026-11-02)

Encontrados rodando o **E2E de qualidade** novamente: `owner_command` caiu para **0.52** e o relatório acusou problemas que a Cleo nunca cometeu.

| # | Problema | Correção |
|---|----------|----------|
| D1 | **Uma oração virava três pedidos** — "/talvez você quer ver o status dos clientes novos hoje?" respondia "Seus clientes" + "Clientes novos de hoje" (o mesmo nome 2×) + "Qual cliente você quer saber?". O fallback por keyword casava o texto INTEIRO, e `mergeAdditional` sempre anexava esses achados à intenção da IA | `splitClauses()` (conectores `e`, `,`, `?`, `depois`, `também`): no máximo **1 pedido por oração**, escolhido por especificidade (`no_reply` › `leads_today` › `hot_leads` › `list_ignored` › `list_leads` › `lead_status`); `mergeAdditional` só completa pedidos de **outra** oração; `collapseRedundant()` colapsa `list_leads` + `leads_today` (mesma lista, headers diferentes) |
| D2 | **O dono aparecia como cliente dele mesmo** — o lead de auditoria (criado para persistir as mensagens do dono) entrava em `list_leads`/`leads_today`/`no_reply`/`hot_leads`; no E2E a única "cliente nova" era a Fernanda | `withoutOwnerLead(leads, user)` com `normalizePhone()` aplicado nas quatro consultas |
| D3 | **Persona simulada enviava lixo** — 1ª mensagem sem validação nenhuma (`"/talvez você quer ver…"`, pergunta ao bot) e retry reenviando o MESMO prompt, então o qwen3:1.7b repetia/ecoava 3× e a conversa morria em 2 turnos | `cleanPersonaMessage()` (thinking tags, prefixo de papel, aspas, comentário meta após a 1ª linha) + `rejectReason()` (comando `/algo`, eco da Cleo, repetição literal **e** paráfrase da mesma pergunta, pergunta ao bot, vazamento de raciocínio) com feedback corretivo no retry e fallback de 1ª mensagem por cenário |
| D4 | **Judge inventava citações** — reprovou a conversa citando "antes de mergulhar nos números" e "tomar café", falas que a Cleo nunca enviou (a resposta era uma lista determinística), e tratou a *descrição* da persona como lista de requisitos | Bloco "FIDELIDADE À TRANSCRIÇÃO" nos dois prompts (fonte única de verdade, citação literal, descrição é contexto) + `sanitizeJudgeProblems()` descarta problema cujo trecho entre aspas não existe na transcrição; transcript com turnos numerados |
| D5 | **Cenário `owner_command` não tinha clientes** — só o lead do próprio dono, então o teste não provava nada sobre listagem | `seedClientLeads()`: Ana (criada hoje) e Bruno (sem resposta há 3 dias) semeados no setup |
| D6 | **Onboarding repetia a apresentação** ("Prazer em te conhecer" na 2ª resposta) e avançava sem reconhecer o que o dono respondeu | `business_type` sem nova saudação; `target_audience`/`tone_of_voice`/`business_hours`/`outside_hours_behavior` devolvem o dado extraído ("Anotei: *clínica de estética* ✨") |
| D7 | **`/comando` desconhecido** só era tratado no caminho da instância própria (`handleOwnerMessage`); na instância `secretary` ia para o interpretador de intents | `unknownSlashCommandReply()` aplicado nos dois caminhos |
| D8 | **Reply conversacional do dono era stateless** — `generateConversationalReply` recebia só a mensagem atual, então a Cleo repetia a mesma piada ("cadê a pizza?") e a mesma pergunta a cada mensagem vaga; e o prompt proibia qualquer oferta de ajuda, contradizendo `personalidade-cleo.md` ("Proativa — não espera ser perguntada") | Histórico das últimas 6 mensagens (`shared/utils/conversation-history.ts`, extraído do atendimento ao cliente) injetado no prompt + guarda anti-repetição (regenera 1× se a resposta for idêntica à última da Cleo) + prompt com oferta **concreta e variada** (proibido menu/repetição e recursos inexistentes). `executeIntent` passa o `leadId` para o fallback de intent desconhecida |
| D9 | **Conversa casual virava consulta** — "oi, como está? hoje tá chuvoso" respondeu "📭 Clientes novos de hoje: nenhum" + small talk. A IA dizia `unknown` com confiança, e o merge por keyword anexava `leads_today`/`lead_status` por causa do "hoje"/"como está" | `unknown` da IA nunca recebe extras por keyword; prompt de intents passa a tratar saudação/assunto pessoal como `unknown` mesmo citando "hoje"/"status"/"clientes" de passagem |
| D10 | **Harness**: persona falava como a Cleo ("Estou aqui para te ajudar…") e um 429 de cota do Gemini devolvia 0.00 como se fosse defeito do produto | `ASSISTANT_VOICE` no `rejectReason` (retry corretivo) + backoff de 20/40/60s em 429 no client Gemini + `buildErrorResult` rotula falha de infraestrutura ("não é defeito do produto; reexecute") |
| D11 | **Ruído de infraestrutura no `docker compose up`** — `FATAL: database "hicleo" does not exist` a cada 10s, `frontend (unhealthy)` com o site no ar, WARN do Redis a cada conexão e um dump de 10 KB do AxiosError no `connection-monitor` | `pg_isready` com `-d` explícito nos 4 healthchecks (dev + prod); `HOSTNAME=0.0.0.0` + probe em `127.0.0.1` (compose de dev e Dockerfile) espelhando o prod; `REDIS_PASSWORD` vazio em dev (prod mantém `--requirepass`); `connection-monitor` trata 404/400 como instância inexistente (marca `disconnected`, loga `warn` compacto) e não serializa mais o AxiosError; `cleanupAll` do E2E apaga sessões `test-e2e*` órfãs. Documentado no `deploy-producao.md` (Troubleshooting) |
| D12 | **Evolution em loop com `getaddrinfo ENOTFOUND api.hicleo.com.br`** — `.env` de dev usava a URL de webhook de **produção** e, como `createInstance` só define o webhook no nascimento da instância, trocar `WEBHOOK_URL` não tinha efeito (retry 10× por evento) | `.env` de dev → `http://backend:3001/webhooks/evolution`; novo `MessagingPort.setWebhook()` (adapters Evolution API e GO + wrapper de rate limit) e `ensureEvolutionInstance` re-sincroniza o webhook no startup (idempotente, falha só loga `warn`); 3 testes novos em `evolution-setup`; documentado no `deploy-producao.md` | |
| D13 | **Migrations que nunca rodavam** — estavam em `/docker-entrypoint-initdb.d` (só executa com volume vazio: `Skipping initialization` no log) e `scripts/migrate.ts` quebrava com `import.meta.dirname` undefined em CJS, **sem** controle de versão (reaplicava tudo). Seeds usavam `WHERE NOT EXISTS`, então preço alterado no arquivo nunca chegava ao banco | Runner em `src/scripts/migrate.ts`: tabela `schema_migrations`, aplicação em ordem/transação, `pg_advisory_lock`, `--dry-run`, `dotenv` + erro claro sem `DATABASE_URL`. Serviço one-shot `migrate` no compose (dev/prod) e `backend` dependente de `service_completed_successfully`. `seeds/plan_limits.sql` com **UPSERT** rodando em toda subida. `migrations/meta/` removido e `drizzle.config` com `out: ./drizzle`. Testes: `migrate.test.ts` +7 |

**Resultado no E2E (`--single owner_command`):** resposta passou a ser uma seção por pedido —
`📋 *Clientes novos de hoje:* 1. Ana Souza` + `———` + `⚠️ *Clientes esperando retorno:* 1. Bruno Lima` — sem lista duplicada, sem o dono na lista e sem "Qual cliente…" sem nome. Score **0.52 → 1.00 (PASSOU)**; `onboarding` foi de 0.80 (com 2 problemas) para **1.00** (sem problemas) e `edge_case` de **0.84 → 1.00** (sumiram a piada repetida e a falta de oferta útil).

**Testes:** 189 → **219** (`recognize-intent` +8: regressão do E2E, oração única, status de contato, colapso `list_leads`/`leads_today`, duas orações, cliente específico, conversa casual; `message.processor.multi-intent` +3: dono fora das listas, divisor entre seções, histórico no reply conversacional; `assistente.service` +5: histórico cronológico, sem histórico, regeneração anti-repetição, prompt com oferta concreta e capacidades reais; `connection-monitor.cron` +4: 404 de instância inexistente, erro de rede, 5xx, sessão conectada; `migrate` +7: seleção de pendentes (ordem e no-op na 2ª execução), versão do arquivo e resolução dos diretórios).

**Pendência encontrada (não corrigida aqui):** o dono pediu "ver a agenda" e a Cleo respondeu "Para quem devo agendar o retorno?" — não existe intent nem consulta para **listar** follow-ups pendentes (`followUpRepo` só tem `schedule`/`cancelForLead`/`getDue`/`markSent`). Correção sugerida: `listPendingByUser` no repositório + intent `list_followups` ("minha agenda", "o que tenho marcado") + case de resposta com data/hora e nome do contato.

### 🟢 Rápidos (integração front↔back)
- ~~#1 Código de ativação dinâmico~~ ✅
- ~~#2 Checkbox LGPD na página de conexão~~ ✅
- ~~#3 Planos e preços via API (banco)~~ ✅
- ~~#4 Features dos planos via API~~ ✅
- ~~#5 Número da Cleo via env~~ ✅

### 🟡 Médios (completar fluxos)
- ~~#6 Follow-up cron configurável~~ ✅
- ~~#7 Contact monitor cron (alerta admin)~~ ✅
- ~~#8 Cancellation endpoint + crons~~ ✅
- ~~#9 Re-aceite de termos via WhatsApp~~ ✅

### 🔴 Grandes (implementação nova)
- ~~#10 Gateway de Pagamento~~ ✅ (Mercado Pago: PIX/cartão, webhook HMAC, subscription)
- ~~#13 Segurança~~ ✅ (helmet, CORS, rate limit, payload limits, Zod, sanitização, prompt injection, LGPD logs)
- ~~#17 Fix frontend build~~ ✅ (removido ignoreBuildErrors, build passa limpo)
- ~~#18 Docker/Deploy~~ ✅ (Dockerfiles multi-stage, compose dev + prod VPS limpa, healthchecks)
- ~~#21 Mídia WhatsApp~~ ✅ (receber/armazenar metadados, forward de materiais, intent send_material)
- ~~#31 Reestruturação Multi-User~~ ✅ (fluxo ativação, convites, slots, intents invite/disconnect)

### Outros concluídos
- ~~#11 Padronizar banco para inglês~~ ✅
- ~~#20 Migrations versionadas~~ ✅ (Drizzle Kit)
- ~~Limpeza de código~~ ✅ (37 UI components, 23 deps Radix, LeadStatus cold)
- ~~Migração Supabase → PostgreSQL + Drizzle ORM~~ ✅ (self-hosted via Docker, type-safe queries, pool pg.Pool max 20)
- ~~#36 Memória de Conversa por Lead~~ ✅ (últimas 5 mensagens como contexto no prompt, backward-compatible)
- ~~#37 Horário de Atendimento com Timezone~~ ✅ (Intl nativo, business_days, migration)
- ~~#38 Seleção de Material por Nome~~ ✅ (busca parcial, lista múltiplos)
- ~~#39 Edição Parcial do Onboarding~~ ✅ (detectFieldToEdit, flag _editing, recomeçar)
- ~~#40 Timeout de Onboarding~~ ✅ (cron 48h, lembrete WhatsApp)
- ~~Correção de testes~~ ✅ (69/69 passando — onboarding mock corrigido, activation controller alinhado com implementação)

---

## 🔴 PENDENTE — BLOQUEANTE PARA PRODUÇÃO

### 22. Deploy no servidor (VPS limpa com Docker)

**Status:** Código pronto. Nunca rodou em produção.
**Prioridade:** Máxima (último bloqueante antes de ter clientes)
**Documentação completa:** [docs/tecnico/deploy-producao.md](./deploy-producao.md) — guia passo a passo com opções de VPS, domínio, SSL, segurança, backup, monitoramento e checklist operacional.

**Checklist de deploy:**

| # | Ação | Detalhes |
|---|------|----------|
| 1 | Contratar VPS | Qualquer provider com Docker. **Opção grátis:** Oracle Cloud Always Free (2 OCPU ARM / 12 GB / 200 GB, DC em São Paulo) — ver [deploy-producao.md §2.5](./deploy-producao.md#25-oracle-cloud-always-free). Pagos: Hetzner CX22, Hostinger KVM 2, Contabo. Mínimo: 2 vCPU, 4GB RAM |
| 2 | Comprar chip dedicado | Pré-pago, ativar WhatsApp, nunca usar pra outra coisa |
| 3 | Comprar/configurar domínio | Ex: hicleo.com.br, apontar DNS pro IP do servidor |
| 4 | SSL/HTTPS | Cloudflare Origin Certificates → salvar em `nginx/ssl/fullchain.pem` e `nginx/ssl/privkey.pem` |
| 5 | Instalar Docker no servidor | `apt install docker.io docker-compose-plugin` (se não vier instalado) |
| 6 | Clonar repo no servidor | `git clone` + copiar `.env` com valores de produção |
| 7 | Gerar senhas fortes | `openssl rand -base64 32` para DB_PASSWORD, REDIS_PASSWORD, EVOLUTION_DB_PASSWORD |
| 8 | Configurar `.env` produção | `NODE_ENV=production`, domínio real, token MP real, CORS_ORIGIN, SITE_URL, senhas geradas |
| 9 | Permissões do .env | `chmod 600 .env` — apenas root e o user do deploy leem |
| 10 | Setup firewall | `sudo bash scripts/setup-firewall.sh` — libera 22/80/443, bloqueia o resto |
| 11 | Build e subir containers | `docker compose -f docker-compose.prod.yml up -d --build` |
| 12 | Configurar backup automático | `crontab -e` → `0 3 * * * /opt/hi-cleo/scripts/backup-db.sh >> /var/log/hicleo-backup.log 2>&1` |
| 13 | Mercado Pago produção | Trocar `TEST-xxx` por token real, configurar webhook apontando pra URL pública |
| 14 | Conectar WhatsApp | Acessar Evolution API (via nginx: /manager) → criar instância → escanear QR com chip novo |
| 15 | Teste end-to-end | Pagamento real (R$1) → código → ativação → onboarding → resposta automática |

**Estimativa:** 1 dia (+ tempo de espera do chip e propagação DNS)

**Comandos rápidos (copiar e colar no servidor):**
```bash
# 7. Gerar senhas
echo "DB_PASSWORD=$(openssl rand -base64 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
echo "EVOLUTION_DB_PASSWORD=$(openssl rand -base64 32)"

# 9. Permissões
chmod 600 .env

# 10. Firewall
sudo bash scripts/setup-firewall.sh

# 11. Subir tudo
docker compose -f docker-compose.prod.yml up -d --build

# 12. Backup (adicionar ao cron)
crontab -e
# Colar: 0 3 * * * /opt/hi-cleo/scripts/backup-db.sh >> /var/log/hicleo-backup.log 2>&1

# Verificar saúde
curl -s https://SEU_DOMINIO/health | jq .
sudo ufw status
docker compose -f docker-compose.prod.yml ps
```

---

### 51. Hardening de Segurança para Produção

**Status:** ✅ Implementado
**Prioridade:** Alta (executar junto com o deploy #22)
**Implementado em:** 2026-08-17

**Contexto:** A aplicação já implementa segurança no código (helmet, CORS, rate limit, prepared statements, sanitização, LGPD). O hardening de infraestrutura foi implementado no `docker-compose.prod.yml` e scripts auxiliares.

**O que foi feito:**

| # | Item | Status | Implementação |
|---|------|--------|---------------|
| 1 | **Nginx reverse proxy + SSL** | ✅ | Container nginx como único entry point (80/443). Config em `nginx/nginx.conf` com TLS 1.2+, headers de segurança (HSTS, X-Frame-Options, etc.), rate limiting, gzip |
| 2 | **Senha forte no banco** | ✅ | `.env.example` com instruções `openssl rand -base64 32`. Compose usa `${DB_PASSWORD}` |
| 3 | **Redis com senha** | ✅ | `--requirepass ${REDIS_PASSWORD}` no compose. Backend e Evolution API conectam com senha. Maxmemory 100MB + allkeys-lru |
| 4 | **Backup automatizado do banco** | ✅ | Script `scripts/backup-db.sh` — pg_dump + gzip + rotação 7 dias. Pronto para cron diário |
| 5 | **Permissões do .env** | ✅ | Documentado no compose header: `chmod 600 .env` |
| 6 | **Firewall (UFW)** | ✅ | Script `scripts/setup-firewall.sh` — allow 22/80/443, deny 3000/3001/5432/6379/8080 |
| 7 | **Portas internas bloqueadas** | ✅ | Backend, frontend, Redis, Postgres, Evolution usam `expose` (não `ports`) — inacessíveis externamente |
| 8 | **Rotação de logs** | ⏳ | Pino-roll já configurado no backend. Confirmar retenção em produção |
| 9 | **Docker user não-root** | ✅ | Backend já roda com `appuser` (Dockerfile). Demais containers usam imagens Alpine/oficiais |

**Arquivos criados/alterados:**
- `docker-compose.prod.yml` — reescrito com nginx, expose, Redis com senha
- `nginx/nginx.conf` — reverse proxy completo com SSL, headers, rate limiting
- `scripts/backup-db.sh` — backup automatizado com rotação
- `scripts/setup-firewall.sh` — setup UFW para o servidor
- `.env.example` — REDIS_PASSWORD + notas de segurança em credenciais

**Pendente no deploy (ação manual):**
- Colocar certificados SSL em `nginx/ssl/` (fullchain.pem + privkey.pem)
- Executar `chmod 600 .env` no servidor
- Executar `sudo bash scripts/setup-firewall.sh`
- Configurar cron: `0 3 * * * /opt/hi-cleo/scripts/backup-db.sh`

---

## 🟡 PENDENTES — MELHORIAS PÓS-LANÇAMENTO

### 34. Otimização de Tokens (beta → produção)

**Status:** Planejado
**Prioridade:** Média (custo cresce com usuários)
**Documentação:** [docs/arquitetura-ia.md](./arquitetura-ia.md#otimização-de-tokens)

**Estratégia em 2 fases:**

**Fase 1 — Beta (agora):**
- Prompts compactos com perfil semântico (~120 tokens em vez de ~400)
- Estrutura de prompt fixa por dono (aproveita caching automático: Groq 50%, Gemini 90%)
- Sem histórico de conversa por chamada (cada resposta é isolada)
- Monitoramento de uso + alerta ao admin quando IA falha ou quota baixa

**Fase 2 — Produção:**
- Memória por lead (`lead_memory`) — resumo semântico do que já conversou
- Sumarização progressiva (a cada N interações, IA resume e descarta histórico)
- Context caching explícito do Gemini para donos com alto volume
- Resultado esperado: **70-90% menos custo** vs abordagem ingênua

**Estimativa:** Fase 1 = 0.5 dia | Fase 2 = 2 dias

**Referências:**
- [Mem0 — Token Optimization Playbook](https://mem0.ai/blog/the-2026-token-optimization-playbook-cut-ai-agent-memory-costs-3–4x)
- [Groq Prompt Caching](https://console.groq.com/docs/prompt-caching)
- [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching)

---

### 35. Memória por Lead (produção)

**Status:** Planejado
**Prioridade:** Média (qualidade + personalização)
**Quando:** Após beta validar que clientes interagem mais de 1 vez

**O que faz:**
- Tabela `lead_memory` com resumo semântico por lead (ex: "Interessada em limpeza de pele, perguntou preço dia 10/08")
- Injetado no prompt quando o mesmo cliente volta a mandar mensagem
- Cleo responde de forma personalizada ("Oi de novo! A Ana já tá preparando aquela info pra você 😊")
- Sumarização progressiva: a cada 5 interações, IA gera novo resumo

**Impacto:**
- Cliente se sente lembrado e ouvido (diferencial vs bots genéricos)
- Custo: +30-50 tokens por chamada (compensado pela economia do caching)
- Cleo fica mais "humana" a cada interação

**Estimativa:** 2 dias

---

### 14. Error Tracking & Uptime Monitoring

**Status:** Código implementado ✅ — falta configurar contas (grátis)
**Prioridade:** Alta (primeira semana após deploy)

**O que já foi feito:**
- ✅ `@sentry/node` integrado no backend (error handler, unhandled rejections, sanitização de headers)
- ✅ `@sentry/nextjs` integrado no frontend (client/server/edge configs, global-error.tsx)
- ✅ Endpoint `/health` verifica DB (PostgreSQL) + Redis — retorna 200 ou 503
- ✅ Variáveis `SENTRY_DSN` e `NEXT_PUBLIC_SENTRY_DSN` no schema e `.env.example`

**O que falta (configuração externa, zero código):**

| Serviço | Ação | Custo | Tempo |
|---------|------|-------|-------|
| Sentry | Criar conta em sentry.io (login c/ GitHub), criar projeto Node.js, copiar DSN pro `.env` | Grátis (5k erros/mês) | 10 min |
| UptimeRobot | Criar conta, adicionar monitor HTTP p/ `https://dominio/health`, configurar alerta email | Grátis (50 monitores, check 5min) | 10 min |

**Estimativa restante:** 20 min de configuração pós-deploy

### 19. CI/CD Pipeline

**O que falta:** GitHub Actions (lint + test + build no PR).
**Quando:** Após validar que prod está estável.
**Estimativa:** 0.5 dia

### 52. Bug: Trial Activation — Duplicação de User no Message Processor

**Status:** 🔴 Encontrado via teste E2E autônomo (2026-08-18)
**Prioridade:** Alta (bloqueia fluxo trial → onboarding)

**Problema:** Quando o usuário envia o código de ativação (ATIVAR-XXXX) após criar um trial, o `message.processor.ts` tenta criar um user novo com o mesmo phone. Mas o `trial/start` já criou o user. O INSERT falha por unique constraint no phone.

**Erro:** `Failed query: insert into "users" (...) values (...) — duplicate phone`

**Causa raiz:** O processor não está reconhecendo que o user já existe (criado pelo trial) ao processar o código de ativação.

**Fix esperado:** O processor deve buscar o user existente pelo código de ativação (que tem `user_id` vinculado) antes de tentar criar um novo.

**Estimativa:** 0.5 dia

### 16. Testes Payment

**Cobertura atual:** 69 testes passando (onboarding, activation, cancellation, rules, terms)
**O que falta:** Testes unitários para price calculator e subscription.
**Quando:** Após fluxo validado com clientes reais.
**Estimativa:** 1-2 dias

---

## 🟠 CONCLUÍDOS — QUALIDADE DA EXPERIÊNCIA (implementados 2026-08-11)

### 33. IA nos Fluxos Conversacionais (pré-beta)

**Status:** ✅ Implementado
**Prioridade:** Alta (qualidade da experiência do primeiro uso)
**Implementado em:** 2026-08-12
**Documentação:** [docs/arquitetura-ia.md](./arquitetura-ia.md)

**O que foi feito:**
- ✅ Módulo `modules/ai/` com nós, prompts e estado separados (6 nós + 4 arquivos de prompts)
- ✅ Onboarding usa IA para interpretar respostas (rejeita "não sei", ".", etc.) + fallback regex local
- ✅ Transcrição de áudio (Groq Whisper large-v3) funciona no onboarding E pós-onboarding
- ✅ Aceite de termos interpreta linguagem natural via nó `interpret-confirmation`
- ✅ Respostas contextuais e humanas aos clientes do dono (usando dados do onboarding + histórico multi-turno)
- ✅ Prompts compactos com personalidade (~100-120 tokens, prefixo fixo para caching automático)
- ✅ Classificador local (saudações + keywords) — resolve 30-50% das chamadas sem IA
- ✅ Chain de fallback DeepSeek → Groq → Gemini com alertas ao admin
- ✅ Estrutura preparada para migração futura a LangGraph (cada nó = função pura)

**Arquivos principais:**
- `modules/ai/nodes/` — interpret-onboarding, transcribe-audio, generate-client-reply, recognize-intent, interpret-confirmation, local-classifier
- `modules/ai/prompts/` — onboarding, intent, client-reply, terms
- `modules/ai/adapters/` — deepseek, groq, gemini, ai-fallback
- `modules/assistente/assistente.service.ts` — wrapper do recognizeIntent
- `modules/queue/message.processor.ts` — integra todos os nós nos fluxos reais

---

### 36. Memória de Conversa por Lead (contexto multi-turno)

**Status:** ✅ Implementado (básico com últimas N mensagens)
**Prioridade:** Alta (experiência do cliente)
**Implementado em:** 2026-08-11

**Problema resolvido:** A IA só via a mensagem ATUAL do cliente. Se o cliente mandou "quanto custa?" ontem e hoje manda "e o prazo?", a Cleo não sabia do que se tratava — repetia saudação ou pedia contexto novamente.

**O que foi feito:**
- ✅ Busca últimas 5 mensagens (inbound + outbound) do lead antes de gerar resposta
- ✅ Formata como contexto compacto: `Cliente: "msg"` / `Cleo: "msg"` (max 100 chars/msg)
- ✅ Injeta no prompt APÓS o prefixo fixo (preserva caching automático: Groq 50%, Gemini 90%)
- ✅ Parâmetro opcional — backward-compatible, sem quebra de interface
- ✅ Zero migrations — usa query `getByLead()` já existente

**Arquivos alterados:**
- `modules/ai/nodes/generate-client-reply.ts` — nova função `formatConversationHistory()` + parâmetro `recentMessages`
- `modules/ai/prompts/client-reply.prompts.ts` — aceita `conversationHistory` opcional
- `modules/queue/message.processor.ts` — busca mensagens recentes antes de gerar resposta

**Custo:** ~30-80 tokens extras por chamada (~R$0,01-0,02/dia adicional)
**Evolução futura:** Sumarização semântica (item #35 — tabela `lead_memory`) para leads com muitas interações

---

### 37. Horário de Atendimento com Timezone e Fins de Semana

**Status:** ✅ Implementado
**Prioridade:** Média
**Implementado em:** 2026-08-11

**Problema resolvido:** Comparação de horário era por string sem considerar timezone do dono nem fins de semana.

**O que foi feito:**
- ✅ Utilitário `shared/utils/business-hours.ts` com `checkBusinessHours()` usando `Intl.DateTimeFormat` nativo (zero dependências)
- ✅ Suporta timezone IANA (ex: America/Sao_Paulo, America/Manaus) e business_days (array: mon-sun)
- ✅ Campos `timezone` e `business_days` adicionados à interface `Business`
- ✅ Migration SQL para novas colunas (defaults: America/Sao_Paulo, seg-sex)
- ✅ `message.processor.ts` usa o novo utilitário ao invés de comparação de strings

---

### 38. Seleção de Material por Nome

**Status:** ✅ Implementado
**Prioridade:** Média
**Implementado em:** 2026-08-11

**Problema resolvido:** Comando "manda material pro João" sempre enviava o ÚLTIMO material salvo.

**O que foi feito:**
- ✅ Intent reconhece entidade `material` (nome do arquivo mencionado pelo dono)
- ✅ Busca parcial case-insensitive pelo nome do arquivo
- ✅ Se não encontra → lista materiais disponíveis para escolha
- ✅ Se múltiplos e sem nome → lista numerada para o dono escolher
- ✅ Resposta confirma qual material foi enviado (nome do arquivo)

---

### 39. Edição Parcial do Onboarding (sem resetar tudo)

**Status:** ✅ Implementado
**Prioridade:** Média
**Implementado em:** 2026-08-11

**Problema resolvido:** Quando o usuário rejeitava o resumo final, o sistema resetava para `business_type` obrigando a re-responder 5 perguntas.

**O que foi feito:**
- ✅ `detectFieldToEdit()` mapeia palavras-chave do usuário ao step correto
- ✅ Flag `_editing=true` nos dados sinaliza modo edição parcial
- ✅ `processMessage()` detecta flag e redireciona nextStep para `confirm_summary` após editar 1 campo
- ✅ `handleStep()` limpa flag ao voltar ao resumo
- ✅ Comando "recomeçar" faz reset total (mantém apenas nome)
- ✅ Se não identifica o campo, pergunta qual quer mudar (com lista de opções)

---

### 40. Timeout de Onboarding Abandonado

**Status:** ✅ Implementado
**Prioridade:** Média
**Implementado em:** 2026-08-11

**Problema resolvido:** Se o usuário iniciava o onboarding e parava, o estado ficava preso indefinidamente.

**O que foi feito:**
- ✅ Cron diário às 10h verifica onboardings com `updated_at > 48h` e `step != completed`
- ✅ Envia lembrete amigável via WhatsApp ("Quer continuar? É rapidinho!")
- ✅ Informa que pode mandar qualquer mensagem para retomar ou "recomeçar" para reset
- ✅ Registrado no `index.ts` com os outros crons

---

---

## 🟡 PENDENTES — OTIMIZAÇÕES DE IA E TRIAL (pós-lançamento beta)

### 41. Cache de System Prompt (estabilidade do prefixo)

**Status:** Planejado
**Prioridade:** Alta (reduz custo de IA em 50-98%)
**Estimativa:** 0.5 dia

**O que fazer:**
- Garantir que system prompt por dono tem prefixo estável (determinístico entre chamadas)
- Histórico de conversa e mensagem do lead vêm DEPOIS do prefixo fixo
- DeepSeek, Groq e Gemini aplicam cache automaticamente quando primeiros tokens são idênticos
- Criar helper `buildStableSystemPrompt(business)` que retorna string determinística

**Impacto:** DeepSeek cobra $0.0028/1M (cache hit) vs $0.14/1M (normal) = 98% de desconto no input.

---

### 42. Cache Local de Respostas (Redis)

**Status:** Planejado
**Prioridade:** Média (evita chamadas repetidas)
**Estimativa:** 0.5 dia

**O que fazer:**
- Antes de chamar IA, checar Redis: `ai:response:{hash(system+user_msg)}`
- Se existe e tem <1h: retornar cached
- NÃO cachear msgs do dono (intents são contextuais)
- Cachear apenas respostas genéricas a leads (saudação, fora horário, "vou anotar")

**Arquivos:** novo `modules/ai/cache/response-cache.ts`, alterar `generate-client-reply.ts`

---

### 43. Métricas de Uso de IA (por provider, por dia)

**Status:** Planejado
**Prioridade:** Média (visibilidade de custo e saúde)
**Estimativa:** 0.5 dia

**O que fazer:**
- Counter no Redis: `ai:calls:{provider}:{date}` → increment a cada chamada
- Counter de tokens: `ai:tokens:{provider}:{date}:input` e `:output`
- Endpoint `/health` expandido: retorna counts do dia
- Alerta ao admin quando: `calls > 80% do budget diário`

**Arquivos:** alterar `ai-fallback.adapter.ts`, expandir `/health`

---

### 44. Trial de 7 Dias (aquisição + anti-abuso + prospecção)

**Status:** Planejado
**Prioridade:** Alta (conversão e validação do produto)
**Estimativa:** 2 dias
**Dependência:** Deploy (#22) precisa estar concluído

---

#### Fluxo do Trial

```
Landing page ("Teste 7 dias grátis")
  → Formulário MÍNIMO: nome + telefone + checkbox termos/comunicações
  → POST /api/trial/start
    → Validações anti-abuso (5 camadas automáticas, zero fricção)
    → Cria user com subscription_status = 'trial', expires_at = +7d
    → Gera código ATIVAR-XXXX
    → Retorna código + link wa.me direto pra Cleo
  → Usuário manda código no WhatsApp da Cleo
  → Cleo ativa → onboarding conversacional (coleta email, negócio, público, etc.)
  → Conectar WhatsApp → funcionando

Tempo do formulário até ativação: ~30 segundos
Campos no formulário: 3 (nome, telefone, checkbox)
Dados enriquecidos via onboarding: email, tipo de negócio, público, tom, horário
```

**Princípio:** Coletar o mínimo para funcionar. Enriquecer progressivamente via conversa.

| Dado | Quando é coletado | Como |
|---|---|---|
| Nome | Formulário (obrigatório) | Input |
| Telefone | Formulário (obrigatório) | Input com máscara |
| Consentimento | Formulário (obrigatório) | Checkbox |
| Email | Onboarding — Cleo pergunta | "Qual seu email pra eu te avisar sobre o plano?" |
| Tipo de negócio | Onboarding (já existe) | Cleo pergunta no chat |
| Público-alvo | Onboarding (já existe) | Cleo pergunta no chat |
| Horário | Onboarding (já existe) | Cleo pergunta no chat |
| Como conheceu | Pós-ativação (1ª interação) | "Aliás, como você conheceu a Cleo? 😊" |
| CPF | **Só no checkout** (se converter) | Não pedir no trial |
| IP / Device / User-Agent | Automático no request | Transparente pro usuário |

#### Limites do Trial

- **Funcionalidade completa** — não limita features (usuário precisa ver valor real)
- **Limite de 30 respostas automáticas** — controla custo IA
- Contador visível nas respostas: "Você usou 20 de 30 respostas do teste"
- Após atingir 30: Cleo informa que o limite foi atingido e direciona pro checkout

#### Custos projetados (cenário sem pagantes)

| Trials simultâneos | Custo IA/mês | Custo total/mês (VPS + IA) |
|---|---|---|
| 10-20 | R$0 (Groq free) | R$36 |
| 30 | R$3-8 (DeepSeek) | R$39-44 |
| 50 | R$5-11 | R$50-56 |

---

#### Anti-Abuso — 5 Camadas Automáticas (zero fricção pro usuário)

| Camada | Verificação | Como funciona | Dificuldade de burlar |
|---|---|---|---|
| 1. Telefone | 1 trial por número (cooldown 90 dias) | Query no banco | Alta (chip é custo real) |
| 2. Rate limit IP | Max 3 trials por IP em 24h | Redis counter | Média |
| 3. Telefone BR | Só +55, DDD válido, 9 dígitos celular | Validação regex | Baixa mas filtra bots |
| 4. Device fingerprint | Hash do device ID via webhook Evolution | Capturado na ativação | Alta |
| 5. Delay anti-bot | 60s entre tentativas do mesmo IP | Redis TTL | Alta contra automação |

**Não pede CPF nem email no formulário** — zero burocracia. Se identificar abuso em produção,
adicionar camadas extras (CPF, email normalizado) na Fase 5.

**Por que funciona sem CPF:**
- O principal anti-abuso é o **telefone** — trocar de chip custa dinheiro e tempo
- O **device fingerprint** pega quem troca chip mas usa o mesmo aparelho
- O **rate limit por IP** pega quem tenta criar vários trials de uma vez
- O custo real de burlar todas as camadas (chip novo + VPN + aparelho novo) > R$89,90 (preço do plano)

---

#### Tabela `trial_attempts` (registro completo para anti-abuso + prospecção)

```sql
CREATE TABLE trial_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dados do formulário (mínimo obrigatório)
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  
  -- Dados enriquecidos via onboarding (preenchidos progressivamente)
  email VARCHAR(255),
  email_normalized VARCHAR(255),
  business_type VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(2),
  referral_source VARCHAR(100),  -- 'instagram', 'google', 'indicacao', 'tiktok', etc.
  
  -- Dados técnicos (anti-abuso — coletados automaticamente)
  ip_address INET,
  device_fingerprint VARCHAR(255),
  user_agent TEXT,
  
  -- Estado do trial
  status VARCHAR(20) DEFAULT 'started',
    -- started: registrou mas não ativou
    -- activated: ativou código e conectou
    -- expired: 7 dias passaram
    -- converted: pagou após trial
    -- blocked: tentativa bloqueada por anti-abuso
  blocked_reason VARCHAR(100),  -- 'duplicate_phone', 'rate_limit_ip', 'invalid_phone', 'duplicate_device'
  
  -- Métricas de uso (preenchidas durante o trial)
  trial_user_id UUID REFERENCES users(id),
  responses_used INTEGER DEFAULT 0,
  leads_captured INTEGER DEFAULT 0,
  whatsapp_connected BOOLEAN DEFAULT FALSE,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  last_activity_at TIMESTAMPTZ,
  
  -- Prospecção pós-trial
  prospection_attempts INTEGER DEFAULT 0,
  last_prospection_at TIMESTAMPTZ,
  prospection_status VARCHAR(20) DEFAULT 'pending',
    -- pending: ainda não contactado
    -- contacted: já recebeu msg
    -- interested: respondeu positivamente
    -- not_interested: respondeu negativamente
    -- converted: pagou
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);

-- Índices para anti-abuso
CREATE INDEX idx_trial_phone_90d ON trial_attempts(phone, created_at DESC);
CREATE INDEX idx_trial_device ON trial_attempts(device_fingerprint) WHERE device_fingerprint IS NOT NULL;
CREATE INDEX idx_trial_ip_24h ON trial_attempts(ip_address, created_at DESC);

-- Índices para prospecção
CREATE INDEX idx_trial_prospection ON trial_attempts(status, prospection_status) WHERE status IN ('expired', 'started');
CREATE INDEX idx_trial_hot_leads ON trial_attempts(responses_used DESC) WHERE status = 'expired' AND prospection_status = 'pending';
```

---

#### Campos adicionais na tabela `users` (para trials)

```sql
ALTER TABLE users ADD COLUMN trial_started_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN trial_responses_used INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN trial_responses_limit INTEGER DEFAULT 30;
ALTER TABLE users ADD COLUMN trial_attempt_id UUID REFERENCES trial_attempts(id);
```

---

#### Guard no `message.processor.ts`

Antes de chamar a IA para responder um lead, verificar:

```ts
// Pseudo-código do guard
if (user.subscription_status === 'trial') {
  if (new Date() > user.subscription_expires_at) {
    // Trial expirou — redirecionar pro checkout
    await sendText(lead.phone, "O período de teste acabou! Pra continuar com a Cleo: {CHECKOUT_URL}")
    return
  }
  if (user.trial_responses_used >= user.trial_responses_limit) {
    // Atingiu limite — informar
    await sendText(lead.phone, "O dono vai te responder em breve 😊")
    await sendText(owner.phone, "⚠️ Limite de respostas do teste atingido (30/30). Assine pra continuar: {CHECKOUT_URL}")
    return
  }
  // Incrementar contador
  user.trial_responses_used++
}
```

---

#### Cron de Lembretes do Trial

Integrado no `subscription.cron.ts` existente:

| Dia | Ação | Mensagem |
|---|---|---|
| 5 | Lembrete amigável | "Seu teste acaba em 2 dias! Você já usou X de 30 respostas. Quer continuar? {CHECKOUT_URL}" |
| 7 | Lembrete urgente | "🚨 Último dia do teste! A Cleo atendeu X clientes pra você. Assine agora: {CHECKOUT_URL}" |
| 8 | Expiração | Marca `subscription_status = 'expired'`, desconecta sessões |

---

#### Cron de Prospecção Pós-Trial

Novo cron dedicado: `trial-prospection.cron.ts`
**Schedule:** Diário às 10h (horário comercial — melhor taxa de abertura no WhatsApp)

**Lógica de execução:**

```
1. Buscar trial_attempts WHERE:
   - status IN ('expired', 'started')
   - prospection_status = 'pending' OR (prospection_status = 'contacted' AND last_prospection_at < agora - intervalo)
   - prospection_attempts < 2 (máximo 2 tentativas)
   
2. Para cada attempt, classificar por "temperatura":
   
   🔥 QUENTE (prioridade 1 — contactar dia 8):
     - responses_used >= 20
     - whatsapp_connected = true
     - leads_captured > 0
   
   🟡 MORNO (prioridade 2 — contactar dia 10):
     - onboarding_completed = true
     - responses_used entre 5 e 19
   
   ❄️ FRIO (prioridade 3 — contactar dia 14):
     - status = 'started' (nunca ativou)
     - OU responses_used < 5

3. Enviar mensagem personalizada por WhatsApp
4. Atualizar prospection_attempts++ e last_prospection_at
5. Se attempt 2 e sem resposta → marcar prospection_status = 'not_interested'
```

**Cadência — 2 tentativas em 21 dias (validada com práticas de mercado):**

O WhatsApp não é email. Cada msg é push notification intrusiva com 98% de taxa de abertura.
A Meta recomenda max 1-2 msgs de marketing por semana. Mais que isso = risco de ban + percepção de spam.

```
Dia 0-7:   Trial ativo
Dia 5:     Lembrete interno: "Seu teste acaba em 2 dias"
Dia 7:     Lembrete urgente: "Último dia"
Dia 8:     Trial expira → desconecta imediatamente → notifica dono

--- PROSPECÇÃO (max 2 msgs por WhatsApp) ---
1ª tentativa:
  🔥 Quentes → dia 8 (urgência real — clientes sem resposta)
  🟡 Mornos  → dia 10
  ❄️ Frios   → dia 14 (só 1 msg, tom de ajuda)

2ª e última tentativa (só se não respondeu):
  🔥 Quentes → dia 21 (oferta com desconto)
  🟡 Mornos  → dia 24
  ❄️ Frios   → NÃO ENVIA (1 tentativa é o máximo)

Dia 30:    Purga dados operacionais (leads, messages, business, sessions)

--- REENGAJAMENTO PASSIVO (sem WhatsApp) ---
Dia 30+:   Só via email — newsletters mensais, ofertas sazonais (Black Friday, etc.)
Dia 180:   Anonimiza dados de prospecção ou deleta se solicitado
```

**Por que 2 tentativas (não 3):**
- WhatsApp ≠ email — 3 msgs sem resposta = sensação de assédio
- Risco de ban: 5+ reports = número da secretária bloqueado pela Meta
- 3ª tentativa tem conversão <2% (não justifica o risco)
- Preserva reputação da marca ("Cleo é simpática, não insistente")
- Mercado brasileiro: max 1-2 msgs marketing/semana (recomendação Meta)

**Mensagens por temperatura e tentativa:**

| Temperatura | 1ª tentativa | 2ª tentativa (13 dias depois) |
|---|---|---|
| 🔥 Quente | "Oi {nome}! A Cleo atendeu {leads_captured} clientes pra você no teste. Seus clientes tão sem resposta desde dia {data_expiração}. Quer reativar? {CHECKOUT_URL}" | "Oi {nome}! Oferta especial: primeiro mês com 15% off pra você voltar. Válido até {data+7d}: {CHECKOUT_URL_DESCONTO}" |
| 🟡 Morno | "Oi {nome}! Como foi o teste da Cleo? Vi que você configurou tudo certinho. Alguma dúvida? Quer continuar? {CHECKOUT_URL}" | "Oi {nome}! A Cleo tá com saudade 😊 Primeiro mês com desconto especial: {CHECKOUT_URL_DESCONTO}" |
| ❄️ Frio | "Oi {nome}! Vi que você se cadastrou pra testar a Cleo mas não conseguiu configurar. Posso ajudar? É rapidinho, menos de 5 minutos!" | _(não envia — marca como not_interested)_ |

**Regras do cron:**
- Respeita horário comercial (só envia entre 9h-18h no timezone do usuário)
- Intervalo mínimo entre tentativas: **13 dias** (quentes: dia 8 → dia 21)
- Max 2 tentativas por WhatsApp (frios: apenas 1)
- Se responde "não" / "para" / bloqueia → `not_interested`, nunca mais contacta
- Se responde positivamente → `interested`, envia link com oferta
- Se paga → `converted` automaticamente (webhook MP detecta email)
- Rate limit: max 20 envios/hora (evitar ban por volume)

**Detecção de resposta no message.processor:**
```ts
// Quando recebe msg de número em trial_attempts com status 'contacted'
if (trialAttempt && trialAttempt.prospection_status === 'contacted') {
  const text = message.toLowerCase()
  if (/não|para|cancela|remove|sai|chega/.test(text)) {
    await updateProspectionStatus(trialAttempt.id, 'not_interested')
    await sendText(phone, "Entendido! Não vou mais entrar em contato. Se mudar de ideia: hicleo.com.br 😊")
    return
  }
  if (/sim|quero|como|quanto|assinar|plano|continuar/.test(text)) {
    await updateProspectionStatus(trialAttempt.id, 'interested')
    await sendText(phone, "Ótimo! Acesse {CHECKOUT_URL} pra escolher seu plano. Qualquer dúvida, manda aqui!")
    return
  }
}
```

---

#### Retenção de Dados e LGPD

| Dado | Tabela | Retenção | Justificativa |
|---|---|---|---|
| Dados operacionais (leads, mensagens, business, sessions) | `users`, `leads`, `messages` | 30 dias após expirar | LGPD — mesma regra do cancelamento |
| Dados de prospecção (nome, email, telefone, negócio) | `trial_attempts` | 6 meses | Legítimo interesse + consentimento explícito |
| Métricas anonimizadas | `trial_attempts` (sem PII) | Indefinido | Análise de produto |

**Consentimento no formulário de trial (1 checkbox):**
```
☐ Aceito os Termos de Uso e concordo em receber comunicações da Hi Cleo por WhatsApp
```
Um único checkbox cobre termos + base legal para prospecção.
Simples, sem assustar. Termos completos acessíveis via link no texto.

---

#### Métricas de Conversão

O cron registra eventos na tabela `subscription_events` com `event_type`:
- `trial_prospection_sent` — tentativa de prospecção enviada
- `trial_prospection_responded` — usuário respondeu
- `trial_converted` — trial virou pagante

Permite calcular:
- Taxa de conversão trial → pagante (meta: 10-20%)
- Taxa de resposta à prospecção (meta: 30-50%)
- Tempo médio de conversão (quantos dias após expirar)
- Canal de aquisição com melhor ROI (`referral_source`)

---

#### Fases de Implementação (do mais importante ao menos)

**Fase 1 — Trial funcional (bloqueante para aquisição de clientes)**
_Estimativa: 1 dia_

| # | Item | Prioridade | Motivo |
|---|---|---|---|
| 1 | Migration: tabela `trial_attempts` + campos `users` | Máxima | Base de tudo |
| 2 | Rota `POST /api/trial/start` com validações anti-abuso | Máxima | Sem ela não existe trial |
| 3 | Guard no `message.processor.ts` (verificar trial expirado + limite 30 respostas) | Máxima | Sem isso, trial é plano grátis infinito |
| 4 | Adaptar `SubscriptionService.checkExpirations()` para tratar `trial` | Máxima | Expirar e desconectar no dia 8 |
| 5 | Tipo `trial` no `SubscriptionStatus` + interface `User` | Máxima | Tipagem necessária para tudo funcionar |

**Fase 2 — Frontend de entrada (bloqueante para trial funcionar)**
_Estimativa: 0.5 dia_

| # | Item | Prioridade | Motivo |
|---|---|---|---|
| 6 | Formulário de trial no frontend (nome + telefone + checkbox) | Alta | 3 campos, 15 segundos |
| 7 | CTA na landing page ("Teste 7 dias grátis") | Alta | Ponto de entrada |
| 8 | Tela de sucesso com código + link wa.me direto pra Cleo | Alta | Reduz fricção (1 clique pra ativar) |

**Fase 3 — Lembretes durante o trial (importante para conversão)**
_Estimativa: 0.25 dia_

| # | Item | Prioridade | Motivo |
|---|---|---|---|
| 9 | Lembrete dia 5: "Seu teste acaba em 2 dias" | Média-Alta | Aumenta conversão em ~20% |
| 10 | Lembrete dia 7: "Último dia" + link checkout | Média-Alta | Urgência final |
| 11 | Notificação dia 8: "Teste encerrado, clientes sem resposta" | Média-Alta | Cria dor imediata |

**Fase 4 — Prospecção pós-trial (importante para recuperar leads perdidos)**
_Estimativa: 0.5 dia_

| # | Item | Prioridade | Motivo |
|---|---|---|---|
| 12 | Cron `trial-prospection.cron.ts` com classificação por temperatura | Média | Recupera 10-15% dos expirados |
| 13 | Detecção de resposta no message.processor (opt-out / interesse) | Média | Respeitar "não" e capturar "sim" |
| 14 | Atualização automática de métricas durante o trial (responses_used, leads_captured) | Média | Alimenta classificação por temperatura |

**Fase 5 — Refinamento e anti-abuso avançado (PENDENTE FUTURO — só se identificar abuso real)**
_Status: Movido para pendentes futuros. Implementar sob demanda._
_Estimativa: 0.75 dia_

| # | Item | Prioridade | Quando implementar |
|---|---|---|---|
| 15 | Validação de CPF como camada extra | Baixa | Se identificar abuso repetido |
| 16 | Normalização de email (anti-alias Gmail/Outlook) | Baixa | Se identificar abuso via aliases |
| 17 | Device fingerprint via Evolution API | Baixa | Se mesmo aparelho criar múltiplos trials |
| 18 | Cron de purga (dia 30: dados operacionais, dia 180: anonimização) | Baixa | Quando tiver +100 trials ou exigência legal |
| 19 | Reengajamento por email (newsletters pós dia 30) | Baixa | Quando tiver ferramenta de email (Brevo/Resend) |
| 20 | Coleta de "como conheceu" no onboarding | Baixa | Quando quiser medir ROI de canais |

---

#### Resumo de estimativas

| Fase | Escopo | Estimativa | Acumulado |
|---|---|---|---|
| 1 | Backend core (trial funciona) | 1 dia | 1 dia |
| 2 | Frontend (usuário consegue iniciar) | 0.5 dia | 1.5 dias |
| 3 | Lembretes durante trial | 0.25 dia | 1.75 dias |
| 4 | Prospecção pós-trial | 0.5 dia | 2.25 dias |
| 5 | Refinamento anti-abuso + LGPD | 0.75 dia | 3 dias |
| **MVP (Fases 1-3)** | **Trial funcional com lembretes** | **1.75 dias** | |
| **Completo (Fases 1-5)** | **Tudo incluindo prospecção e compliance** | **3 dias** | |

---

#### O que já existe e é reutilizado (sem mudanças)

- `ActivationService.generateCode()` — aceita `paymentId = 'trial_free'`
- `ActivationService.activateUser()` — mesmo fluxo
- Onboarding conversacional completo
- Conexão WhatsApp (Evolution API)
- `SubscriptionService.checkExpirations()` — reconhece `trial` como expirável
- Frontend `/ativacao` e `/conectar`

---

### 45. MistralAdapter (4º provider de fallback)

**Status:** Planejado
**Prioridade:** Baixa (diversidade geográfica — UE)
**Estimativa:** 0.5 dia

**O que fazer:**
- Criar adapter OpenAI-compatible (mesmo padrão do DeepSeek)
- Usar Mistral Small 4 ($0.10/1M input, $0.30/1M output)
- Free tier: ~1B tokens/mês no tier Experiment
- Adiciona diversidade geográfica (servidores na UE)

---

### 46. Roteamento por Complexidade de Mensagem

**Status:** Planejado
**Prioridade:** Média (otimização de custo com dados reais)
**Estimativa:** 1-2 dias
**Quando:** Após ter dados reais de uso no beta

**O que fazer:**
- Classificar mensagem por "dificuldade" antes de escolher modelo
- Saudações → template local (R$0) — já implementado em 1.4
- Perguntas simples → modelo leve (Groq 8B)
- Respostas contextuais → modelo médio (DeepSeek V4 Flash)
- Interpretação complexa → modelo forte (Groq 70B ou Gemini Pro)
- Requer dados reais pra calibrar thresholds

---

### 47. Batch de Mensagens (agrupar antes de chamar IA)

**Status:** Planejado
**Prioridade:** Baixa (otimização de escala)
**Estimativa:** 1 dia
**Quando:** Volume > 100 users ativos

**O que fazer:**
- Delay de 2-3s quando múltiplos leads mandam msg pro mesmo dono
- Enviar batch único pra IA com múltiplas mensagens
- Economia: N system prompts → 1
- Trade-off: aumenta latência em 2-3s

---

### 48. Self-Host de Modelo Leve (eliminação de dependência)

**Status:** Planejado
**Prioridade:** Baixa (escala avançada)
**Estimativa:** 2-3 dias
**Quando:** Receita > R$2.000/mês E custo de IA > R$100/mês

**O que fazer:**
- Rodar Llama 3.1 8B na VPS (com GPU alugada) para mensagens simples
- Elimina dependência de terceiros para ~50% das chamadas
- Requer VPS com GPU (custo ~R$150-300/mês)
- Só faz sentido quando custo de APIs supera custo da GPU

---

### 49. Audit Log de IA Completo

**Status:** Planejado
**Prioridade:** Média (compliance e otimização)
**Estimativa:** 1 dia
**Quando:** Após estabilizar providers no beta

**O que fazer:**
- Tabela `ai_audit_log`: provider, tokens in/out, latência, se usou fallback, hash da msg
- Sem dados pessoais no log (só hash)
- Dashboard futuro: custo por dono, provider mais usado, falhas por dia
- Necessário para: LGPD (rastreabilidade), otimização de custos, SLA

---

### 50. Trial com Fila de Espera (controle de volume)

**Status:** Planejado
**Prioridade:** Baixa (quando trial escalar)
**Estimativa:** 1 dia
**Quando:** Trials simultâneos > 30

**O que fazer:**
- Se trials simultâneos > limite configurável: "Seu teste começa em X dias"
- Cria antecipação (escassez psicológica)
- Controla infra (nunca excede capacidade da VPS)
- Notifica quando vaga abrir

---

## ⚪ FUTURO — FLUXOS AVANÇADOS

### 32. Conversation Flows Engine (LangGraph — Grafos de Agentes)

**Prioridade:** Média (melhoria de arquitetura, não bloqueia funcionalidade)
**Quando:** Pós-beta — após validação com usuários reais
**Documentação completa:** [arquitetura-ia.md — Fluxo de Migração](./arquitetura-ia.md#fluxo-de-migração-beta--langgraph)

**Decisão estratégica:** Implementar APÓS o lançamento beta, não antes.

**Motivos para esperar:**
1. Risco de regressão — trocar o motor antes do beta pode quebrar fluxos funcionais
2. Validação primeiro — o beta mostra quais fluxos precisam de grafo
3. Escopo controlado — nós isolados já resolvem os problemas atuais
4. Migração incremental — cada fluxo pode ser migrado isoladamente

**Pré-requisitos já atendidos:**
- ✅ Módulo `ai/nodes/` com funções puras (migração 1:1 para nós LangGraph)
- ✅ Prompts separados em `ai/prompts/` (viram system prompts dos nós)
- ✅ Estado tipado em `ai/state.ts` (vira Annotation do LangGraph)
- ✅ AiFallbackAdapter desacoplado (funciona dentro dos nós)

**Estimativa total:** 5-6 dias (incremental, cada fase entrega valor)

---

### 15. Serviço de E-mail
- WhatsApp para notificações. E-mail só se necessário depois.

### 23. Dashboard web
- Visualização de leads, métricas, upload de materiais via web.

### 24. Envio em massa de materiais

**Cenário:** Professor diz "manda a aula 3 pra todos os alunos" ou "avisa a turma que a prova é segunda".

**O que falta:**
- Suporte a envio para múltiplos contatos (por nome, tag, ou "todos")
- Selecionar qual material enviar (listar materiais salvos)
- Rate limiting inteligente (WhatsApp bane se mandar muitas msgs rápido — espaçar 1-2s entre envios)
- Confirmação antes de disparar ("Enviar pra 10 contatos. Confirma?")

**Estimativa:** 2-3 dias

---

### 25. Tags/Grupos de contatos

**Cenário:** Corretor quer separar "compradores" de "vendedores". Professor quer "turma A" e "turma B".

**Estimativa:** 2 dias

### 26. Agendamento de mensagens

**Cenário:** Corretor quer mandar "bom dia" todo dia. Professor quer lembrete da prova na véspera.

**Estimativa:** 2 dias

### 27. Respostas automáticas com IA contextual

**Cenário:** Cleo responde perguntas frequentes com base no negócio do usuário.

**Estimativa:** 3-4 dias

### 28. Métricas e relatórios via WhatsApp

**Cenário:** "como foi meu mês?" → relatório direto no WhatsApp.

**Estimativa:** 2 dias

### 29. Catálogo de materiais organizados

**Cenário:** Nomear, listar, buscar e enviar materiais específicos.

**Estimativa:** 1-2 dias

---

## 🧪 COBERTURA DE TESTES E2E — LACUNAS

> Análise de cobertura do `tests/e2e-quality` vs fluxos que impactam a experiência do usuário.
> Modelo atual: personas autônomas + LLM-as-judge (conversacionais) e verificações determinísticas (técnicos).
>
> **Já coberto:** onboarding, client_message, owner_command (genérico), edge_case, trial_flow,
> payment_webhook, invite_flow, prospection_response, material_flow, local_classifier,
> configure_rules, degraded_fallback.

### 60. E2E — Assinatura expirada: Cleo 100% inoperante

**Status:** ✅ **Implementado** (set/2026) — cenário `subscription_expired` passando no `tests/e2e-quality`.
**Prioridade:** 🔴 Alta (bug silencioso grave se vazar resposta)
**Cenário:** Assinante pago com `subscription_expires_at` no passado. Cliente manda mensagem → a Cleo NÃO pode responder nada (nem dono, nem cliente).
**Tipo:** `deterministic` — setup: user com expiração no passado + sessão ativa → `sendMessageAsClient` → check de que **não** existe resposta outbound no banco.
**Cobertura extra:** o setup do cenário exigiu correção real em produção — `terms.repository.ts` retornava camelCase (bug que forçava aceite de termos em loop, bloqueando qualquer comando de dono).

### 61. E2E — Renovação de assinatura (lembretes + re-pagamento)

**Status:** ✅ **Implementado** (set/2026) — cenário `subscription_renewal` passando (renovação antecipada = expiração somada a partir da data antiga).
**Prioridade:** 🔴 Alta (receita)
**Cenário:** Lembrete -3d e -1d com link de checkout (subscription cron) + renovação antecipada soma a partir da expiração atual (não penaliza quem paga adiantado).
**Tipo:** `deterministic` — check do lembrete no banco (messages outbound) + simular pagamento e validar nova `subscription_expires_at` estendida corretamente.
**Pendente:** lembretes -3d/-1d do cron de billing (cobertos apenas via renovação; simular o cron é item opcional).

### 62. E2E — Cancelamento + reativação (grace period 30 dias)

**Status:** ✅ **Implementado** (chamada real ao `POST /api/cancellation/request`, status → `cancelled`, `access_until` ≈ start+30d). Reativação/purge pós-30d **não** cobertos.
**Prioridade:** 🔴 Alta (risco legal/CDC)
**Cenário:** Dono solicita cancelamento → acesso mantido até fim do período → confirmação via WhatsApp (data limite, reembolso 7 dias CDC) → reativação em 30 dias sem perda de dados → purga após 30 dias.
**Tipo:** `hybrid` — conversa pedindo cancelamento + checks no DB (`cancellations`, status da subscription).

### 63. E2E — Disconnect de colaborador (`disconnect_user`)

**Status:** ✅ **Implementado** (híbrido, passa 0.92): força primeira mensagem `desconecta <phone>`, cria colaborador via `createCollaborator`, valida `whatsapp_sessions.status='disconnected'` e vaga liberada.
**Prioridade:** 🔴 Alta
**Cenário:** Owner diz "desconecta 11999887766" → sessão do colaborador removida, slot liberado, invite revogado (status "revoked").
**Tipo:** `hybrid` — reaproveitar setup do `invite_flow` (colaborador conectado) + checks determinísticos.
**Cobertura extra:** expôs bug em `recognize-intent.ts` — fallback offline não extraía `phone` de comandos (`Qual número...?` mesmo com número na mensagem) nem reconhecia sinônimos ("cancela número", "remove acesso", "desvincula" etc.); corrigido com `extractPhoneEntity` + expansão de keywords + testes unitários (21 casos).

### 64. E2E — Agendar follow-up + disparo do cron

**Status:** Sem cobertura do intent `schedule_followup` nem do `follow-up.cron`
**Prioridade:** 🟡 Média-Alta (funcionalidade flagship do marketing)
**Cenário:** "agenda retorno pro João amanhã 14h" → registro em `follow_ups` → joga `scheduled_at` pro passado via SQL → cron dispara lembrete "🔔 Lembrete: ... Contato: ..." no formato correto (omite linha se sem telefone).
**Tipo:** `hybrid` — comando via persona + checks determinísticos (`getFollowUps` já existe no simulator).

### 65. E2E — Contatos ignorados (ciclo completo)

**Status:** Sem cobertura dos intents `ignore_contact`, `list_ignored`, `stop_ignoring`
**Prioridade:** 🟡 Média-Alta (falha = Cleo respondendo contato pessoal do dono)
**Cenário:** "ignora 11999..." → contato manda msg → Cleo NÃO responde → "quem tá ignorado?" lista → "para de ignorar 11999..." → contato volta a ser respondido.
**Tipo:** `hybrid` (conversacional + check de ausência/presença de resposta).

### 66. E2E — Intents de consulta específicos

**Status:** `owner_command` é genérico; intents isolados sem cobertura
**Prioridade:** 🟡 Média
**Cenários:** `help` ("o que você faz?"), `list_leads`, `leads_today`, `hot_leads`, `lead_status` ("como tá o João?" — exige lead pré-semeado no banco).
**Tipo:** `hybrid`, max 3-4 turnos por intent.

### 67. E2E — Onboarding do colaborador (lado convidado)

**Status:** Sem cobertura (invite_flow para no envio do convite)
**Prioridade:** 🟡 Média
**Cenário:** Colaborador recebe token → aceita termos LGPD → onboarding leve (nome + horário) → QR Code. Exercita endpoints `/invites/validate/:token`, `/invites/:token/accept`, `/invites/:token/qrcode`.
**Tipo:** `deterministic` (chamadas HTTP diretas, estilo `runPaymentWebhook`).

### 68. E2E — Fora do horário comercial (`fora_do_horario`)

**Status:** Sem cobertura da regra (só indireto via edge_case)
**Prioridade:** 🟢 Baixa-Média
**Cenário:** Business hours 08:00–18:00 + mensagem de cliente fora do expediente → resposta customizada configurada no onboarding.
**Tipo:** `deterministic` (mockar/temporizar timestamp).

### 69. E2E — Comando por áudio (transcrição Whisper)

**Status:** Sem cobertura de `transcribeAudio`
**Prioridade:** 🟢 Baixa (difícil simular — Evolution busca mídia real)
**Cenário:** Webhook com `audioMessage` → transcrição → intent executada. Provavelmente requer mock da Evolution/media.

### 70. E2E — Primeira mensagem / boas-vindas (`primeira_mensagem`)

**Status:** Sem teste explícito (só indireto em client_message)
**Prioridade:** 🟢 Baixa
**Cenário:** Contato novo manda primeira mensagem → mensagem de boas-vindas configurada é disparada.
**Tipo:** `deterministic`/`hybrid`.

### 71. E2E — Alerta de desconexão (connection-monitor)

**Status:** Sem cobertura do `connection-monitor.cron`
**Prioridade:** 🟢 Baixa (crítico em produção, mas requer mock da Evolution)
**Cenário:** Sessão cai → marca no banco → WhatsApp ao dono: "Sua conexão caiu... link pra reconectar".

**Implementação sugerida (ordem):** #64, #65 (seguinte bloco prioritário), depois #66, #67; itens baixos: #68-71. _(Atualizado: #60-#63 concluídos em set/2026.)_
Cada cenário segue o padrão existente: entrada em `Scenario` + metadata em `config.ts`, expectativa em `judge.ts` (`FUNCTIONAL_SCENARIOS`/`getScenarioExpectation`), instruções de persona em `autonomous-user.ts`, setup em `scenarios/conversational.ts` (ou runner em `scenarios/technical.ts` se determinístico) e persona em `personas.json`.

**Fixes de infra do E2E (set/2026):** judge Gemini agora usa `maxTokens ≥ 2048` (modelo 3.6 consome tokens de "thinking" e truncava o JSON em 300), com retry + backoff em 429/5xx, parse tolerante a fences/think-tags/trailing commas e retry com prompt estrito. `E2E_DEBUG=1` loga a resposta bruta em falha. `run.ts` refatorado em módulos (`cli.ts`, `runner.ts`, `report.ts`, `interactive.ts`, `scenarios/technical.ts`, `scenarios/conversational.ts`) — ver "Como adicionar um novo cenário" no README dos testes.

### 72. Bug — Respostas da instância `secretary` perdidas quando o envio WhatsApp falha

**Status:** ✅ **Corrigido** (set/2026)
**Prioridade:** 🔴 Crítica (produção)

**Problema:** Em `message.processor.ts`, o `handleSecretaryMessage` enviava todas as respostas via `messaging.sendText` diretamente — sem persistir antes e sem try/catch. Se a Evolution API falhasse (instância `secretary` desconectada, HTTP 500), a exceção matava o job da fila (→ retries → DLQ) e a resposta NUNCA era persistida: onboarding, ativação, respostas a prospecção e comandos do dono simplesmente desapareciam. O fluxo de cliente (`handleUserWhatsAppMessage`) já usava persist-then-dispatch + `safeSend`; o secretary não.

**Correção:** helper `respond()` (persiste via `messageRepo.save` quando há leadId, depois `safeSend`) aplicado a TODOS os envios do `handleSecretaryMessage`: opt-out/interesse de prospecção, erros de código de ativação, mensagem de intro de ativação (com `leadService.findOrCreate`), respostas de onboarding (incl. transcrição de áudio), respostas de consentimento de termos, comandos de áudio do dono e confirmação de material recebido. `ownerLead` agora é criado mais cedo (antes dos checks de onboarding/termos) para que toda resposta ao dono seja persistida.

**Detecção:** cenário E2E `onboarding` falhando — resposta ausente no banco com Evolution offline.

---

## Resumo

| Status | Itens |
|--------|-------|
| ✅ Concluídos | #1-11, #13, #14 (código), #17, #18, #20, #21, #30, #31, #33-40, #51, Migração Supabase → PostgreSQL + Drizzle ORM |
| 🔴 Bloqueante | #22 (deploy) |
| 🟡 Pós-lançamento | #14 (config), #16, #19 |
| 🧪 Testes E2E (lacunas) | #64-71 (ver seção "Cobertura de Testes E2E"; #60-63 ✅ testes E2E implementados e passando) |
| ⚪ Futuro | #15, #23-29, #32 (LangGraph) |

---

## Fluxo completo do serviço em produção

```
CLIENTE NOVO (Owner):
  hicleo.com.br → Escolhe plano → Paga (PIX/cartão)
    → Webhook MP confirma → Cria user (email + plan + subscription)
    → Gera código ATIVAR-XXXX vinculado ao user_id
    → Redireciona pra /ativacao?code=ATIVAR-XXXX
    → Usuário abre WhatsApp da Cleo, manda código
    → Cleo busca user existente, complementa com phone/name
    → Onboarding conversacional (nome, negócio, público, tom, horário, fora horário)
    → /conectar mostra "0 de N conexões" + QR Code
    → Escaneia QR Code → Cleo começa a trabalhar

RENOVAÇÃO (user existente com phone):
  hicleo.com.br/checkout → Paga com mesmo email
    → Backend detecta user existente com phone (já ativou)
    → Apenas renova subscription (estende expiração)
    → Atualiza plano se mudou (upgrade/downgrade)
    → NÃO gera código novo
    → Notifica via WhatsApp: "Pagamento confirmado, assinatura renovada!"
    → Frontend mostra toast de sucesso e redireciona pra home

COLABORADORES (planos Equipe/Empresa):
  Owner conectado diz pra Cleo: "convida 11999887766"
    → Cleo verifica slots disponíveis
    → Gera invite token (72h validade)
    → Envia link pro colaborador via WhatsApp
  Colaborador recebe link → /conectar/convite?token=XXXX
    → Aceita termos LGPD
    → Onboarding leve (nome + horário)
    → Escaneia QR Code → conectado com business profile próprio

DESCONEXÃO/SUBSTITUIÇÃO:
  Owner diz: "desconecta 11999887766"
    → Cleo desconecta a sessão → libera o slot
    → Owner pode convidar outro colaborador

OPERAÇÃO DIÁRIA:
  Aluno/cliente manda mensagem → Evolution API → Webhook → Fila
    → Regras automáticas (boas-vindas, fora de horário)
    → Lead criado automaticamente
    → Follow-up se não responder em 48h

  Professor/dono conversa com Cleo:
    → "ajuda" → lista todas as capacidades por categoria
    → "quem tá sem resposta?" → lista leads pendentes
    → "como tá o João?" → ficha completa (status, última msg, tempo sem interação)
    → "agenda retorno pro João amanhã 14h" → follow-up agendado com confirmação
    → "muda horário pra 8h às 20h" → atualiza configuração direto pelo chat
    → "manda material pro João" → forward do último arquivo
    → "convida 11999..." → gera convite e manda link
    → "desconecta 11999..." → libera slot
    → Manda PDF/imagem → Cleo armazena como material

CANCELAMENTO:
  POST /api/cancellation/request
    → Processa cancelamento imediato
    → Mantém acesso até final do ciclo pago
    → Verifica elegibilidade reembolso (7 dias CDC)
    → Envia confirmação detalhada via WhatsApp:
      - Data limite de acesso
      - Se tem direito a reembolso
      - Dados guardados por 30 dias (grace period)
      - Link para renovar caso mude de ideia

MONITORAMENTO:
  Monitor de conexão (5 em 5 min):
    → Verifica instância principal (secretária) → alerta admin
    → Verifica TODAS as sessões dos usuários:
      - Se desconectou → marca no banco + envia WhatsApp ao user:
        "Sua conexão caiu, equipe está ciente, link pra reconectar"
  Subscription cron → lembretes 3d e 1d antes de vencer → expira vencidas → desconecta TODAS sessões
  Cancellation cron → desconecta sessões expiradas → purga dados após grace period (30 dias)
  Contact monitor → alerta admin se total de contatos exceder threshold

SLOTS E PLANOS:
  Solo = 1 conexão | Equipe = até 3 | Empresa = até 8
  max_connections_override permite deals customizados (10, 20, 50, 100+)
```
