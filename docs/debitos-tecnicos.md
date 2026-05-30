# Débitos Técnicos

Organizado por prioridade. Itens rápidos e médios já foram concluídos.

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
- ~~#10 Gateway de Pagamento~~ ✅ (Mercado Pago integrado: checkout PIX/cartão, webhook com validação de assinatura, ativação de subscription)
- ~~#18 Dockerfile e Deploy Config~~ ✅ (Dockerfiles multi-stage para backend e frontend, docker-compose unificado na raiz, override de produção, healthchecks)

### Outros concluídos
- ~~#11 Padronizar banco para inglês~~ ✅ (migration consolidada)

---

## 🔴 PENDENTES — BLOQUEANTES PARA PRODUÇÃO

### 13. Segurança e Rate Limiting (BLOQUEANTE)

**Status atual:** Nenhuma camada de segurança implementada.

**O que falta:**
- Rate limiting nos endpoints públicos (`/api/payments`, `/api/activation`) — `express-rate-limit`
- Helmet.js para headers de segurança (X-Frame-Options, CSP, etc.)
- CORS restrito ao domínio do frontend (hoje aceita qualquer origem com `cors()`)
- Validação de body nas requests com Zod (hoje só valida env vars)
- Limite de tamanho de request (`express.json({ limit: '100kb' })`)
- Autenticação/verificação nos endpoints de pagamento (qualquer pessoa pode chamar `/api/payments`)
- Validação de assinatura nos webhooks da Evolution API

**Estimativa:** 1-2 dias

---

### 17. Frontend — Remover `ignoreBuildErrors` (BLOQUEANTE)

**Status atual:** `next.config.mjs` tem `ignoreBuildErrors: true`, mascarando erros de TypeScript no build.

**O que falta:**
- Remover `ignoreBuildErrors: true` do next.config.mjs
- Corrigir todos os erros de TypeScript que surgirem
- Garantir que `next build` passa limpo

**Estimativa:** 0.5 dia

---

### 19. CI/CD Pipeline (BLOQUEANTE)

**Status atual:** Nenhum workflow automatizado.

**O que falta:**
- GitHub Actions: lint + test + build no PR
- Deploy automático para staging após merge
- Deploy para produção com aprovação manual
- Verificação de build do frontend

**Estimativa:** 1 dia

---

## 🟡 PENDENTES — IMPORTANTES (risco se não tiver)

### 14. Error Tracking e Monitoramento

**Status atual:** Logs em arquivo com rotação diária (pino-roll). Sem tracking centralizado.

**O que falta:**
- Sentry (ou equivalente) para error tracking em backend e frontend
- Middleware centralizado de erro no Express (hoje cada controller trata individualmente)
- Uptime monitoring (UptimeRobot, Better Stack)
- Alertas de erro crítico (integrar com WhatsApp do admin)

**Estimativa:** 1 dia

---

### 16. Testes unitários e de propriedade — Payment Gateway

**Status atual:** Cobertura mínima (terms, rules, activation). Fluxo de pagamento sem testes.

**O que falta:**
- Testes unitários para Price Calculator (tabela de preços, edge cases, parcelamento)
- Testes de propriedade (fast-check) para validar corretude universal:
  - Sem acréscimo para PIX e cartão até 3x
  - Juros compostos corretos para parcelamento > 3x
  - Preço anual = 10x mensal
  - Webhook idempotente (processar 2x = mesmo efeito que 1x)
  - Expiração de assinatura calculada corretamente (30d mensal, 365d anual)
  - Renovação antecipada estende a partir da expiração atual
  - Formatação monetária no padrão brasileiro
- Testes unitários para Payment Service, Webhook Controller e Subscription Service
- Testes de integração: webhook → queue → processor → resposta

**Estimativa:** 2 dias

---

### 12. Fluxo de reconexão WhatsApp

**Status atual:** Connection monitor detecta desconexão e alerta admin. Usuário final não é notificado.

**O que falta:**
- Notificar o usuário via WhatsApp da Cleo quando sua instância desconecta
- Orientar a reconectar (mandar link da página `/conectar`)
- Definir: reconectar automaticamente ou esperar ação do usuário?

**Estimativa:** 1 dia

---

### 20. Database Migrations Versionadas

**Status atual:** Schema gerenciado via Supabase CLI (`db push`), mas sem migrations versionadas no repositório.

**O que falta:**
- Exportar schema.sql atualizado
- Criar sistema de migrations versionadas (Supabase migrations ou alternativa)
- Documentar estratégia de backup
- Script de rollback

**Estimativa:** 0.5 dia

---

## ⚪ FUTURO (não bloqueia produção)

### 15. Serviço de E-mail

**Decisão:** WhatsApp para notificações. E-mail só se necessário depois.
**Preparação:** Interface `NotificationPort` com `sendWhatsApp` e `sendEmail`.

**Estimativa:** 1 dia quando implementar

---

## ⚪ DECISÕES (não são débitos)

- **FAQ/testimonials:** Manter hardcoded.
- **URLs em português:** Rotas visíveis ao usuário, produto pt-BR.
- **Constantes por módulo:** Cada módulo tem seu `constants.ts`.
- **E-mail:** Recibos pelo gateway, notificações pelo WhatsApp.

---

## Resumo

| Status | Itens |
|--------|-------|
| ✅ Concluídos | #1-11, #18 |
| 🔴 Bloqueantes | #13, #17, #19 |
| 🟡 Importantes | #12, #14, #16, #20 |
| ⚪ Futuro | #15 |
| **Estimativa restante** | **~7-9 dias** |

---

## Ordem de execução para produção

1. 🔴 **#13 Segurança** — rate-limit, helmet, CORS, validação (1-2 dias)
2. 🔴 **#17 Fix frontend build** — remover ignoreBuildErrors (0.5 dia)
3. 🔴 **#19 CI/CD** — pipeline de lint/test/build/deploy (1 dia)
4. 🟡 **#14 Error tracking** — Sentry + monitoring (1 dia)
5. 🟡 **#16 Testes payment** — unitários + propriedade (2 dias)
6. 🟡 **#12 Reconexão WhatsApp** — notificar usuário (1 dia)
7. 🟡 **#20 Migrations** — versionar schema (0.5 dia)
8. ⚪ **#15 E-mail** — quando necessário
