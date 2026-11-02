# Plano de Implementação — Dev seguro + Deploy Oracle Free

> **Status:** planejado, **não iniciado** (nenhuma fase executada)
> **Última atualização:** 2026-11-02
> **Objetivo:** uma base de dev para desenvolver com segurança e uma versão de produção
> que seja a **mesma stack** com apenas as configurações necessárias para subir na VPS
> (Oracle Cloud Always Free).

Este documento é o **checklist executável**. O guia operacional completo continua em
[`deploy-producao.md`](./deploy-producao.md); o histórico de bugs em
[`debitos-tecnicos.md`](./debitos-tecnicos.md).

---

## Índice

- [1. Princípios e decisões](#1-princípios-e-decisões)
- [2. Estado atual do repositório](#2-estado-atual-do-repositório)
- [3. Lacunas a fechar](#3-lacunas-a-fechar)
- [4. Fases de implementação](#4-fases-de-implementação)
- [5. Runbook Oracle Cloud](#5-runbook-oracle-cloud)
- [6. Critérios de aceite](#6-critérios-de-aceite)
- [7. Riscos e plano B](#7-riscos-e-plano-b)
- [8. Débitos e decisões em aberto](#8-débitos-e-decisões-em-aberto)
- [9. Referências](#9-referências)

---

## 1. Princípios e decisões

| # | Decisão | Motivo |
|---|---------|--------|
| D1 | **Compose base + override de dev + override de prod** (padrão oficial do Docker) | Dev e prod hoje são dois arquivos duplicados e já divergiram 2× (healthcheck `pg_isready`, `HOSTNAME` do Next) |
| D2 | **Base “prod-safe”**: sem portas públicas, sem segredos, `NODE_ENV=production` | Se alguém esquecer o override, o pior cenário é “não subiu”, nunca “subiu exposto” |
| D3 | **Override de dev carregado automaticamente** (`docker-compose.override.yml`) | Dev continua com **um** comando: `docker compose up -d` |
| D4 | **Oracle Cloud Always Free** — `VM.Standard.A1.Flex` 2 OCPU / 12 GB / GRU | R$ 0/mês e 7× de folga de RAM (stack usa ~1,1–1,6 GB; pico de build ~3,6 GB) |
| D5 | **VPS única (sem HA)** → IP reservado + backup fora da VM são **obrigatórios** | Sem isso, um stop/start ou a perda da VM derruba DNS e dados |
| D6 | **TLS:** Cloudflare Origin Cert + nginx *(recomendado)* **ou** Caddy (auto-HTTPS) | Reaproveita 100% do `nginx/nginx.conf` já endurecido; Caddy é alternativa se não quiser Cloudflare |
| D7 | **Frontend é build-time** (`NEXT_PUBLIC_*`) → buildar no servidor com `.env.production` | Não existe “build once, promote” com `NEXT_PUBLIC_*` (débito em §8) |
| D8 | Coolify/Dokploy **depois**, não agora | Painel self-hosted exige +2 GB de RAM e migração da stack; não acelera o primeiro deploy |

---

## 2. Estado atual do repositório

**Já pronto (não refazer):**

- `docs/tecnico/deploy-producao.md` — providers, dimensionamento medido, SSL, UFW, backup, monitoramento, checklist.
- `docker-compose.prod.yml` — 7 serviços, `restart: always`, **limites de CPU/RAM por serviço**, volumes persistentes, portas internas em `expose`.
- `nginx/nginx.conf` — HSTS, headers de segurança, rate limit (30r/s geral, 10r/s API), bloqueio de `/(8080|5432|6379)`, `/api`, `/webhooks` (20 MB), `/health`, ACME challenge.
- `scripts/setup-firewall.sh` (UFW) e `scripts/backup-db.sh` (`pg_dump` com retenção).
- Healthchecks + `depends_on: service_healthy`.
- Seção **2.5 Oracle Always Free** já validada (ARM, limites do free tier, “out of capacity”).

**Validações feitas para este plano (2026-11-02):**

| Verificação | Resultado |
|---|---|
| `evoapicloud/evolution-api:v2.3.7` tem ARM64? | ✅ `docker manifest inspect` → `architecture: arm64` |
| `node:22-alpine` tem ARM64? | ✅ |
| Crons e fuso horário | Crons usam o TZ do processo → em UTC mudam de horário (ver O3) |
| Webhook atual | `EVOLUTION_WEBHOOK_SECRET` **vazio** → endpoint aceita qualquer POST (`{"received":true} 200`) |
| Bundle do frontend | Contém `localhost:3001` (fallback) porque `NEXT_PUBLIC_API_URL` está vazia |

---

## 3. Lacunas a fechar

### 3.1 Produto / paridade dev↔prod

| ID | Lacuna | Impacto | Fase |
|----|--------|---------|------|
| **L1** | Compose duplicado (dev × prod), sem base comum | Drift; dev já quebrou (`frontend unhealthy` 25 h, `FATAL` de banco a cada 10 s) | 0 |
| **L2** | `NEXT_PUBLIC_API_URL` vazia → bundle aponta para `localhost:3001` | **Site sem API na VPS** | 1 |
| **L3** | `EVOLUTION_WEBHOOK_SECRET` vazio; Evolution sem `headers` | Webhook aceita qualquer POST — ou, se preencher sem configurar a Evolution, **401 em tudo** | 1 |
| **L4** | `location /api/` com buffering + `proxy_read_timeout 30s` | **QR Code congela** atrás do nginx (SSE) | 1 |
| **L5** | Dev publica `5434/6379/8082/3000/3001` em `0.0.0.0` | Postgres/Redis expostos na rede local | 1 |
| **L6** | Frontend `node:20-alpine` × backend `node:22-alpine` | Bases divergentes | 1 |
| **L7** | Sem CI, sem `deploy.sh`, sem `.env.production.example` | Deploy manual e sujeito a erro | 2–3 |
| **L8** | `certbot_webroot` existe, mas não há serviço certbot | Renovação de TLS manual (ou depende de Cloudflare) | 1/2 |

### 3.2 Específicas do Oracle Free

| ID | Lacuna | O que acontece | Fase |
|----|--------|----------------|------|
| **O1** | **iptables do Oracle** | Imagens Ubuntu trazem `REJECT` **antes** do UFW: você abre 80/443 na Security List e no UFW e o site **continua inacessível** | 2 |
| **O2** | **IP público efêmero** | Stop/start troca o IP → DNS quebrado e webhook da Evolution perdido | 2 |
| **O3** | **Crons em UTC** | `CANCELLATION_CRON_SCHEDULE=0 0 * * *` roda **21h BRT da véspera**; `trial-prospection` às **7h BRT** | 1 |
| **O4** | **Backup no mesmo disco** | `backups/` no boot volume morre com a VM; `evolution_data` (sessão do WhatsApp) nem é copiado | 2 |

---

## 4. Fases de implementação

> **Leitura rápida:** só 🏁 bloqueia o go-live (~1h30). Tudo em 🧱 pode ir depois.

| Bloco | Itens | Tempo |
|---|---|---|
| 🏁 **Go-live** | Fase 1a (SSE + `NEXT_PUBLIC_*`), `.env.production`, bootstrap da VM, DNS/TLS, `deploy.sh`, runbook Oracle | **~1h30** |
| 🧱 **Robustez** | Fase 0 (paridade compose), Fase 1b (TZ/loopback/node:22/secret), backup offsite, CI | ~2h45 |

### ✅ Já entregue (não repetir)

- Migrations versionadas + seeds aplicados em toda subida (Fase 0.5) — `schema_migrations`, serviço `migrate` one-shot
- Healthchecks (`pg_isready -d`) e `HOSTNAME` do Next (D11)
- Re-sync de webhook no startup da Evolution (D12)
- Preços (89,90 / 239,90 / 629,90) e ordem de vitrine por `sort_order` + `ORDER BY`
- `226` testes verdes (`npx vitest run`)

### Fase 0 — 🧱 Paridade dev/prod (pós-go-live, ~1 h)

- [ ] `docker-compose.yml` → **base prod-safe** (serviços, healthchecks, redes, volumes; sem portas públicas, sem segredos, `NODE_ENV=production`)
- [ ] `docker-compose.override.yml` → **dev** (portas em `127.0.0.1`, `NODE_ENV=development`, `LOG_LEVEL=debug`, `extra_hosts`)
- [ ] `docker-compose.prod.yml` → **override de produção** (nginx 80/443, `redis --requirepass`, limites, logging, `TZ`)
- [ ] `docker-compose.local.yml` → **prod-like na máquina** (nginx em 9080/9443)
- [ ] `scripts/compose-check.sh` → `config -q` nos 3 modos + falha se prod publicar `3000/3001/5433/5434/6379/8082`
- [ ] Atualizar `README.md` (dev = 1 comando) e o índice de `deploy-producao.md`

**Aceite:** `docker compose up -d` (dev) → 7 containers healthy · prod-like responde em 9080/9443 ·
`./tests/e2e-quality/run-e2e.sh --single owner_command` passa · `compose-check.sh` verde.

### Fase 0.5 — Banco: migrations versionadas e seeds ✅ CONCLUÍDA (2026-11-02)

Motivo: as migrations rodavam em `/docker-entrypoint-initdb.d`, que o Postgres **só executa com volume vazio**. O log `Skipping initialization` provava que a próxima migration nunca seria aplicada; e `backend/scripts/migrate.ts` quebrava com `import.meta.dirname` (undefined em CJS) e reaplicava todos os arquivos.

- [x] Runner em `backend/src/scripts/migrate.ts` (compila para `dist/scripts/migrate.js`)
- [x] `schema_migrations(version, applied_at)` — aplica só o pendente, em ordem, em transação
- [x] `pg_advisory_lock` (um migrador só, mesmo com N réplicas) e `--dry-run`
- [x] `dotenv/config` + erro claro quando falta `DATABASE_URL`
- [x] `backend/seeds/plan_limits.sql` com **UPSERT** — roda **toda subida** e atualiza preços/features
- [x] Serviço one-shot `migrate` no compose (dev e prod); `backend` depende de `service_completed_successfully`
- [x] Removido o mount `./backend/migrations:/docker-entrypoint-initdb.d` e o `INSERT` do `0001`
- [x] `drizzle.config.ts` com `out: './drizzle'` (não colide mais com as migrations SQL) + `migrations/meta/` removido
- [x] Testes: `migrate.test.ts` (+7) e validação real: 4 aplicadas → 2ª execução 0 pendentes → seed restaurou preço alterado (9999 → 4900)

**Como validar:** `docker compose up -d && docker compose logs migrate` → `0 pendente(s)` + `🌱 plan_limits.sql`; `docker compose ps -a` mostra `hicleo-migrate Exited (0)`.



### Fase 1a — 🏁 Crítico para o go-live (~30 min)

- [x] `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SITE_URL` explícitos no build de prod — `.env.production.example` + `deploy.sh` alerta se faltar
- [x] nginx: `location /api/` com `proxy_buffering off`, `proxy_cache off`, `proxy_read_timeout 1h`, `X-Accel-Buffering: no` (SSE do QR)

### Fase 1b — 🧱 Qualidade (pós-go-live, ~30 min)

- [ ] `EVOLUTION_WEBHOOK_SECRET` em prod **+** `headers: [{key: x-webhook-secret, value: ...}]` na instância (via `setWebhook`)
- [ ] Dev: portas em `127.0.0.1` (L5)
- [ ] `frontend/Dockerfile` → `node:22-alpine`
- [x] `TZ=America/Sao_Paulo` no backend e na evolution-api (`docker-compose.prod.yml`, via `${TZ}`)
- [ ] Remover `NODE_ENV` do `.env` (cada compose decide)

**Aceite:** QR via nginx (9443) não trava · `POST /webhooks/evolution` sem header → **401** e com header → **200** ·
`docker exec hicleo-backend date` no fuso de SP · crons com horário BRT.

### Fase 2 — 🏁 Deploy reproduzível (~1 h)

- [x] `scripts/oracle-bootstrap.sh` — **iptables 80/443 (O1)** + Docker + compose plugin + swap 2 GB + UFW
- [x] `scripts/deploy.sh` — `git pull` → `compose build` → `up -d` → espera `/health` → `image prune`
- [ ] `scripts/backup-offsite.sh` — `pg_dump` + `tar evolution_data` → Object Storage (O4)
- [x] `.env.production.example` versionado (contrato do servidor)
- [ ] Doc: **Reserved Public IP (O2)**, Security List, “out of capacity”, restaurar backup

**Aceite:** `deploy.sh` roda do zero em VM limpa · `backup-offsite.sh` gera arquivo **fora** da VM · restore testado.

### Fase 3 — 🧱 CI (pós-go-live, ~30 min)

- [ ] `.github/workflows/ci.yml` — backend `npm ci && npm test` (226 testes) + `npm run build`; frontend `npm ci && npm run build`
- [ ] (Opcional) `buildx --platform linux/arm64` → GHCR, para a VPS só fazer `pull`

**Aceite:** PR fica vermelho se teste ou build quebrar.

### Fase 4 — 🏁 Provisionar Oracle e subir (~45 min, operacional)

Executar o [runbook](#5-runbook-oracle-cloud) depois de 0–3 concluídas.

---

## 5. Runbook Oracle Cloud

```
1.  Home region = São Paulo (GRU) — não pode ser alterada depois
2.  VCN + Internet Gateway + Security List: ingress 22, 80, 443
3.  VM.Standard.A1.Flex · 2 OCPU / 12 GB · boot 100 GB · Ubuntu 24.04
      ↳ "Out of host capacity": tentar AD-1/2/3, ou 1 OCPU/6 GB primeiro
4.  Reserved Public IP  → anotar o IP (O2)
5.  SSH → bash scripts/oracle-bootstrap.sh   (iptables + docker + swap + ufw)  (O1)
6.  git clone + criar .env.production (a partir do .env.production.example)
7.  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
8.  Cloudflare: A → IP reservado · Origin Cert em nginx/ssl
9.  Abrir o painel → conectar WhatsApp (QR) → validar webhook (x-webhook-secret)
10. crontab: backup offsite diário + monitor externo (UptimeRobot) + fail2ban
```

---

## 6. Critérios de aceite

**Dev**
- [ ] `docker compose up -d` sobe tudo; nenhum processo Node na máquina
- [ ] E2E: `owner_command`, `edge_case` e `onboarding` ≥ 0,7
- [ ] `npx vitest run` (219 testes) verde

**Produção**
- [ ] `https://seudominio` 200 e `https://seudominio/health` 200
- [ ] `nmap` externo: apenas `22`, `80`, `443` abertos
- [ ] Webhook com secret (401 sem header / 200 com header)
- [ ] WhatsApp conectado e **mensagem real** respondida pela Cleo
- [ ] QR Code funciona **através do nginx** (SSE)
- [ ] Backup offsite gerado + **restore testado** em ambiente limpo
- [ ] Logs sem `ERROR`; `docker compose ps` 7/7 healthy; crons no horário BRT

---

## 7. Riscos e plano B

| Risco | Impacto | Mitigação |
|---|---|---|
| **“Out of host capacity”** no A1 | Não provisiona | Tentar ADs/horários; se passar de 2–3 dias → **Hetzner CX22** (~R$27/mês) com o **mesmo** compose |
| **Reclaim de VM ociosa** | Perder a VM | Baixo: crons 24/7 + connection-monitor a cada 5 min mantêm atividade; backup offsite cobre |
| **VM única = SPOF** | Indisponibilidade | IP reservado + backup offsite + monitor externo; HA só se houver receita |
| **`next build` estoura RAM** | OOM no build | 12 GB no A1 (3× o pico); swap 2 GB como cinto |
| **Secret do webhook sem header na Evolution** | 401 em tudo | Script/teste de verificação (Fase 1) + checklist |
| **Cloudflare mal configurada (SSL Flexible)** | Loop de redirect | Sempre **Full (strict)** com Origin Certificate |

---

## 8. Débitos e decisões em aberto

| Item | Situação |
|---|---|
| **Runtime config do frontend** | `NEXT_PUBLIC_*` é build-time → imagem amarrada ao ambiente. Evoluir para `/config.json` (runtime) |
| **Listar agenda do dono** (`list_followups`) | Não existe consulta de follow-ups pendentes; “ver a agenda” cai em `schedule_followup` |
| **Coolify / Dokploy** | Avaliar depois do go-live, se houver dor operacional (exige VPS 8 GB) |
| **TLS: Cloudflare vs Caddy** | **Decidir antes da Fase 2**. Cloudflare = reusa nginx; Caddy = auto-HTTPS sem Cloudflare |
| **Registry de imagens (GHCR)** | Opcional na Fase 3; reduz o deploy a `pull` |

---

## 9. Referências

**Internas**
- [`deploy-producao.md`](./deploy-producao.md) — guia operacional, seção 2.5 (Oracle), 5 (SSL), 6 (segurança), 7 (backup)
- [`debitos-tecnicos.md`](./debitos-tecnicos.md) — D1–D12 (bugs corrigidos)
- `docker-compose.yml`, `docker-compose.prod.yml`, `nginx/nginx.conf`, `scripts/`

**Externas**
- Docker — *Use Compose in production* (base + `-f compose.production.yaml`): <https://docs.docker.com/compose/how-tos/production/>
- Caddy — *Automatic HTTPS*: <https://caddyserver.com/docs/automatic-https>
- Coolify — requisitos (2 CPU / 2 GB / 10 GB): <https://coolify.io/docs/installation>
- Dokploy — requisitos (2 GB / 30 GB): <https://docs.dokploy.com/docs/core/installation>
- Evolution API (imagem `evoapicloud/evolution-api`, multi-arch): <https://github.com/EvolutionAPI/evolution-api>
- BullMQ/Redis — exigência de `maxmemory-policy noeviction` (já documentada em `docker-compose.prod.yml`)

