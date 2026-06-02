# Débitos Técnicos

Organizado por prioridade.

---

## ✅ CONCLUÍDOS

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
- ~~#18 Docker/Deploy~~ ✅ (Dockerfiles multi-stage, compose dev + prod Hostinger, healthchecks)
- ~~#21 Mídia WhatsApp~~ ✅ (receber/armazenar metadados, forward de materiais, intent send_material)

### Outros concluídos
- ~~#11 Padronizar banco para inglês~~ ✅
- ~~#20 Migrations versionadas~~ ✅ (Supabase CLI)
- ~~Limpeza de código~~ ✅ (37 UI components, 23 deps Radix, LeadStatus cold)

---

## 🔴 PENDENTE — ÚNICO BLOQUEANTE

### 22. Deploy no servidor (Hostinger)

**Status:** Código pronto. Nunca rodou em produção.

**Checklist de deploy:**

| # | Ação | Detalhes |
|---|------|----------|
| 1 | Contratar VPS Hostinger KVM 1 | 1vCPU, 4GB RAM, R$30/mês |
| 2 | Comprar chip dedicado | Pré-pago, ativar WhatsApp, nunca usar pra outra coisa |
| 3 | Comprar/configurar domínio | Ex: hicleo.com.br, apontar DNS |
| 4 | SSL/HTTPS | Cloudflare (grátis) ou Let's Encrypt |
| 5 | Clonar repo no servidor | `git clone` + configurar `.env` produção |
| 6 | Variáveis de produção | `NODE_ENV=production`, URLs públicas, MP produção, CORS_ORIGIN |
| 7 | Build e subir containers | `docker compose -f docker-compose.prod.yml up -d --build` |
| 8 | Mercado Pago produção | Trocar `TEST-xxx` por token real, configurar webhook URL pública |
| 9 | Webhook Evolution | Apontar pra `https://api.seudominio.com.br/webhooks/evolution` |
| 10 | Conectar WhatsApp | Acessar Evolution API → criar instância → escanear QR com chip novo |
| 11 | Teste end-to-end | Pagamento real (R$1) → código → ativação → onboarding → resposta automática |

**Estimativa:** 1 dia (+ tempo de espera do chip e propagação DNS)

---

## 🟡 PENDENTES — MELHORIAS PÓS-LANÇAMENTO

### 14. Error Tracking

**O que falta:** Sentry + uptime monitoring (UptimeRobot).
**Quando:** Primeira semana após deploy.
**Estimativa:** 0.5 dia

### 19. CI/CD Pipeline

**O que falta:** GitHub Actions (lint + test + build no PR).
**Quando:** Após validar que prod está estável.
**Estimativa:** 0.5 dia

### 12. Reconexão WhatsApp

**O que falta:** Notificar o usuário quando desconecta + link /conectar.
**Quando:** Após primeiros clientes reclamarem.
**Estimativa:** 0.5 dia

### 16. Testes Payment

**O que falta:** Testes unitários para price calculator e subscription.
**Quando:** Após fluxo validado com clientes reais.
**Estimativa:** 1-2 dias

---

## ⚪ FUTURO

- **#15 E-mail** — quando necessário
- **#23 Dashboard web** — métricas, leads, upload de materiais via web

---

## Resumo

| Status | Itens |
|--------|-------|
| ✅ Concluídos | #1-11, #13, #17, #18, #20, #21 |
| 🔴 Bloqueante | #22 (deploy) |
| 🟡 Pós-lançamento | #12, #14, #16, #19 |
| ⚪ Futuro | #15, #23 |

---

## Fluxo completo do serviço em produção

```
CLIENTE NOVO:
  hicleo.com.br → Escolhe plano → Paga (PIX/cartão)
    → Webhook MP confirma → Gera código ATIVAR-XXXX
    → Redireciona pra /ativacao?code=ATIVAR-XXXX
    → Usuário abre WhatsApp da Cleo, manda código
    → Onboarding conversacional (nome, boas-vindas, horário)
    → Escaneia QR Code pra vincular WhatsApp
    → Cleo começa a trabalhar automaticamente

OPERAÇÃO DIÁRIA:
  Aluno/cliente manda mensagem → Evolution API → Webhook → Fila
    → Regras automáticas (boas-vindas, fora de horário)
    → Lead criado automaticamente
    → Follow-up se não responder em 48h

  Professor/dono conversa com Cleo:
    → "quem tá sem resposta?" → lista leads pendentes
    → "manda material pro João" → forward do último arquivo
    → Manda PDF/imagem → Cleo armazena como material

ADMINISTRAÇÃO:
  Monitor de conexão (5 em 5 min) → alerta admin se desconectar
  Subscription cron → expira assinaturas vencidas
  Cancellation cron → limpa dados após prazo
```
