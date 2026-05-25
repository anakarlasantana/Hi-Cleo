# Débitos Técnicos

Organizado por prioridade: primeiro fluxos quase prontos (falta integração), depois os que precisam de implementação maior.

---

## 🟢 RÁPIDOS (fluxos quase completos, falta integração)

### 1. Código de ativação dinâmico
**Fluxo:** Checkout → Ativação
**O que falta:** Checkout chama `POST /api/activation/generate`, redirect com código real, página lê da URL.
**Estimativa:** 0.5 dia

### 2. Checkbox LGPD na página de conexão
**Fluxo:** Conexão → Aceite → QR Code
**O que falta:** Checkbox + bloquear QR até aceite + chamar endpoint de consentimento.
**Estimativa:** 0.5 dia

### 3. Planos e preços via API
**Fluxo:** Landing + Checkout
**O que falta:** Endpoint `GET /api/plans`, frontend consome, adicionar preço/features no banco.
**Estimativa:** 1 dia

### 4. Features dos planos via API
**O que falta:** Incluir na resposta de `GET /api/plans`, frontend renderiza.
**Estimativa:** 0.5 dia (junto com #3)

### 5. Número da Cleo via API
**O que falta:** Endpoint `GET /api/config`, frontend consome.
**Estimativa:** 0.5 dia

---

## 🟡 MÉDIOS (módulos existem, falta completar fluxo)

### 6. Follow-up Cron
**O que falta:** Verificar `checkStaleLeads`, definir critérios, testar end-to-end.
**Estimativa:** 1 dia

### 7. Contact Monitor — Cron de alertas
**O que falta:** Cron que roda `checkAlertThreshold`, alerta via WhatsApp do admin.
**Estimativa:** 0.5 dia

### 8. Cancellation — Endpoint + crons
**O que falta:** Endpoint HTTP, cron desconexão, cron limpeza 30 dias, confirmação WhatsApp.
**Estimativa:** 1.5 dia

### 9. Re-aceite de termos via WhatsApp
**O que falta:** Verificar consentimento no processor, Cleo manda link se desatualizado.
**Estimativa:** 1 dia

---

## 🔴 GRANDES (implementação nova)

### 10. Gateway de Pagamento
**O que falta:** Integrar Mercado Pago/Stripe, webhook, gerar código após pagamento, assinaturas recorrentes.
**Estimativa:** 3-4 dias

### 11. Padronizar banco para inglês
**O que falta:** Migration rename columns + atualizar repositories + types + processor.
**Estimativa:** 2-3 dias

### 12. Fluxo de reconexão WhatsApp
**O que falta:** Detectar desconexão, notificar usuário, orientar reconexão.
**Estimativa:** 1 dia

### 13. Segurança e Rate Limiting
**O que falta:** Rate limiting, validação webhook, CORS produção, Helmet.js.
**Estimativa:** 1 dia

### 14. Testes e monitoramento
**O que falta:** Testes end-to-end, Sentry, uptime monitoring, testes de carga.
**Estimativa:** 2-3 dias

### 15. Serviço de E-mail (futuro)
**Decisão:** WhatsApp para notificações. E-mail só se necessário depois.
**Estimativa:** 1 dia quando implementar

---

## ⚪ DECISÕES (não são débitos)

- **FAQ/testimonials:** Manter hardcoded. Landing muda só em redesigns.
- **URLs em português:** Rotas visíveis ao usuário, produto pt-BR.
- **Constantes por módulo:** Cada módulo tem seu `constants.ts`.

---

## Resumo

| Grupo | Estimativa |
|-------|-----------|
| 🟢 Rápidos (integração) | ~3 dias |
| 🟡 Médios (completar fluxo) | ~4 dias |
| 🔴 Grandes (implementação nova) | ~10-12 dias |
| **Total para produção** | **~2.5-3 semanas** |

## Ordem sugerida de execução

1. 🟢 #1-5 (integração front↔back, desbloqueia testes reais)
2. 🔴 #10 (gateway de pagamento, bloqueante para produção)
3. 🟡 #6-9 (completar fluxos existentes)
4. 🔴 #11-14 (refatoração e infraestrutura)
5. 🔴 #15 (futuro, só se necessário)
