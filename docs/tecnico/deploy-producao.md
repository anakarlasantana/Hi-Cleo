# Deploy em Produção — Hi Cleo

Guia completo para colocar o Hi Cleo em produção numa VPS limpa com Docker.

> **Pré-requisito:** Código 100% pronto. Este guia é 100% operacional.

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

**Requisitos mínimos:** 1 vCPU, 4GB RAM, 40GB SSD, Ubuntu 22.04 ou Debian 12.

---

## 2. Escolha de providers

### 2.1 VPS — Opções recomendadas

| Provider | Plano sugerido | vCPU | RAM | SSD | Preço/mês | Observação |
|----------|---------------|------|-----|-----|-----------|-----------|
| **Hetzner** (recomendado) | CX22 | 2 | 4GB | 40GB | €4,35 (~R$25) | Melhor custo-benefício, DC na Europa |
| **Contabo** | VPS S | 4 | 8GB | 200GB | €6,99 (~R$40) | Mais recursos por menos, DC na Alemanha/EUA |
| **DigitalOcean** | Basic Droplet | 2 | 4GB | 80GB | $24 (~R$130) | Mais caro, boa documentação, DC em SP |
| **Vultr** | Cloud Compute | 2 | 4GB | 80GB | $24 (~R$130) | DC em SP (menor latência para BR) |
| **Oracle Cloud** | Free Tier ARM | 4 | 24GB | 200GB | Grátis | ARM (Ampere), gratuito forever, config mais complexa |

**Recomendação para o beta:** Hetzner CX22 ou Contabo VPS S. Custo mínimo com sobra de recursos.

**Se latência importa (clientes no Brasil):** Vultr ou DigitalOcean com datacenter em São Paulo.

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

### Health check falha

```bash
# Testar localmente dentro do container
docker exec hicleo-backend wget -qO- http://localhost:3001/health

# Se database falha: verificar se app-db subiu
docker compose -f docker-compose.prod.yml logs app-db

# Se redis falha: verificar senha
docker exec hicleo-redis redis-cli -a SUA_SENHA ping
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

| Item | Custo/mês |
|------|-----------|
| VPS (Hetzner CX22) | ~R$25 |
| Domínio .com.br | ~R$3,33 (R$40/ano) |
| Chip (recarga mínima) | ~R$10-15 |
| IA (DeepSeek/Groq free tier) | R$0-10 |
| Sentry + UptimeRobot | Grátis |
| SSL (Cloudflare) | Grátis |
| **Total** | **~R$40-55/mês** |

Com 1 cliente pagante (R$49/mês), o sistema se paga.
