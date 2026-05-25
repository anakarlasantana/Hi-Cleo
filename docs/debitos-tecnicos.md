# Débitos Técnicos

Registro de itens que precisam ser revisitados e completados para entrega da aplicação.

---

## 🔴 BLOQUEANTES (necessários antes do lançamento)

### 1. Integração com Gateway de Pagamento

**Status:** Checkout é apenas UI, sem processamento real.

**O que falta:**
- Integrar Mercado Pago ou Stripe (sandbox → produção)
- Webhook do gateway para confirmar pagamento
- Após confirmação: chamar `POST /activation/generate` para criar código real
- Passar código gerado para a página de ativação via redirect
- Página de ativação usa código hardcoded (`ATIVAR-7X3K`)

**Estimativa:** 3-4 dias

---

### 2. Consentimento LGPD — Conectar frontend ao backend

**O que falta:**
- Checkbox na página `/conectar` antes do QR Code
- Endpoint `POST /activation/consent` para registrar aceite
- Fluxo de re-aceite via WhatsApp quando versão muda

**Estimativa:** 1 dia

---

### 3. Serviço de E-mail (futuro)

**Status:** Não necessário para MVP. Gateway de pagamento envia recibos automaticamente.

**Decisão:** Todas as notificações (cancelamento, alertas, lembretes) vão pelo WhatsApp. E-mail fica como canal futuro.

**O que preparar no código:**
- Interface `NotificationPort` com métodos `sendWhatsApp` e `sendEmail`
- Implementar apenas `sendWhatsApp` agora
- Quando precisar de e-mail: criar adapter (SendGrid/SES) sem mudar lógica

**Prioridade:** Baixa (pós-lançamento, se necessário)

**Estimativa:** 1 dia quando for implementar

---

## 🟡 ALTA PRIORIDADE (antes de escalar)

### 4. Follow-up Cron — Completar implementação

**O que falta:**
- Verificar se `checkStaleLeads` está implementado no repository
- Definir critérios de "cliente esfriando" (horas sem resposta)
- Testar fluxo end-to-end
- Configurar intervalo do cron via env (hoje hardcoded: a cada hora)

**Estimativa:** 1 dia

---

### 5. Contact Monitor — Completar fluxo de alertas

**O que falta:**
- Cron job que roda `checkAlertThreshold` periodicamente
- Definir destino do alerta (e-mail? WhatsApp? log?)
- Otimizar `getContactCountPerUser` (carrega tudo em memória)

**Estimativa:** 0.5 dia

---

### 6. Cancellation Service — Integrar com pagamento

**O que falta:**
- Endpoint HTTP para solicitar cancelamento
- Integrar com gateway para cancelar cobranças futuras
- Integrar com e-mail para confirmação
- Cron para desconectar sessões após `access_until` expirar
- Cron para deletar dados após 30 dias de graça

**Estimativa:** 2 dias

---

### 7. Padronizar banco de dados para inglês

**Colunas a renomear:**
- `users`: `nome`→`name`, `telefone`→`phone`, `plano`→`plan`
- `leads`: `nome`→`name`, `telefone`→`phone`
- `rules`: valores `'primeira_mensagem'`→`'first_message'`
- `onboarding_states`: valores `'confirmar_nome'`→`'confirm_name'`

**Estimativa:** 2-3 dias

---

## 🟢 MÉDIA PRIORIDADE (pós-lançamento)

### 8. Dashboard Admin

**O que falta:**
- Métricas: usuários ativos, contatos totais, uso por plano
- Gerenciar usuários (cancelar, reativar, mudar plano)
- Ver logs e status das conexões WhatsApp

**Estimativa:** 3-5 dias

---

### 9. Padronizar código para inglês

**Regras definidas:**
- Código: inglês | Comentários: português | Documentação: português
- UI: português | URLs frontend: português
- Constantes: `constants.ts` por módulo

**Estimativa:** 1-2 dias

---

### 10. Testes de integração e carga

**O que falta:**
- Testes end-to-end (webhook → queue → processor → resposta)
- Testes de carga para Redis/queue
- Error tracking (Sentry)
- Uptime monitoring

**Estimativa:** 2-3 dias

---

### 11. Fluxo de reconexão WhatsApp

**O que falta:**
- Tratar desconexão do WhatsApp do usuário
- Notificar usuário e orientar a reconectar
- Definir: Cleo manda mensagem? Ou só quando tenta usar?

**Estimativa:** 1 dia

---

### 12. Segurança e Rate Limiting

**O que falta:**
- Rate limiting nos endpoints públicos
- Validação de assinatura nos webhooks Evolution API
- CORS para domínio de produção
- Helmet.js para headers de segurança

**Estimativa:** 1 dia

---

## Resumo

| Prioridade | Estimativa |
|------------|-----------|
| 🔴 Bloqueantes | ~4-5 dias |
| 🟡 Alta | ~6 dias |
| 🟢 Média | ~8-10 dias |
| **Total** | **~2-3 semanas** |
