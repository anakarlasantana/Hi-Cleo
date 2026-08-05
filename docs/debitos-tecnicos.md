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

### 14. Error Tracking

**O que falta:** Sentry + uptime monitoring (UptimeRobot).
**Quando:** Primeira semana após deploy.
**Estimativa:** 0.5 dia

### 19. CI/CD Pipeline

**O que falta:** GitHub Actions (lint + test + build no PR).
**Quando:** Após validar que prod está estável.
**Estimativa:** 0.5 dia

### 16. Testes Payment

**O que falta:** Testes unitários para price calculator e subscription.
**Quando:** Após fluxo validado com clientes reais.
**Estimativa:** 1-2 dias

---

## ⚪ FUTURO — FLUXOS AVANÇADOS

### 32. Conversation Flows Engine (LangGraph — Grafos de Agentes)

**Prioridade:** Média (melhoria de arquitetura, não bloqueia funcionalidade)
**Quando:** Pós-beta — após validação com usuários reais

**Decisão estratégica:** Implementar APÓS o lançamento beta, não antes.

**Motivos para esperar:**
1. **Risco de regressão** — trocar o motor de conversação antes do beta pode quebrar fluxos já funcionais (onboarding, follow-up, intents) sem tempo para detectar e corrigir
2. **Validação primeiro** — o beta vai mostrar quais fluxos realmente precisam de mais sofisticação com dados reais de uso
3. **Escopo controlado** — a arquitetura atual (services + adapters de IA) já entrega o necessário para os primeiros clientes
4. **Migração incremental** — com LangGraph, cada fluxo pode ser migrado isoladamente sem reescrever tudo de uma vez

**Roadmap:**
```
Beta → feedback dos primeiros usuários → identifica gargalos nos fluxos → migra pro LangGraph por grafo
```

**Pré-requisitos já atendidos (validados para migração futura):**
- ✅ Estado da conversa bem estruturado no banco (`onboarding_states` com step + data JSON)
- ✅ Prompts organizados e separados da lógica (INTENT_PROMPT isolado no `assistente.service.ts`)
- ✅ Adapter pattern para IA (AiFallbackAdapter: Gemini → Groq) desacoplado dos services
- ✅ Steps do onboarding são funções puras que recebem state e retornam resposta (migração 1:1 para nós)
- ✅ Intent recognition já retorna tipo + confidence + entities (compatível com router pattern do LangGraph)

**O que monitorar durante o beta para priorizar a migração:**
- Usuários travando em steps do onboarding (indica que fluxo linear é insuficiente)
- Intents com confidence < 0.7 frequentes (indica que prompt monolítico precisa ser especializado)
- Novos fluxos pedidos que não cabem no switch/case atual
- Dificuldade de adicionar features conversacionais novas sem regredir as existentes

**Contexto:** Hoje os fluxos conversacionais estão espalhados em switch/case e if/else:
- `onboarding.service.ts` — switch com 7 steps hardcoded
- `assistente.service.ts` — prompt monolítico para reconhecer 15 intents + switch gigante no `executeIntent`
- `message.processor.ts` — orquestra com if/else sequencial (ativação → onboarding → termos → mídia → intent)

Com a adição de novos fluxos (collaborator onboarding, upgrade via Cleo, cancelamento conversacional, FAQ contextual), o código fica progressivamente mais difícil de manter, testar e evoluir.

**Problema adicional:** A abordagem atual de "1 prompt gigante para tudo" limita a qualidade da IA — prompts menores e especializados por nó produzem respostas melhores.

**Proposta:** Substituir a lógica de orquestração por **grafos de agentes usando LangGraph** (`@langchain/langgraph`).

**Por que LangGraph e não State Machine simples (XState, custom)?**

| Critério | State Machine | LangGraph |
|----------|--------------|-----------|
| Nós podem chamar IA | Não (precisa adaptar) | Sim (nativo) |
| Estado persistido entre mensagens | Manual (tabela) | Checkpointer embutido |
| Edges condicionais por resposta IA | Não | Sim |
| Mistura lógica determinística + IA | Difícil | Projetado pra isso |
| Streaming/observabilidade | Não | Sim |
| TypeScript nativo | XState sim, custom sim | Sim (`@langchain/langgraph`) |
| Curva de aprendizado | Baixa | Média |
| Overkill pra fluxos simples? | Não | Levemente (mas escala bem) |

**Conclusão:** State machine resolve o problema de organização, mas LangGraph resolve organização + qualidade de IA + persistência + observabilidade. Como a Cleo é IA-driven, o ganho é substancial.

**Arquitetura proposta:**

```
src/modules/graphs/
├── graphs.port.ts              # Interface do graph engine
├── state.ts                    # ConversationState tipado (shared entre grafos)
├── checkpointer.adapter.ts    # Persiste estado no Supabase (implementa BaseCheckpointSaver)
├── onboarding.graph.ts        # Grafo: owner onboarding (7 nós)
├── assistant.graph.ts         # Grafo: interpretação de comandos (router → tool nodes)
├── cancellation.graph.ts      # Grafo: cancelamento conversacional
└── collaborator.graph.ts      # Grafo: onboarding leve de colaborador
```

**Exemplo — Grafo de Onboarding:**

