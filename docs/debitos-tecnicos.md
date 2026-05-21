# Débitos Técnicos

Registro de itens que precisam ser revisitados e completados no futuro.

---

## 1. Contact Monitor — Completar fluxo de monitoramento

**Módulo:** `backend/src/modules/contact-monitor/`

**Status:** Implementação base criada, fluxo incompleto.

**O que existe:**
- Service com `getContactCount`, `getSystemMetrics`, `checkAlertThreshold`
- Repository com queries no Supabase
- Threshold configurável via env `CONTACT_ALERT_THRESHOLD` (default: 100k)

**O que falta:**
- Definir como/onde o alerta é disparado (e-mail? Slack? log?)
- Criar um cron job que roda `checkAlertThreshold` periodicamente
- Dashboard admin para visualizar métricas de contatos
- Definir orçamento real do Supabase para calibrar o threshold
- Avaliar se `getContactCountPerUser` precisa de otimização (hoje carrega todos os leads em memória para agrupar)
- Considerar paginação no repository quando o volume crescer

**Prioridade:** Baixa (monitorar manualmente até ter volume relevante)

**Quando revisitar:** Quando ultrapassar 50 usuários ativos ou 50k contatos totais.

---

## 2. Consentimento LGPD — Conectar frontend ao backend

**Módulo:** `backend/src/modules/terms/` + `frontend/app/conectar/`

**Status:** Backend pronto, frontend parcial.

**O que existe:**
- `TermsConsentService` com `requiresConsent`, `recordConsent`, `getConsentHistory`
- Página `/termos` com conteúdo completo dos termos
- `ActivationService` bloqueia ativação sem `termsAccepted = true`

**O que falta:**
- Adicionar checkbox "Li e aceito os Termos de Uso e Política de Privacidade" na página `/conectar` antes de exibir o QR Code
- Chamar endpoint de consentimento no backend ao aceitar
- Implementar fluxo de re-aceite via WhatsApp quando a versão dos termos é atualizada (Cleo envia link + aguarda resposta "aceito")
- Definir como a Cleo detecta que o usuário precisa aceitar nova versão (verificar no início de cada interação?)

**Prioridade:** Média (necessário antes do lançamento)

**Quando revisitar:** Antes de ir para produção com usuários reais.

---

## 3. Padronizar banco de dados para inglês

**Status:** Schema existente usa nomes em português nas colunas.

**Colunas a renomear:**
- `users`: `nome` → `name`, `telefone` → `phone`, `plano` → `plan`, `horario_comercial_inicio` → `business_hours_start`, `horario_comercial_fim` → `business_hours_end`
- `leads`: `nome` → `name`, `telefone` → `phone`
- `rules`: `condition` já está ok, mas valores como `'primeira_mensagem'`, `'fora_horario'` → `'first_message'`, `'outside_hours'`
- `onboarding_states`: `step` valores como `'confirmar_nome'`, `'configurar_boas_vindas'` → `'confirm_name'`, `'configure_welcome'`, etc.
- `plan_limits`: `plan_name` valores `'solo'`, `'equipe'`, `'empresa'` → manter (são nomes de produto)

**Impacto:**
- Migration de ALTER TABLE RENAME COLUMN
- Atualizar todos os repositories (queries)
- Atualizar interfaces/types no código
- Atualizar o message.processor.ts e demais referências
- Atualizar seeds e valores de enum

**Prioridade:** Média (fazer antes de escalar o time de desenvolvimento)

**Quando revisitar:** Próximo sprint de refatoração, antes de onboarding de novos devs.

---
