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
- ~~#18 Docker/Deploy~~ ✅ (Dockerfiles multi-stage, compose dev + prod VPS limpa, healthchecks)
- ~~#21 Mídia WhatsApp~~ ✅ (receber/armazenar metadados, forward de materiais, intent send_material)
- ~~#31 Reestruturação Multi-User~~ ✅ (fluxo ativação, convites, slots, intents invite/disconnect)

### Outros concluídos
- ~~#11 Padronizar banco para inglês~~ ✅
- ~~#20 Migrations versionadas~~ ✅ (Supabase CLI)
- ~~Limpeza de código~~ ✅ (37 UI components, 23 deps Radix, LeadStatus cold)
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

**Checklist de deploy:**

| # | Ação | Detalhes |
|---|------|----------|
| 1 | Contratar VPS | Qualquer provider com Docker (Hetzner, Contabo, DigitalOcean). Mínimo: 1vCPU, 4GB RAM |
| 2 | Comprar chip dedicado | Pré-pago, ativar WhatsApp, nunca usar pra outra coisa |
| 3 | Comprar/configurar domínio | Ex: hicleo.com.br, apontar DNS pro IP do servidor |
| 4 | SSL/HTTPS | Cloudflare (grátis) ou Let's Encrypt via nginx |
| 5 | Instalar Docker no servidor | `apt install docker.io docker-compose-plugin` (se não vier instalado) |
| 6 | Clonar repo no servidor | `git clone` + copiar `.env` com valores de produção |
| 7 | Configurar `.env` produção | `NODE_ENV=production`, domínio real, token MP real, CORS_ORIGIN, SITE_URL |
| 8 | Rodar migration multi-user | `supabase db push` ou executar `20260601000001_multi_user_activation.sql` |
| 9 | Build e subir containers | `docker compose -f docker-compose.prod.yml up -d --build` |
| 10 | Mercado Pago produção | Trocar `TEST-xxx` por token real, configurar webhook apontando pra URL pública |
| 11 | Conectar WhatsApp | Acessar Evolution API → criar instância → escanear QR com chip novo |
| 12 | Teste end-to-end | Pagamento real (R$1) → código → ativação → onboarding → resposta automática |

**Estimativa:** 1 dia (+ tempo de espera do chip e propagação DNS)

---

## 🟡 PENDENTES — MELHORIAS PÓS-LANÇAMENTO

### 33. IA nos Fluxos Conversacionais (pré-beta)

**Status:** Em implementação
**Prioridade:** Alta (qualidade da experiência do primeiro uso)
**Documentação:** [docs/arquitetura-ia.md](./arquitetura-ia.md)

**O que está sendo feito:**
- Criar módulo `modules/ai/` com nós, prompts e estado separados
- Onboarding usa IA para interpretar respostas (rejeita "não sei", ".", etc.)
- Transcrição de áudio (Whisper) funciona no onboarding E pós-onboarding
- Aceite de termos interpreta linguagem natural
- Respostas contextuais e humanas aos clientes do dono (usando dados do onboarding)
- Prompts compactos com personalidade (eficientes + naturais)
- Estrutura preparada para migração futura a LangGraph (cada nó = função pura)

**Estratégia:** Implementar IA agora com nós isolados → validar no beta → migrar para grafos pós-beta.

**Estimativa:** 1 dia

---

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
- ✅ Endpoint `/health` verifica DB (Supabase) + Redis — retorna 200 ou 503
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

### 16. Testes Payment

**Cobertura atual:** 69 testes passando (onboarding, activation, cancellation, rules, terms)
**O que falta:** Testes unitários para price calculator e subscription.
**Quando:** Após fluxo validado com clientes reais.
**Estimativa:** 1-2 dias

---

## 🟠 CONCLUÍDOS — QUALIDADE DA EXPERIÊNCIA (implementados 2026-08-11)

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

## Resumo

| Status | Itens |
|--------|-------|
| ✅ Concluídos | #1-11, #13, #14 (código), #17, #18, #20, #21, #30, #31, #33-40 |
| 🔴 Bloqueante | #22 (deploy) |
| 🟡 Pós-lançamento | #14 (config), #16, #19 |
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