```typescript
import { StateGraph, Annotation, END } from '@langchain/langgraph';

const OnboardingState = Annotation.Root({
  userId: Annotation<string>,
  step: Annotation<string>,
  messages: Annotation<string[]>,
  data: Annotation<Record<string, string>>,
  response: Annotation<string>,
});

const onboardingGraph = new StateGraph(OnboardingState)
  .addNode('confirm_name', confirmNameNode)
  .addNode('business_type', businessTypeNode)
  .addNode('target_audience', targetAudienceNode)
  .addNode('tone_of_voice', toneOfVoiceNode)
  .addNode('business_hours', businessHoursNode)
  .addNode('outside_hours', outsideHoursNode)
  .addNode('confirm_summary', confirmSummaryNode)
  .addNode('save_profile', saveProfileNode)
  .addEdge('confirm_name', 'business_type')
  .addEdge('business_type', 'target_audience')
  .addEdge('target_audience', 'tone_of_voice')
  .addEdge('tone_of_voice', 'business_hours')
  .addEdge('business_hours', 'outside_hours')
  .addEdge('outside_hours', 'confirm_summary')
  .addConditionalEdges('confirm_summary', routeConfirmation, {
    confirmed: 'save_profile',
    retry: 'business_type',
  })
  .addEdge('save_profile', END)
  .compile({ checkpointer }); // Persiste estado automaticamente
```

**Exemplo — Grafo do Assistente (Router Pattern):**

```typescript
const assistantGraph = new StateGraph(AssistantState)
  .addNode('classify_intent', classifyIntentNode)   // IA: prompt pequeno e focado
  .addNode('list_leads', listLeadsNode)             // Determinístico: query no banco
  .addNode('schedule_followup', scheduleNode)       // Determinístico + validação
  .addNode('send_material', sendMaterialNode)       // Determinístico: forward
  .addNode('configure_rule', configureNode)         // Misto: IA parseia + salva
  .addNode('fallback', fallbackNode)                // Mensagem de "não entendi"
  .addConditionalEdges('classify_intent', routeByIntent, {
    list_leads: 'list_leads',
    schedule_followup: 'schedule_followup',
    send_material: 'send_material',
    configure_rule: 'configure_rule',
    unknown: 'fallback',
  })
  .compile({ checkpointer });
```

**Benefícios concretos para o Hi Cleo:**

1. **Prompts menores e melhores** — cada nó tem prompt especializado (melhor que 1 prompt gigante)
2. **Estado persistido nativamente** — checkpointer salva/retoma conversa no Supabase (substitui `onboarding_states`)
3. **Adicionar fluxo = criar grafo** — sem mexer no processor, sem if/else
4. **Testabilidade** — cada nó é uma função pura testável isoladamente
5. **Edges condicionais inteligentes** — "se confidence < 0.7, vai pro fallback" fica declarativo
6. **Fallback chain mantido** — AiFallbackAdapter (Gemini → Groq) continua funcionando dentro dos nós
7. **Observabilidade** — LangSmith (opcional) mostra trace de cada mensagem processada
8. **Base para features futuras** — FAQ contextual, agendamento conversacional, upgrade via chat

**Plano de migração (incremental, sem quebra):**

| Fase | O que | Estimativa |
|------|-------|-----------|
| 1 | Instalar `@langchain/langgraph` + `@langchain/google-genai`, criar `graphs/` module e checkpointer Supabase | 0.5 dia |
| 2 | Implementar `onboarding.graph.ts` — migrar os 7 steps para nós do grafo | 1 dia |
| 3 | Swap no `message.processor.ts`: trocar `onboardingService.processMessage()` por `onboardingGraph.invoke()` | 0.5 dia |
| 4 | Implementar `assistant.graph.ts` — router de intents com nós especializados | 1.5 dia |
| 5 | Swap no processor: trocar `assistenteService.recognize()` + `executeIntent()` pelo grafo | 0.5 dia |
| 6 | Criar grafos adicionais (cancelamento, collaborator) | 1 dia |
| 7 | Remover código legado (switch/case antigo) e atualizar testes | 1 dia |

**Estimativa total:** 5-6 dias (pode ser feito em fases, cada uma entrega valor independente)

**Dependências npm:**
```bash
npm install @langchain/langgraph @langchain/google-genai @langchain/core
```

**Decisões a tomar antes de implementar:**
- Checkpointer: usar Supabase (PostgreSQL) direto ou Redis? → Supabase (já é o banco, persiste entre deploys)
- Manter `AiFallbackAdapter` ou trocar por LangChain model com fallback? → Manter adapter próprio (menos acoplamento)
- Migração da tabela `onboarding_states` → `conversation_checkpoints` ou reusar a mesma tabela com schema novo?

**Referências:**
- [LangGraph JS/TS — Docs oficiais](https://docs.langchain.com/oss/javascript/langgraph/overview)
- [LangGraphJS — GitHub](https://github.com/langchain-ai/langgraphjs)
- [LangGraph v1 (stable)](https://docs.langchain.com/oss/javascript/releases/langgraph-v1)

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
| ✅ Concluídos | #1-11, #13, #17, #18, #20, #21, #30, #31, #33-37 |
| 🔴 Bloqueante | #22 (deploy) |
| 🟡 Pós-lançamento | #14, #16, #19 |
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
