# Deploy em Produção — Hi Cleo

Guia completo para colocar o Hi Cleo em produção numa VPS limpa com Docker.

> **Pré-requisito:** Código 100% pronto. Este guia é 100% operacional.
>
> **Planejamento vivo:** `docs/tecnico/plano-implementacao-deploy.md` — checklist das fases
> (paridade dev/prod, segurança, deploy reproduzível, CI e runbook Oracle). Consulte-o antes
> de mudar `docker-compose*.yml`, `nginx.conf` ou scripts de deploy.

---

## Índice

1. [Visão geral da infraestrutura](#1-visão-geral-da-infraestrutura)
2. [Escolha de providers](#2-escolha-de-providers)
3. [Passo a passo do deploy](#3-passo-a-passo-do-deploy)
4. [Configuração do .env de produção](#4-configuração-do-env-de-produção)
5. [SSL/HTTPS](#5-sslhttps)
6. [Segurança do servidor](#6-segurança-do-servidor)
7. [Backup e recuperação](#7-backup-e-recuperação)
8. [Monitoramento](#8-monitoramento)
9. [Manutenção e operações](#9-manutenção-e-operações)
10. [Troubleshooting](#10-troubleshooting)
11. [Checklist final](#11-checklist-final)

---

## 1. Visão geral da infraestrutura

```
Internet
   │
   ▼
┌──────────────────────────────────────────────┐
│ VPS (Ubuntu 22.04+)                          │
│                                              │
│  UFW: allow 22, 80, 443 only                │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Docker Compose (rede interna)          │  │
│  │                                        │  │
│  │  nginx:443 ──┬── frontend:3000         │  │
│  │              ├── backend:3001          │  │
│  │              └── /webhooks → backend   │  │
│  │                                        │  │
│  │  backend ──┬── app-db:5432 (Postgres)  │  │
│  │            ├── redis:6379              │  │
│  │            └── evolution-api:8080      │  │
│  │                    │                   │  │
│  │                    └── evolution-db     │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Volumes: app_db_data, redis_data,           │
│           evolution_data, evolution_db_data   │
└──────────────────────────────────────────────┘
```

**Portas expostas ao mundo:** apenas 80 (redireciona para 443) e 443 (HTTPS via nginx).
Todas as outras portas são internas ao Docker e inacessíveis externamente.

**Requisitos mínimos:** 2 vCPU, 4GB RAM, 40GB SSD, Ubuntu 22.04 ou Debian 12.

> Medição real da stack (2026-10-27): **~1,1–1,6 GB de RAM em regime**; o pico é o `next build` (~3,6 GB no total). Com VPS de 4 GB, crie swap antes do build — ver [2.5.5](#255-build-arm64). Comparativo de providers em [2.1](#21-vps--opções-recomendadas).

---

## 2. Escolha de providers

### 2.1 VPS — Opções recomendadas

**Requisitos medidos da stack completa** (7 containers: nginx, backend, frontend, app-db, redis, evolution-api, evolution-db):

| Recurso | Necessário | Observação |
|---|---|---|
| RAM em regime | ~1,1–1,6 GB | soma dos `deploy.resources` = teto de ~2 GB |
| RAM no pico do build | ~3,6 GB | `next build` consome 1–2 GB extra |
| CPU | ~0,3–0,8 core médio | limites do compose somam 4.0 CPU (são tetos, não uso real) |
| Disco | 40 GB+ | imagens Docker ~3 GB + volumes + backups |

| Provider | Plano sugerido | vCPU | RAM | SSD | Preço/mês | Observação |
|----------|---------------|------|-----|-----|-----------|-----------|
| **Oracle Cloud** | Always Free (A1.Flex) | 2 (ARM) | **12GB** | 200GB | **R$ 0** | Grátis para sempre, DC em São Paulo, exige build ARM — ver [2.5](#25-oracle-cloud-always-free) |
| **Hetzner** (menor esforço) | CX22 | 2 | 4GB | 40GB | €4,35 (~R$27) | Melhor custo-benefício x86, DC na Europa |
| **Hostinger** | KVM 2 | 2 | 8GB | 100GB | $8,79 (~R$48) | Painel em PT, build sem sufoco |
| **Contabo** | VPS S | 4 | 8GB | 200GB | €6,99 (~R$43) | Mais recursos por menos, I/O mais lento |
| **DigitalOcean** | Basic Droplet | 2 | 4GB | 80GB | $24 (~R$130) | DC em SP |
| **Vultr** | Cloud Compute | 2 | 4GB | 80GB | $24 (~R$130) | DC em SP |

**Recomendação para o beta (custo mínimo):** **Oracle Cloud Always Free** — R$ 0/mês, 12 GB de RAM e região em São Paulo. Validação técnica e riscos em [2.5](#25-oracle-cloud-always-free).

**Recomendação para o beta (menor esforço):** **Hetzner CX22** (~R$27) — x86, sem configuração de rede exótica. Com 4 GB, configure swap antes do primeiro build (ver [2.5.5](#255-build-arm64)).

**Se latência importa (clientes no Brasil):** Oracle em São Paulo (grátis) ou Vultr/DigitalOcean SP (pago). Alternativa universal: VPS na Europa + **Cloudflare** na frente (grátis) resolve o TTFB do site, já que WhatsApp é assíncrono e não sofre com latência.

### 2.2 Domínio

| Registrador | Preço .com.br/ano | Observação |
|-------------|-------------------|-----------|
| **Registro.br** | R$40 | Oficial, mais barato para .com.br |
| **Cloudflare Registrar** | Preço de custo (~$10/ano para .com) | Sem markup, DNS incluso |
| **Namecheap** | ~$9/ano (.com) | Interface simples, WHOIS privacy grátis |

**Recomendação:** Registrar `hicleo.com.br` no Registro.br + usar Cloudflare como DNS (gratuito).

### 2.3 SSL/HTTPS

| Opção | Custo | Renovação | Complexidade |
|-------|-------|-----------|-------------|
| **Cloudflare (recomendado)** | Grátis | Automática (15 anos) | Baixa — Origin Certificate no painel |
| **Let's Encrypt (certbot)** | Grátis | A cada 90 dias (automatizável) | Média — requer container certbot |
| **ZeroSSL** | Grátis (3 certs) | A cada 90 dias | Média |

**Recomendação:** Cloudflare Origin Certificates. Zero manutenção, validade de 15 anos.

### 2.4 Chip WhatsApp

- **Operadora:** qualquer (Vivo, Claro, Tim, Oi)
- **Tipo:** pré-pago (mais barato, sem contrato)
- **Requisitos:** ativar WhatsApp antes de conectar na Evolution API
- **Importante:** NUNCA usar esse chip para conversas pessoais — exclusivo da Cleo
- **Custo:** ~R$15-20 (chip + primeira recarga)

---

### 2.5 Oracle Cloud Always Free

Validação feita em 2026-10-27: **a stack completa roda no free tier**, com folga de hardware. O custo não é dinheiro — é tempo de configuração e a disponibilidade de shapes.

#### 2.5.1 ⚠️ O Free Tier encolheu (correção de informação antiga)

A documentação oficial atual diz:

> *"All tenancies get the first **1,500 OCPU hours and 9,000 GB hours per month** for free for VM instances using the VM.Standard.A1.Flex shape... equivalent to **2 OCPUs and 12 GB of memory**."*

Versões anteriores deste guia citavam **4 OCPU / 24 GB**. O modelo mudou para **horas mensais**, que sustentam ~2 OCPU e ~12 GB rodando 24/7. Ainda é a opção com mais RAM entre as gratuitas/baratas.

#### 2.5.2 Limites reais do Always Free

| Recurso | Limite |
|---|---|
| Ampere A1 (ARM) | 1.500 OCPU-h + 9.000 GB-h/mês → **2 OCPU + 12 GB** 24/7 |
| Micro AMD | até 2 × `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB cada) |
| Block storage | **200 GB** total |
| Boot volume mínimo | **47 GB por instância A1** |
| Tráfego de saída | **10 TB/mês** |
| Região | Obrigatoriamente a *home region* |
| E-mail porta 25 | ❌ bloqueado |

#### 2.5.3 Validação técnica (arquitetura ARM64)

Verificado no repositório:

| Dependência | ARM64? | Evidência |
|---|---|---|
| `evoapicloud/evolution-api:v2.3.7` | ✅ | `docker manifest inspect` → `"architecture": "arm64"` |
| `postgres:16-alpine` | ✅ | imagem oficial multi-arch |
| `redis:7-alpine` | ✅ | imagem oficial multi-arch |
| `nginx:1.27-alpine` | ✅ | imagem oficial multi-arch |
| `node:22-alpine` / `node:20-alpine` | ✅ | imagens oficiais têm variante arm64 |
| Next.js SWC | ✅ | `frontend/package-lock.json` já contém `@next/swc-linux-arm64-musl` |
| Dependências nativas do backend | ✅ | nenhuma (`sharp`, `bcrypt`, `canvas`, `node-gyp`, `ffmpeg`) |
| Baileys / WhatsApp | ✅ | JS puro |

**Não há bloqueio arquitetural.** Todas as peças críticas têm build ARM64.

#### 2.5.4 Capacidade vs. stack

| Recurso | Necessário | Oracle Free | Folga |
|---|---|---|---|
| RAM em regime | ~1,1–1,6 GB | 12 GB | **7×** |
| RAM no pico do build | ~3,6 GB | 12 GB | **3×** |
| CPU | ~0,3–0,8 core médio | 2 OCPU ARM dedicados | confortável |
| Disco útil | ~3 GB + volumes | ~153 GB (200 − 47 boot) | **50×** |

#### 2.5.5 Build ARM64

Como as imagens de backend e frontend são builds locais, na VPS ARM o build funciona nativo:

```bash
# na própria instância ARM
docker compose -f docker-compose.prod.yml up -d --build
```

Se for buildar do x86 e enviar para a ARM (ex.: buildar no notebook e publicar em registry):

```bash
docker buildx create --use --name hicleo-builder    # se ainda não existir
docker buildx build --platform linux/arm64 \
  -t SEU_REGISTRY/hi-cleo-backend:latest ./backend --push

docker buildx build --platform linux/arm64 \
  -t SEU_REGISTRY/hi-cleo-frontend:latest ./frontend --push
```

> Em VPS com 4 GB (Hetzner CX22, por exemplo), crie swap **antes** do build — o `next build` pode ser morto pelo OOM killer:
> ```bash
> fallocate -l 4G /swapfile && chmod 600 /swapfile
> mkswap /swapfile && swapon /swapfile
> echo '/swapfile none swap sw 0 0' >> /etc/fstab
> ```

#### 2.5.6 Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| **"Out of host capacity"** ao criar a instância A1 | Não consegue provisionar | Tentar outro Availability Domain ou horários alternados; alguns usuários usam script de retry |
| **Reclaim de instância ociosa** | Perder a VM | Baixo neste projeto: crons 24/7 (follow-up, subscription, contact-monitor, trial-prospection) e connection-monitor a cada 5 min mantêm a VM ativa |
| **Configuração de rede (VCN)** | 30–60 min de setup | VCN + Internet Gateway + Security List equivale ao `scripts/setup-firewall.sh` |
| **Boot volume de 47 GB** | Menos disco que 200 GB nominais | Sobram ~153 GB — suficiente para o beta |

#### 2.5.7 Checklist de provisionamento

1. Criar conta Oracle Cloud e escolher **home region = São Paulo (GRU)** (a região não pode ser alterada depois e impacta latência)
2. Criar VCN com Internet Gateway e Security List liberando **22, 80, 443** (equivalente ao UFW)
3. Criar instância `VM.Standard.A1.Flex` com **2 OCPU / 12 GB**, boot volume **47–100 GB**, Ubuntu 22.04+ ou Debian 12
4. Se der "out of host capacity": tentar outro AD / aguardar
5. Instalar Docker + Compose (`apt install docker.io docker-compose-plugin`)
6. Seguir o [passo a passo do deploy](#3-passo-a-passo-do-deploy) normalmente

**Plano B:** se a instância A1 não for provisionada em 2–3 dias, migrar para **Hetzner CX22** (~R$27/mês) — x86, sem ARM, sem configuração de rede exótica.

---

## 3. Passo a passo do deploy

### 3.1 Preparar o servidor

```bash
# Conectar via SSH
ssh root@SEU_IP

# Atualizar sistema
apt update && apt upgrade -y

# Instalar Docker + Compose
apt install -y docker.io docker-compose-plugin git curl

# Verificar versões
docker --version       # Docker 24+
docker compose version # Compose v2+

# Criar usuário de deploy (não rodar como root no dia a dia)
adduser deploy
usermod -aG docker deploy
# Opcional: configurar chave SSH para o user deploy
```

### 3.2 Clonar repositório

```bash
# Como root ou deploy
cd /opt
git clone SEU_REPOSITORIO hi-cleo
cd hi-cleo

# Copiar template de env
cp .env.example .env
```

### 3.3 Gerar senhas fortes

```bash
# Gerar 3 senhas únicas (32 chars, base64)
echo "DB_PASSWORD=$(openssl rand -base64 32)"
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
echo "EVOLUTION_DB_PASSWORD=$(openssl rand -base64 32)"

# Copiar cada saída e colar no .env
```

### 3.4 Configurar .env

Editar com `nano .env` ou `vim .env`. Ver seção [4. Configuração do .env](#4-configuração-do-env-de-produção) para referência completa.

### 3.5 Proteger o .env

```bash
chmod 600 .env
# Apenas root e o user que criou conseguem ler
```

### 3.6 Instalar certificados SSL

Ver seção [5. SSL/HTTPS](#5-sslhttps) para instruções detalhadas.

```bash
# Após obter os certificados:
ls nginx/ssl/
# fullchain.pem  privkey.pem
```

### 3.7 Configurar firewall

```bash
sudo bash scripts/setup-firewall.sh

# Verificar
sudo ufw status
# Status: active
# 22/tcp   ALLOW
# 80/tcp   ALLOW
# 443/tcp  ALLOW
# (tudo mais DENY)
```

### 3.8 Subir a aplicação

```bash
docker compose -f docker-compose.prod.yml up -d --build

# Acompanhar logs durante o build
docker compose -f docker-compose.prod.yml logs -f

# Verificar saúde dos containers
docker compose -f docker-compose.prod.yml ps
# Todos devem estar "Up" com "(healthy)"
```

### 3.9 Verificar saúde

```bash
# Health check via curl
curl -s https://SEU_DOMINIO/health | jq .
# Resposta esperada:
# { "status": "healthy", "env": "production", "checks": { "server": "ok", "database": "ok", "redis": "ok" } }
```

### 3.10 Configurar backup automático

```bash
# Criar diretório de backups
mkdir -p /opt/hi-cleo/backups

# Adicionar ao cron (executa às 3h da manhã)
crontab -e
# Colar a linha:
0 3 * * * /opt/hi-cleo/scripts/backup-db.sh >> /var/log/hicleo-backup.log 2>&1
```

### 3.11 Conectar WhatsApp

1. Acessar `https://SEU_DOMINIO/health` — confirmar que está saudável
2. O backend cria automaticamente a instância na Evolution API (via `ensureEvolutionInstance`)
3. No primeiro deploy, a instância não terá QR Code — será gerada quando o 1º usuário conectar

**Para teste manual (opcional):**
```bash
# Ver instâncias criadas
docker exec hicleo-backend wget -qO- http://evolution-api:8080/instance/fetchInstances \
  --header="apikey: SUA_EVOLUTION_API_KEY" | jq .
```

### 3.12 Configurar Mercado Pago (produção)

1. Acessar [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel/app)
2. Criar aplicação de produção (não sandbox)
3. Copiar `Access Token` (começa com `APP_USR-`) → `.env` (`MERCADO_PAGO_ACCESS_TOKEN`)
4. Configurar webhook no painel MP:
   - URL: `https://SEU_DOMINIO/webhooks/mercadopago`
   - Eventos: `payment`, `merchant_order`
5. Copiar `Webhook Secret` → `.env` (`MERCADO_PAGO_WEBHOOK_SECRET`)

### 3.13 Teste end-to-end

```
1. Acessar https://SEU_DOMINIO — landing page carrega?
2. Iniciar trial (nome + telefone) — código gerado?
3. Enviar código pro WhatsApp da Cleo — ativou?
4. Responder onboarding (7 etapas) — completou?
5. Escanear QR Code — conectou?
6. Pedir a um amigo mandar mensagem — Cleo respondeu?
7. Testar checkout real (R$1 via PIX) — pagamento confirmou?
```

---

## 4. Configuração do .env de produção

Exemplo completo com valores reais (senhas fictícias):

```bash
# === BACKEND ===
PORT=3001
NODE_ENV=production

# Database
DATABASE_URL=postgresql://hicleo:SENHA_FORTE_32_CHARS@app-db:5432/hicleo
DB_USER=hicleo
DB_PASSWORD=SENHA_FORTE_32_CHARS_AQUI_abc123XYZ
DB_NAME=hicleo

# IA (pelo menos 1 obrigatório)
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxx
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXX
AI_DAILY_CALL_BUDGET=5000

# Messaging
MESSAGING_PROVIDER=evolution-api
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=SUA_KEY_FORTE_32_CHARS
EVOLUTION_WEBHOOK_SECRET=secret_compartilhado

# WhatsApp
SECRETARY_PHONE=5511999998888
WEBHOOK_URL=http://backend:3001/webhooks/evolution

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=SENHA_FORTE_32_CHARS_REDIS

# Monitoramento
MONITOR_ADMIN_PHONE=5511999997777
MONITOR_INSTANCE=secretary

# Logger
LOG_LEVEL=info
LOG_DIR=./logs

# Mercado Pago (PRODUÇÃO — não TEST)
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-xxxxxxxxxxxx
MERCADO_PAGO_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx

# URLs (seu domínio real)
SITE_URL=https://hicleo.com.br
CHECKOUT_URL=https://hicleo.com.br/checkout
CORS_ORIGIN=https://hicleo.com.br

# Rate limiting
RATE_LIMIT_GLOBAL=200
RATE_LIMIT_PAYMENTS=5

# Sentry (opcional mas recomendado)
SENTRY_DSN=https://xxxxx@o1234.ingest.sentry.io/5678

# === FRONTEND ===
NEXT_PUBLIC_API_URL=https://hicleo.com.br
NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY=APP_USR-xxxxxxxx
NEXT_PUBLIC_SECRETARY_PHONE=5511999998888
NEXT_PUBLIC_SITE_URL=https://hicleo.com.br
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@o1234.ingest.sentry.io/9012

# === EVOLUTION API ===
EVOLUTION_DB_USER=evolution
EVOLUTION_DB_PASSWORD=SENHA_FORTE_32_CHARS_EVOLUTION
EVOLUTION_DB_NAME=evolution
```

**Dicas:**
- `WEBHOOK_URL` usa hostname interno Docker (`backend:3001`), não o domínio público
- `CORS_ORIGIN` deve ser exatamente o domínio (sem trailing slash)
- `NEXT_PUBLIC_API_URL` é o domínio público (o browser acessa direto)
- Nunca commitar o `.env` — ele está no `.gitignore`

---

## 5. SSL/HTTPS

### Opção A — Cloudflare Origin Certificates (recomendado)

**Requisitos:** domínio com DNS apontado pro Cloudflare (nameservers Cloudflare).

1. No painel Cloudflare → SSL/TLS → Origin Server
2. "Create Certificate"
3. Tipo: RSA, Hostnames: `hicleo.com.br, *.hicleo.com.br`
4. Validade: 15 anos
5. Copiar o conteúdo:
   - **Origin Certificate** → salvar como `nginx/ssl/fullchain.pem`
   - **Private Key** → salvar como `nginx/ssl/privkey.pem`

```bash
# No servidor
nano nginx/ssl/fullchain.pem   # colar certificate
nano nginx/ssl/privkey.pem     # colar private key
chmod 600 nginx/ssl/privkey.pem
```

6. No Cloudflare → SSL/TLS → Mode: **Full (strict)**

**Vantagens:** zero renovação, zero manutenção, proteção DDoS inclusa.

### Opção B — Let's Encrypt (certbot)

Para quem não usa Cloudflare como proxy:

```bash
# Instalar certbot no host (fora do Docker)
apt install -y certbot

# Gerar certificado (antes de subir o nginx)
certbot certonly --standalone -d hicleo.com.br -d www.hicleo.com.br

# Copiar para o diretório do nginx
cp /etc/letsencrypt/live/hicleo.com.br/fullchain.pem nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/hicleo.com.br/privkey.pem nginx/ssl/privkey.pem

# Renovação automática (a cada 60 dias)
crontab -e
# Colar:
0 4 1 */2 * certbot renew --deploy-hook "docker restart hicleo-nginx" >> /var/log/certbot.log 2>&1
```

**Alternativa com container certbot:** descomentar o bloco `certbot` no `docker-compose.prod.yml` se preferir rodar dentro do Docker.

### Opção C — Certificado auto-assinado (apenas testes)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem \
  -out nginx/ssl/fullchain.pem \
  -subj "/CN=hicleo.com.br"
```

⚠️ **Não use em produção** — browsers mostram aviso de segurança.

---

## 6. Segurança do servidor

### 6.1 O que já está configurado (automático)

| Camada | Implementação | Arquivo |
|--------|---------------|---------|
| Firewall (UFW) | Allow 22/80/443, deny resto | `scripts/setup-firewall.sh` |
| Portas internas isoladas | Backend, Redis, Postgres usam `expose` (não `ports`) | `docker-compose.prod.yml` |
| Nginx security headers | HSTS, X-Frame-Options, X-Content-Type-Options | `nginx/nginx.conf` |
| TLS 1.2+ only | Ciphers modernos, session tickets off | `nginx/nginx.conf` |
| Redis com senha | `--requirepass` obrigatório | `docker-compose.prod.yml` |
| Rate limiting (nginx) | 30r/s geral, 10r/s API | `nginx/nginx.conf` |
| Rate limiting (backend) | 200/min global, 5/min pagamentos | `shared/middleware/security.ts` |
| Helmet.js | CSP, X-XSS-Protection, etc | `shared/middleware/security.ts` |
| Non-root container | Backend roda como `appuser` | `backend/Dockerfile` |
| Limites de recurso | CPU/RAM limitados por container | `docker-compose.prod.yml` |

### 6.2 Boas práticas adicionais

```bash
# 1. Desabilitar login root via SSH (usar chave + user deploy)
nano /etc/ssh/sshd_config
# PermitRootLogin no
# PasswordAuthentication no
systemctl restart sshd

# 2. Fail2ban (proteção contra brute force SSH)
apt install -y fail2ban
systemctl enable fail2ban

# 3. Atualizações automáticas de segurança
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# 4. Monitorar espaço em disco
df -h  # verificar periodicamente (backups crescem)
```

### 6.3 Rotação de secrets

Recomendação: trocar senhas a cada 6 meses ou se houver suspeita de vazamento.

```bash
# 1. Gerar nova senha
NEW_PASS=$(openssl rand -base64 32)

# 2. Atualizar no .env
# 3. Rebuild containers afetados
docker compose -f docker-compose.prod.yml up -d --build backend redis
```

---

## 7. Backup e recuperação

### 7.1 Backup automático (já configurado)

O script `scripts/backup-db.sh` faz:
- `pg_dump` compactado com gzip
- Rotação automática (mantém últimos 7 dias)
- Log em `/var/log/hicleo-backup.log`

**Schedule:** diário às 3h (via cron).

### 7.2 Backup manual (antes de atualizações)

```bash
# Backup imediato
bash scripts/backup-db.sh

# Verificar
ls -la backups/
```

### 7.3 Restauração

```bash
# Listar backups disponíveis
ls backups/

# Restaurar um backup específico
gunzip < backups/hicleo_20260818_030000.sql.gz | \
  docker exec -i hicleo-app-db psql -U hicleo -d hicleo
```

### 7.4 Backup externo (recomendação adicional)

Para proteção contra falha total do servidor:

```bash
# Rsync para outro servidor (ex: bucket S3, outro VPS)
rsync -avz /opt/hi-cleo/backups/ backup-user@outro-server:/backups/hicleo/

# Ou com rclone para S3/Backblaze B2
rclone sync /opt/hi-cleo/backups/ remote:hicleo-backups/
```

Custo: Backblaze B2 = $0.005/GB/mês (~R$0,15/GB) — praticamente grátis para backups pequenos.

---

## 8. Monitoramento

### 8.1 Health check (já implementado)

```bash
# Endpoint que verifica Database + Redis
curl -s https://SEU_DOMINIO/health | jq .
```

Resposta saudável:
```json
{
  "status": "healthy",
  "timestamp": "2026-08-18T14:00:00.000Z",
  "env": "production",
  "checks": { "server": "ok", "database": "ok", "redis": "ok" }
}
```

### 8.2 UptimeRobot (grátis — configurar pós-deploy)

1. Criar conta em [uptimerobot.com](https://uptimerobot.com)
2. Adicionar monitor HTTP(s):
   - URL: `https://SEU_DOMINIO/health`
   - Intervalo: 5 minutos
   - Alerta: email + webhook Slack/Telegram (opcional)
3. Tempo de configuração: ~10 minutos

### 8.3 Sentry (error tracking — configurar pós-deploy)

1. Criar conta em [sentry.io](https://sentry.io) (login com GitHub)
2. Criar projeto "Node.js" (backend) e "Next.js" (frontend)
3. Copiar DSN para `.env`:
   - `SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX`
   - `NEXT_PUBLIC_SENTRY_DSN=https://xxx@oXXX.ingest.sentry.io/XXX`
4. Rebuild: `docker compose -f docker-compose.prod.yml up -d --build`
5. Free tier: 5.000 erros/mês — mais que suficiente para o beta

### 8.4 Logs

```bash
# Logs em tempo real de todos os containers
docker compose -f docker-compose.prod.yml logs -f

# Logs de um container específico
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f nginx

# Logs do backend (Pino — formato JSON)
docker compose -f docker-compose.prod.yml logs backend | jq .

# Últimas 100 linhas
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

### 8.5 Métricas rápidas

```bash
# Uso de recursos por container
docker stats --no-stream

# Espaço em disco
df -h

# Verificar volumes Docker
docker system df
```

---

## 9. Manutenção e operações

### 9.1 Atualizar código (deploy de nova versão)

```bash
cd /opt/hi-cleo

# Puxar alterações
git pull origin main

# Rebuild e restart (zero downtime se healthchecks passam)
docker compose -f docker-compose.prod.yml up -d --build

# Verificar saúde
curl -s https://SEU_DOMINIO/health | jq .
```

### 9.2 Aplicar migrations

As migrations são aplicadas automaticamente na primeira vez (via `docker-entrypoint-initdb.d`).

Para migrations futuras:
```bash
# Executar migration manual
docker exec -i hicleo-app-db psql -U hicleo -d hicleo < backend/migrations/XXXX_nova_migration.sql
```

### 9.3 Reiniciar um serviço específico

```bash
# Restart sem rebuild
docker compose -f docker-compose.prod.yml restart backend

# Restart com rebuild (se código mudou)
docker compose -f docker-compose.prod.yml up -d --build backend
```

### 9.4 Escalar recursos (quando necessário)

Se a VPS ficar pequena (muitos usuários):

1. **Vertical:** upgrade do plano no provider (mais CPU/RAM)
2. **Limites do compose:** ajustar em `docker-compose.prod.yml`:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: "2.0"    # era 1.0
         memory: 1024M  # era 512M
   ```

### 9.5 Parar tudo (manutenção)

```bash
# Parar sem perder dados
docker compose -f docker-compose.prod.yml down

# Parar E limpar volumes (CUIDADO — perde dados!)
docker compose -f docker-compose.prod.yml down -v
```

### 9.6 Limpar imagens antigas

```bash
# Remover imagens não utilizadas (liberar espaço)
docker image prune -a --filter "until=168h"  # mais de 7 dias

# Remover tudo não utilizado (containers parados, volumes órfãos, etc.)
docker system prune -a --volumes
```

---

## 10. Troubleshooting

### Container não sobe

```bash
# Ver logs de erro
docker compose -f docker-compose.prod.yml logs backend

# Problemas comuns:
# - .env com valor faltando → "error: env validation failed"
# - Porta já em uso → "port is already allocated"
# - Permissão de volume → "permission denied"
```

#### Migrations e seeds (serviço `migrate`)

Migrations **não** usam mais `/docker-entrypoint-initdb.d` (o Postgres só executa
com volume vazio). Um serviço **one-shot** aplica tudo a cada `docker compose up`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs migrate
#   Migrations: 4 encontrada(s), 0 pendente(s)
#     🌱 plan_limits.sql
#   Migrations concluídas: 0 aplicada(s), 0 pendente(s).
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps -a | grep migrate
#   hicleo-migrate   Exited (0)
```

- Tabela `schema_migrations` guarda o que já foi aplicado (forward-only) + `pg_advisory_lock`.
- O backend só sobe se o `migrate` sair com **0** (`service_completed_successfully`).
- **Seeds** (`backend/seeds/*.sql`) rodam em **toda** subida (UPSERT): editar preço/feature
  e dar `up -d` atualiza o banco — não precisa criar migration nova.
- Rodar manualmente (host): `cd backend && DATABASE_URL=... npx tsx src/scripts/migrate.ts`
  (`--dry-run` lista o que está pendente).

### Health check falha

```bash
# Testar localmente dentro do container
docker exec hicleo-backend wget -qO- http://localhost:3001/health

# Se database falha: verificar se app-db subiu
docker compose -f docker-compose.prod.yml logs app-db

# Se redis falha: verificar senha
docker exec hicleo-redis redis-cli -a SUA_SENHA ping
```

#### `FATAL: database "<usuario>" does not exist` a cada 10s (mas o container está "healthy")

Sintoma de **healthcheck errado**, não de banco quebrado: `pg_isready -U X` **sem `-d`**
assume que o banco se chama `X`. Quando `POSTGRES_USER` ≠ `POSTGRES_DB` (ex.:
`EVOLUTION_DB_USER=hicleo` + `EVOLUTION_DB_NAME=hicleo_evolution_db`), o probe
tenta o banco errado — e o `pg_isready` ainda assim retorna 0 (ele só valida se o
servidor aceita conexões), então o container aparece saudável e o log só polui.

```yaml
# ✅ sempre passar usuário E banco
test: ["CMD-SHELL", "pg_isready -U ${EVOLUTION_DB_USER} -d ${EVOLUTION_DB_NAME}"]
```

#### Frontend "unhealthy" com o site funcionando

O `server.js` do Next.js standalone faz bind em `$HOSTNAME`, que o Docker define
como o **ID do container**. O healthcheck em `localhost:3000` cai em `[::1]` e
recebe *connection refused*. O compose de produção já corrige com
`environment: HOSTNAME=0.0.0.0` + probe em `http://127.0.0.1:3000` — replique em
qualquer ambiente novo (o `frontend/Dockerfile` também já define `ENV HOSTNAME`).

#### `This Redis server's 'default' user does not require a password, but a password was supplied`

O cliente está enviando `REDIS_PASSWORD`, mas o Redis subiu **sem** `--requirepass`.
Em dev, deixe `REDIS_PASSWORD` vazio no `.env` (o `docker-compose.yml` não usa
senha). Em produção o `docker-compose.prod.yml` sobe com `--requirepass` e a
variável é obrigatória.

#### `404 … The "<instância>" instance does not exist` no log do backend

Sessão em `whatsapp_sessions` apontando para uma instância que não existe na
Evolution (típico de resíduo de teste E2E com `instance_name = test-e2e`). O
`connection-monitor` agora trata 404/400 como "instância inexistente": marca a
sessão como `disconnected` e loga em `warn` (antes despejava o AxiosError inteiro
a cada 5 min). Para limpar resíduos:

```sql
DELETE FROM whatsapp_sessions WHERE instance_name LIKE 'test-e2e%';
```
#### Evolution API em loop: `getaddrinfo ENOTFOUND api.hicleo.com.br`

A Evolution tenta entregar cada evento no webhook da instância e falha 10× com
backoff (`Aguardando 10.2 segundos antes da próxima tentativa`). Duas causas:

1. **`WEBHOOK_URL` apontando para produção em ambiente local** — dentro da rede
   do compose o host público não resolve. Em dev use:
   ```env
   # funciona com o backend no compose (porta publicada) ou rodando no host
   WEBHOOK_URL=http://host.docker.internal:3001/webhooks/evolution
   # alternativa 100% compose:
   # WEBHOOK_URL=http://backend:3001/webhooks/evolution
   ```
2. **Instância criada com a URL antiga** — `createInstance` só define o webhook no
   nascimento da instância. O backend agora **re-sincroniza** o webhook no
   startup (`ensureEvolutionInstance` → `setWebhook`), então basta reiniciar o
   backend depois de corrigir o `.env`. Para conferir o que está configurado:
   ```bash
   docker exec hicleo-evolution-api sh -c \
     'wget -qO- --header="apikey: $AUTHENTICATION_API_KEY" \
      http://localhost:8080/webhook/find/secretary'
   ```



### SSL não funciona

```bash
# Verificar se certificados existem
ls -la nginx/ssl/

# Testar configuração do nginx
docker exec hicleo-nginx nginx -t

# Ver logs do nginx
docker compose -f docker-compose.prod.yml logs nginx
```

### Evolution API não conecta

```bash
# Verificar se está saudável
docker compose -f docker-compose.prod.yml logs evolution-api

# DNS: Evolution API precisa de acesso à internet
docker exec hicleo-evolution-api nslookup web.whatsapp.com
```

### Espaço em disco esgotado

```bash
# Ver o que está consumindo
du -sh /var/lib/docker/
du -sh /opt/hi-cleo/backups/

# Limpar logs antigos
docker compose -f docker-compose.prod.yml logs --tail=0
truncate -s 0 /var/lib/docker/containers/*/*-json.log

# Limpar imagens não usadas
docker system prune -a
```

---

## 11. Checklist final

Use este checklist sequencialmente ao fazer o deploy:

### Pré-deploy (compras)

- [ ] VPS contratada (min 1vCPU, 4GB RAM)
- [ ] Chip dedicado comprado e WhatsApp ativado
- [ ] Domínio registrado e DNS apontado para IP da VPS

### Configuração do servidor

- [ ] Docker + Docker Compose instalados
- [ ] Repositório clonado em `/opt/hi-cleo`
- [ ] Senhas geradas com `openssl rand -base64 32` (DB, Redis, Evolution DB)
- [ ] `.env` configurado com valores de produção
- [ ] `chmod 600 .env` executado
- [ ] Certificados SSL em `nginx/ssl/` (fullchain.pem + privkey.pem)
- [ ] Firewall configurado (`scripts/setup-firewall.sh`)
- [ ] Containers subindo (`docker compose -f docker-compose.prod.yml up -d --build`)
- [ ] Health check retornando `healthy`
- [ ] Backup automático no cron (diário às 3h)

### Configurações externas

- [ ] Mercado Pago: token de produção + webhook configurado
- [ ] Sentry: conta criada, DSN no `.env`
- [ ] UptimeRobot: monitor HTTP no `/health`
- [ ] Cloudflare: SSL mode Full (strict) — se usando Cloudflare

### Validação (teste E2E em produção)

- [ ] Landing page carrega em HTTPS
- [ ] Trial: formulário → código gerado → redirect wa.me
- [ ] Ativação: enviar código no WhatsApp → Cleo responde
- [ ] Onboarding: completar 7 etapas → confirmação
- [ ] Conexão: QR Code exibido → escanear → conectado
- [ ] Resposta automática: amigo manda msg → Cleo responde
- [ ] Pagamento real: R$1 via PIX → webhook confirma → código de ativação

### Pós-deploy (primeira semana)

- [ ] Verificar logs diariamente: `docker compose logs --tail=50 backend`
- [ ] Confirmar que backups estão sendo gerados: `ls backups/`
- [ ] Monitorar Sentry: erros não esperados?
- [ ] Testar renovação de assinatura (quando primeiro ciclo vencer)

---

## Estimativas de tempo

| Fase | Tempo |
|------|-------|
| Contratar VPS + domínio | 30 min |
| Configurar servidor (Docker, clone, env, SSL, firewall) | 1-2h |
| Build e subir containers | 15-30 min |
| Configurar Mercado Pago produção | 30 min |
| Configurar Sentry + UptimeRobot | 20 min |
| Teste E2E completo | 30 min |
| **Total** | **~3-4 horas** |

**Tempo de espera (externo):**
- Propagação DNS: até 48h (geralmente 1-2h com Cloudflare)
- Entrega do chip: depende da compra (imediato em loja física)

---

## Custos mensais estimados (beta)

### Cenário A — Oracle Cloud Always Free (recomendado por custo)

| Item | Custo/mês |
|------|-----------|
| VPS (Oracle A1.Flex — 2 OCPU ARM, 12 GB) | **R$ 0** |
| Domínio .com.br | ~R$3,33 (R$40/ano) |
| Chip (recarga mínima) | ~R$10-15 |
| IA (Groq + Gemini free tier) | R$ 0 |
| Sentry + UptimeRobot | Grátis |
| SSL (Cloudflare) | Grátis |
| **Total** | **~R$13-18/mês** |

### Cenário B — VPS paga mais barata (Hetzner CX22)

| Item | Custo/mês |
|------|-----------|
| VPS (Hetzner CX22) | ~R$27 |
| Domínio .com.br | ~R$3,33 (R$40/ano) |
| Chip (recarga mínima) | ~R$10-15 |
| IA (Groq + Gemini free tier) | R$ 0 |
| Sentry + UptimeRobot | Grátis |
| SSL (Cloudflare) | Grátis |
| **Total** | **~R$40-45/mês** |

Com 1 cliente pagante (R$89,90/mês), o sistema se paga em qualquer cenário. No cenário Oracle, a margem cobre o custo já no primeiro cliente.
