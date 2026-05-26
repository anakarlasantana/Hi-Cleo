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

### Outros concluídos
- ~~#11 Padronizar banco para inglês~~ ✅ (migration consolidada)

---

## 🔴 PENDENTES (implementação nova)

### 10. Gateway de Pagamento (BLOQUEANTE)

**O que falta:**
- Escolher gateway (Mercado Pago ou Stripe)
- Integrar SDK no checkout (transparente ou redirect)
- Webhook no backend para confirmar pagamento
- Após confirmação: gerar código de ativação + preencher subscription fields
- Gerenciar assinaturas recorrentes (mensal/anual)
- Tratar falhas de pagamento e renovação
- Preencher `payment_provider_id`, `subscription_started_at`, `subscription_expires_at`, `billing_period`

**Estimativa:** 3-4 dias

---

### 12. Fluxo de reconexão WhatsApp

**O que falta:**
- Connection monitor já detecta desconexão e alerta admin
- Falta: notificar o usuário via WhatsApp da Cleo
- Orientar a reconectar (mandar link da página `/conectar`)
- Definir: reconectar automaticamente ou esperar ação do usuário?

**Estimativa:** 1 dia

---

### 13. Segurança e Rate Limiting

**O que falta:**
- Rate limiting nos endpoints públicos (express-rate-limit)
- Validação de assinatura nos webhooks da Evolution API
- CORS configurado para domínio de produção
- Helmet.js para headers de segurança
- Sanitização de inputs

**Estimativa:** 1 dia

---

### 14. Testes e monitoramento

**O que falta:**
- Testes de integração end-to-end (webhook → queue → processor → resposta)
- Error tracking (Sentry)
- Uptime monitoring
- Testes de carga para Redis/queue

**Estimativa:** 2-3 dias

---

### 15. Serviço de E-mail (futuro)

**Decisão:** WhatsApp para notificações. E-mail só se necessário depois.
**Preparação:** Interface `NotificationPort` com `sendWhatsApp` e `sendEmail`.

**Estimativa:** 1 dia quando implementar

---

### 16. Testes unitários e de propriedade — Payment Gateway

**O que falta:**
- Testes unitários para Price Calculator (tabela de preços, edge cases, parcelamento)
- Testes de propriedade (fast-check) para validar corretude universal:
  - Sem acréscimo para PIX e cartão até 3x
  - Juros compostos corretos para parcelamento > 3x
  - Preço anual = 10x mensal
  - Webhook idempotente (processar 2x = mesmo efeito que 1x)
  - Expiração de assinatura calculada corretamente (30d mensal, 365d anual)
  - Renovação com retry limitado (máx 5 tentativas)
  - Formatação monetária no padrão brasileiro
- Testes unitários para Payment Service, Webhook Service e Subscription Manager

**Decisão:** Implementação inicial validada com sandbox do MP (cartões de teste). Testes automatizados adicionados depois.

**Estimativa:** 2 dias

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
| ✅ Concluídos | #1-9, #11 |
| 🔴 Pendentes | #10, #12-16 |
| **Estimativa restante** | **~10-12 dias** |

## Ordem de execução

1. 🔴 #10 Gateway de pagamento (bloqueante para produção)
2. 🔴 #13 Segurança (necessário antes de expor publicamente)
3. 🔴 #12 Reconexão WhatsApp
4. 🔴 #14 Testes e monitoramento
5. 🔴 #15 E-mail (futuro)
6. 🔴 #16 Testes Payment Gateway (após validação com sandbox)
