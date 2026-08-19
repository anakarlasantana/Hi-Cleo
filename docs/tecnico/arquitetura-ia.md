# Arquitetura de IA — Hi Cleo

Documento de referência para a camada de inteligência artificial do backend.
Descreve a estrutura atual, as decisões de design e o plano de migração para LangGraph.

---

## Visão Geral

A Cleo usa IA em três eixos:

1. **Entender o dono** — interpretar comandos, respostas do onboarding e áudios transcritos
2. **Atender os clientes do dono** — respostas contextuais baseadas no negócio (usando dados do onboarding: nome, serviços, tom de voz, horário, público-alvo)
3. **Classificação local (sem IA)** — resolver mensagens simples por regex/keywords, reduzindo 30-50% das chamadas de IA

O onboarding existe justamente para alimentar a IA com contexto suficiente para que ela
atue como secretária real — não como autoresponder.

A estratégia é implementar IA **agora** com funções isoladas (nós) e prompts separados,
de forma que a migração para LangGraph no pós-beta seja mecânica (mover nós para grafos).

### Providers de IA — Ordem de Fallback Atual

```
DeepSeek (primário) → Groq (fallback rápido) → Gemini (último recurso)
```

| Provider | Modelo Ativo | Papel |
|----------|-------------|-------|
| DeepSeek | deepseek-chat | Primário — barato, sem rate limit restritivo, bom em PT-BR |
| Groq | qwen/qwen3.6-27b | Fallback — gratuito, resposta rápida, bom para cargas altas |
| Gemini | gemini-3.6-flash | Último recurso — rate limit restritivo no free tier |

Cada adapter mantém uma lista de modelos alternativos para fallback automático caso um
modelo seja descontinuado (ver seção "Fallback de Modelo e Alertas de Deprecação").

---

## Decisões de Design

### Por que NÃO usar LangGraph agora?

| Motivo | Detalhe |
|--------|---------|
| Risco de regressão | Trocar o motor de conversação antes do beta pode quebrar fluxos funcionais |
| Validação primeiro | O beta mostra quais fluxos realmente precisam de grafo com dados reais |
| Escopo controlado | A arquitetura com nós isolados já resolve os problemas atuais |
| Migração mais fácil | Com nós puros, migrar é copiar a lógica para dentro do grafo |

### Por que separar prompts, nós e estado?

Baseado nos padrões da comunidade (SIDE Framework, LangGraph Application Structure):

- **Prompts pequenos e especializados** produzem respostas melhores que um prompt monolítico
- **Nós como funções puras** são testáveis isoladamente e mapeiam 1:1 para nós LangGraph
- **Estado tipado** facilita persistência (checkpointer) e debugging
- **Orquestrador separado** permite trocar switch/case por grafo sem reescrever lógica

### Referências de arquitetura

- [LangGraph Application Structure](https://docs.langchain.com/oss/javascript/langgraph/application-structure) — estrutura oficial
- [SIDE Framework](https://medium.com/@bessiedelight/the-langgraph-mental-model) — State, Instructions, Decisions, Execution
- [Architecting AI Agents with TypeScript](https://apeatling.com/2025/04/21/architecting-ai-agents-with-typescript/) — padrão funcional modular
- [TypeScript AI Agent Architecture](https://markaicode.com/architecture/typescript-ai-agent-architecture/) — separação router/orchestrator/workers/state

---

## Estrutura de Arquivos

```
backend/src/modules/ai/
├── state.ts                     # Tipagem do estado conversacional (shared entre fluxos)
├── prompts/                     # Um arquivo por contexto — prompts pequenos e especializados
│   ├── onboarding.prompts.ts    # Prompt por step do onboarding
│   ├── intent.prompts.ts        # Prompt de reconhecimento de intents do dono
│   ├── client-reply.prompts.ts  # Prompt de resposta contextual aos clientes
│   └── terms.prompts.ts         # Prompt de interpretação de aceite
├── nodes/                       # Funções puras (futuros nós do LangGraph)
│   ├── interpret-onboarding.ts  # Interpreta resposta do usuário em cada step
│   ├── transcribe-audio.ts      # Baixa e transcreve áudio via Groq Whisper
│   ├── recognize-intent.ts      # Classifica intent do dono (com fallback por keywords)
│   ├── generate-client-reply.ts # Gera resposta contextual para cliente do dono (multi-turno)
│   ├── interpret-confirmation.ts # Interpreta confirmação/aceite genérico
│   └── local-classifier.ts     # Classificação local SEM IA (saudações + keywords do dono)
├── adapters/                    # Providers de IA (com fallback de modelo por provider)
│   ├── gemini.adapter.ts        # Google Gemini (lista de modelos com fallback)
│   ├── groq.adapter.ts          # Groq (lista de modelos com fallback)
│   ├── deepseek.adapter.ts      # DeepSeek (lista de modelos com fallback)
│   └── ai-fallback.adapter.ts   # Chain de fallback entre providers + detecção de deprecação
└── index.ts                     # Re-exporta tudo para facilitar imports

backend/src/shared/ports/
└── ai.port.ts                   # Interface AiPort (global, usada por adapters e nós)
```

### Módulos que CONSOMEM a IA (não contêm lógica de IA)

```
modules/onboarding/       → usa nodes/interpret-onboarding.ts (com fallback local regex)
modules/queue/            → usa nodes/transcribe-audio.ts, nodes/recognize-intent.ts,
                            nodes/generate-client-reply.ts, nodes/local-classifier.ts
modules/terms/            → usa nodes/interpret-confirmation.ts
modules/assistente/       → usa nodes/recognize-intent.ts (wrapper service)
modules/trial/            → NÃO usa IA diretamente (validação é regra de negócio)
modules/invites/          → NÃO usa IA diretamente (acionado por intents reconhecidas)
```

---

## Conceitos-Chave

### Nó (Node)

Função pura que recebe estado + mensagem e retorna resultado tipado.
Não conhece o fluxo — não sabe quem veio antes nem quem vem depois.

```typescript
// nodes/interpret-onboarding.ts
export async function interpretOnboardingResponse(
  ai: AiPort,
  step: string,
  message: string,
  context: Record<string, string>,
): Promise<InterpretedResponse> {
  const prompt = ONBOARDING_PROMPTS[step];
  const response = await ai.generateContent([prompt, message]);
  return JSON.parse(response);
}
```

**Futuro LangGraph:** esta função vira o corpo do nó no grafo.

### Prompt

String constante exportada, um por step/contexto. Pequeno e focado.

```typescript
// prompts/onboarding.prompts.ts
export const ONBOARDING_PROMPTS: Record<string, string> = {
  confirm_name: `O usuário está informando como quer ser chamado...`,
  business_type: `O usuário está descrevendo o que faz profissionalmente...`,
  // ...
};
```

### Estado (State)

Tipagem do que flui entre nós. No futuro, será o `Annotation` do LangGraph.

```typescript
// state.ts
export interface ConversationState {
  userId: string;
  step: string;
  data: Record<string, string>;
  lastMessage: string;
  response?: string;
}
```

### Orquestrador

Hoje: `message.processor.ts` como orquestrador central (não mais os services individuais).
O processor decide o fluxo com base em: instância, tipo de mídia, estado do user,
local-classifier e reconhecimento de intent.

```
HOJE:  processor recebe mensagem →
       1. Filtros (prospecção, ativação, onboarding, termos)
       2. Mídia (áudio→transcrição, resto→material)
       3. Local-classifier (resolve sem IA se possível)
       4. IA: reconhece intent → executeIntent()
       5. Para clientes: local-classifier → IA contextual → fallback degradado

FUTURO: grafo.invoke(state) → nó executa → edge decide próximo → checkpointer salva
```

---

## Nó de Resposta ao Cliente (core do produto)

Este é o diferencial da Cleo — atender os clientes do dono como uma secretária real.

### Dados disponíveis (coletados no onboarding)
- Nome do dono
- Tipo de negócio / serviços
- Público-alvo
- Tom de voz (formal / descontraído / informal)
- Horário de atendimento

### Lógica do nó `generate-client-reply`

```typescript
// nodes/generate-client-reply.ts
export async function generateClientReply(
  ai: AiPort,
  businessContext: BusinessContext,
  clientMessage: string,
  clientName: string | undefined,
  isOutsideHours: boolean,
  recentMessages?: Message[],  // Últimas 5 msgs do lead (contexto multi-turno)
): Promise<string> {
  const conversationHistory = formatConversationHistory(recentMessages || [], clientName);
  const prompt = buildClientReplyPrompt(businessContext, isOutsideHours, conversationHistory);
  return ai.generateContent([prompt, clientMessage]);
}
```

### O que a Cleo FAZ como secretária:
- Responde no tom configurado pelo dono
- Informa horário de atendimento quando perguntado
- Diz que vai anotar e o dono retorna (não inventa informações)
- Fora do horário: avisa que não está disponível
- Para perguntas sobre preço/serviço: "Vou anotar seu interesse e o [dono] te retorna em breve!"

### O que a Cleo NÃO faz (para evitar problemas):
- Não inventa preços, prazos ou detalhes que o dono não informou
- Não agenda compromissos sem confirmação do dono
- Não promete nada em nome do dono

### Evolução futura:
- Dono poderá adicionar FAQ (perguntas frequentes) via WhatsApp
- Dono poderá adicionar tabela de preços
- Com mais contexto, Cleo responde cada vez mais perguntas sozinha

---

## Classificador Local (local-classifier.ts)

### Objetivo

Resolver mensagens simples **sem chamar providers de IA**, reduzindo 30-50% das chamadas
e consequentemente custo e latência.

### Estratégia

- **Saudações de clientes** → detecta "oi", "bom dia", etc. e responde com template baseado no tom de voz do dono
- **Keywords exatas do dono** → bypass do reconhecimento de intent por IA
- **Não tenta resolver mensagens ambíguas** — na dúvida, retorna `null` e deixa a IA decidir

### Padrões de saudação (clientes)

```
oi, olá, hey, eai, bom dia, boa tarde, boa noite, opa, fala, salve,
beleza, tudo bem, hi, hello, hey there
```

Quando detectada saudação → `classifyClientMessage()` retorna `{ resolved: true, intent: 'greeting' }`.
O caller (`message.processor.ts`) gera resposta via `buildGreetingReply()` usando o tom de voz do negócio.

### Keywords do dono (bypass intent recognition)

| Keyword(s) | Intent Mapeada |
|------------|---------------|
| ajuda, help, comandos | `help` |
| quem tá ignorado, lista ignorados | `list_ignored` |
| meus clientes, mostra clientes, leads | `list_leads` |
| clientes de hoje, leads de hoje | `leads_today` |
| quem tá sem resposta, pendentes | `no_reply` |
| clientes quentes, leads quentes | `hot_leads` |

Quando detectado → `classifyOwnerMessage()` retorna `{ resolved: true, intent }`.
O processor executa a intent diretamente sem chamar IA.

### Limites intencionais

- Mensagens < 2 chars → não classifica (podem ser typos)
- Mensagens > 60 chars do dono → não classifica (provavelmente é conversa complexa)
- Qualquer coisa com entidades (nome, telefone, data) → vai para IA

---

## Intents do Dono — Mapa Completo

O sistema reconhece as seguintes intents do dono (via IA ou local-classifier):

| Intent | Descrição | Requer Entidades? | Local-Classifier? |
|--------|-----------|-------------------|-------------------|
| `list_leads` | Listar clientes/contatos | Não | ✅ |
| `leads_today` | Clientes novos de hoje | Não | ✅ |
| `no_reply` | Clientes sem retorno | Não | ✅ |
| `hot_leads` | Clientes engajados | Não | ✅ |
| `help` | Comandos disponíveis | Não | ✅ |
| `list_ignored` | Contatos ignorados | Não | ✅ |
| `schedule_followup` | Agendar lembrete | Sim (name, date, time) | ❌ |
| `lead_status` | Status de cliente específico | Sim (name) | ❌ |
| `send_material` | Enviar documento/arquivo | Sim (name, material) | ❌ |
| `configure_rule` | Mudar configuração | Sim (horário/regra) | ❌ |
| `ignore_contact` | Ignorar número | Sim (name/phone) | ❌ |
| `stop_ignoring` | Parar de ignorar | Sim (name/phone) | ❌ |
| `invite_user` | Convidar colaborador | Sim (phone) | ❌ |
| `disconnect_user` | Desconectar colaborador | Sim (phone) | ❌ |
| `unknown` | Não identificado | — | — |

### Fallback de reconhecimento

Quando a IA falha (timeout, erro de parsing), o nó `recognize-intent.ts` possui um
fallback por keywords que cobre as intents mais comuns (similar ao local-classifier,
mas aceita matches parciais em textos mais longos).

---

## Fluxo de Materiais (send_material)

### Salvar material

1. Dono envia documento/imagem/vídeo para a Cleo (instância secretary)
2. Processor detecta mídia (não é áudio) → salva no lead especial "materials"
3. Confirma: "✅ Material recebido: 📄 arquivo.pdf"

### Reenviar material

1. Dono diz: "manda material pro João"
2. IA reconhece intent `send_material` com entities `{ name: "João", material: "..." }`
3. Se há múltiplos materiais e não especificou qual → lista para escolha
4. Se especificou nome → busca por match parcial no filename
5. Envia via `messaging.forwardMessage()` usando o `media_key` original
6. Confirma: "✅ arquivo.pdf enviado para João!"

---

## Módulo Trial (modules/trial/)

### Parâmetros do trial

| Parâmetro | Valor |
|-----------|-------|
| Duração | 7 dias |
| Limite de respostas | 30 |
| Cooldown por telefone | 90 dias |
| Rate limit por IP | 3 trials/24h |
| Plano concedido | solo (subscription_status: trial) |

### Fluxo de criação

1. `trial.controller.ts` recebe request (name, phone, IP)
2. `trial.service.ts` valida:
   - Telefone brasileiro válido (55 + DDD + 9 + 8 dígitos)
   - Cooldown: mesmo telefone não pode testar novamente em 90 dias
   - Rate limit: máximo 3 IPs iguais em 24h
   - Conta existente: não pode ter user ativo com esse telefone
3. Se válido → cria trial_attempt + user (trial) + código de ativação
4. Retorna código ATIVAR-XXXX para o frontend

### Guard no processamento de clientes

Quando `user.subscription_status === 'trial'`:
- Verifica expiração (7 dias)
- Verifica limite de respostas (30)
- Se inválido → resposta genérica ("O responsável vai te responder em breve")
- Se limite atingido → avisa o dono via WhatsApp com link de checkout

### Métricas rastreadas (por trial)

- `leads_captured` — incrementado na primeira mensagem de cada lead novo
- `whatsapp_connected` — marcado true na primeira mensagem de qualquer cliente
- `last_activity_at` — atualizado a cada interação

### Prospecção pós-trial (trial-prospection.cron.ts)

Cron diário (10h) que envia mensagens automatizadas para ex-trials:

**Classificação de temperatura:**

| Temperatura | Critério |
|------------|---------|
| 🔥 Hot | ≥20 respostas usadas + WhatsApp conectado + ≥1 lead capturado |
| 🟡 Warm | Onboarding completo + ≥5 respostas usadas |
| 🧊 Cold | Demais |

**Timing por temperatura:**

| Temperatura | 1ª tentativa (dias após expirar) | 2ª tentativa |
|------------|----------------------------------|-------------|
| Hot | 1 dia | 14 dias depois |
| Warm | 3 dias | 17 dias depois |
| Cold | 7 dias | Não recebe 2ª |

**Limites:**
- Máximo 2 tentativas de prospecção
- Máximo 20 envios por execução do cron
- Intervalo mínimo de 13 dias entre prospecções
- Delay de 3s entre envios (anti-ban WhatsApp)

**Opt-out automático:**
Se o ex-trial responde com "não", "para", "cancela" → status muda para `not_interested`
e não recebe mais mensagens.

---

## Módulo Invites (modules/invites/)

### Objetivo

Permitir que o dono convide colaboradores para conectarem seus WhatsApps ao plano dele
(modelo multi-user dos planos Equipe e Empresa).

### Fluxo

1. Dono diz: "convida 11999887766"
2. IA reconhece intent `invite_user` → `executeIntent()` chama `inviteService.createInvite()`
3. Valida: slots disponíveis no plano, assinatura ativa
4. Cria invite com token único + envia link via WhatsApp ao colaborador
5. Colaborador acessa link → conecta WhatsApp → sessão criada vinculada ao dono
6. Para desconectar: "desconecta 11999887766" → `inviteService.disconnectCollaborator()`

### Limites

- Convite expira em 72 horas
- Slots limitados pelo plano (solo=1, equipe=5, empresa=10)
- Se sem slots → sugere upgrade ou desconectar alguém

---

## Resposta Degradada (Fallback quando IA total falha)

Quando **todos** os providers de IA falham (`AI_ALL_PROVIDERS_FAILED`), o sistema
não deixa o cliente sem resposta:

### Para clientes do dono:
Usa `getDegradedReplyForClient()` que gera mensagem genérica respeitando o tom de voz:
- Formal: "Sua mensagem foi registrada e retornaremos em breve."
- Casual: "Tô aqui! Já anotei e a gente te responde logo!"
- Friendly: "Já anotei seu contato e vamos te retornar em breve!"

### Para o dono:
Usa `getDegradedReplyForOwner()` com mensagem genérica + info sobre o problema.

### Alerta simultâneo:
O `AiFallbackAdapter` envia alerta crítico ao admin via WhatsApp quando todos os providers falham.

---

## Fluxo Completo de Processamento (message.processor.ts)

### Mensagem do DONO (instância secretary)

```
1. Detecta resposta de prospecção pós-trial? → Sim → trata opt-in/opt-out → fim
2. É código de ativação (ATIVAR-XXXX)? → Sim → ativa user → inicia onboarding → fim
3. User existe? → Não → "envie seu código de ativação" → fim
4. Onboarding completo? → Não → transcreve áudio se for → processMessage() → fim
5. Precisa aceitar termos? → Sim → verifica aceite via IA → fim
6. É mídia?
   6a. Áudio → transcreve → reconhece intent → executa
   6b. Documento/imagem/vídeo → salva como material → fim
7. Local-classifier resolve? → Sim → executa intent direto → fim
8. Reconhece intent via IA → confidence < 0.7? → pede reformulação
9. Executa intent reconhecida → responde
```

### Mensagem de CLIENTE (instância do dono)

```
1. Sessão existe para a instância? → Não → ignora
2. User (dono) existe? → Não → ignora
3. Contato excluído? → Sim → ignora
4. Cria/busca lead → salva mensagem → atualiza métricas trial se aplicável
5. Trial válido? → Não (expirado/limite) → mensagem genérica + avisa dono → fim
6. Verifica horário comercial → fora do horário + regra customizada? → aplica regra → fim
7. Local-classifier (saudação)? → Sim → template greeting → fim
8. Gera resposta via IA (generateClientReply) com contexto do negócio + histórico
9. Se IA falha total → resposta degradada
10. Envia resposta → salva no banco
```

---

## Fallback de Modelo e Alertas de Deprecação

### Problema

Provedores de IA descontinuam modelos sem muito aviso prévio. Quando isso acontece, a API
retorna erro 404 e a Cleo para de responder clientes — impacto direto em produção.

### Solução implementada

Cada adapter mantém uma **lista ordenada de modelos** (do preferido ao mais genérico).
Quando o modelo ativo retorna 404 ("no longer available"), o sistema:

1. Tenta automaticamente o próximo modelo da lista do mesmo provider
2. Se funcionar, atualiza o modelo ativo em memória (sem restart)
3. **Alerta o admin via WhatsApp** sobre a troca, indicando ação necessária

Se todos os modelos de um provider falharem, o `AiFallbackAdapter` tenta o próximo provider
(comportamento existente).

### Listas de modelos por provider

```typescript
// gemini.adapter.ts
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash', 'gemini-flash-latest'];

// deepseek.adapter.ts
const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-reasoner'];

// groq.adapter.ts
const GROQ_MODELS = ['qwen/qwen3.6-27b', 'llama-3.3-70b-versatile', 'mixtral-8x7b-32768'];
```

### Interface de fallback

Todos os adapters expõem:

```typescript
interface ModelFallbackCapable {
  activeModel: string;                           // Modelo em uso
  advanceModel(): {                             // Tenta o próximo da lista
    switched: boolean;
    previous: string;
    current: string;
  };
}
```

### Alerta ao admin

Quando um modelo é detectado como descontinuado e o fallback assume, o admin recebe:

```
🔄 Modelo de IA descontinuado

Provider: Gemini
Modelo anterior: gemini-3.6-flash (descontinuado)
Modelo atual: gemini-flash (fallback automático)

A Cleo continua funcionando normalmente.

⚠️ Ação necessária: atualize a lista de modelos no código para
refletir a mudança e evitar uso de fallbacks menos otimizados.
```

### Detecção de deprecação

O sistema identifica modelo descontinuado pelos seguintes sinais:
- HTTP 404
- Mensagem contendo: "no longer available", "not found", "does not exist", "decommissioned"

### Cooldown de alertas

Para evitar spam, alertas do mesmo tipo respeitam cooldown de **10 minutos**.
Um modelo descontinuado gera apenas 1 alerta — depois o fallback assume silenciosamente.

### Manutenção

Quando receber o alerta:
1. Verificar qual modelo novo o provider recomenda
2. Atualizar a lista `*_MODELS` no adapter correspondente (remover o antigo, adicionar o novo no topo)
3. Deploy — o sistema volta a usar o modelo preferido

---

## Fluxo de Migração (Beta → LangGraph)

### Fase 1 — Agora (pré-beta)
- Criar `modules/ai/` com prompts, nós e estado separados
- Services chamam nós diretamente (sem grafo)
- IA interpreta respostas no onboarding, transcreve áudio, reconhece intents

### Fase 2 — Pós-beta (com dados reais)
- Instalar `@langchain/langgraph`
- Criar `graphs/onboarding.graph.ts` — compila nós em grafo
- Implementar checkpointer PostgreSQL (substitui `onboarding_states`)
- Swap no processor: trocar `onboardingService.processMessage()` por `graph.invoke()`

### Fase 3 — Expansão
- Criar `graphs/assistant.graph.ts` — router de intents com nós especializados
- Criar grafos adicionais (cancelamento conversacional, FAQ contextual)
- Remover switch/case legado

### O que monitorar no beta para priorizar a migração
- % de usuários que travam em algum step do onboarding
- % de mensagens com confidence < 0.7 (intent não reconhecido)
- Novos fluxos pedidos que não cabem no switch/case
- Tempo médio de onboarding (meta: < 2 min)

---

## Mapa de Uso de IA (Atual vs. Alvo)

| Fluxo | Hoje | Usa IA? | Nó/Módulo |
|-------|------|---------|-----------|
| Ativação (parse dados) | ✅ Implementado | ✅ Sim | activation.service |
| Onboarding (interpretar respostas) | ✅ Implementado | ✅ Sim + fallback regex | nodes/interpret-onboarding.ts |
| Transcrição de áudio | ✅ Implementado | ✅ Groq Whisper | nodes/transcribe-audio.ts |
| Reconhecimento de intents | ✅ Implementado | ✅ Sim + fallback keywords | nodes/recognize-intent.ts |
| Aceite de termos | ✅ Implementado | ✅ Sim | nodes/interpret-confirmation.ts |
| Respostas aos clientes | ✅ Implementado | ✅ Sim + histórico multi-turno | nodes/generate-client-reply.ts |
| Classificação local (saudações) | ✅ Implementado | ❌ Regex local | nodes/local-classifier.ts |
| Classificação local (keywords dono) | ✅ Implementado | ❌ Regex local | nodes/local-classifier.ts |
| Trial (validação/criação) | ✅ Implementado | ❌ Regra de negócio | modules/trial/ |
| Prospecção pós-trial | ✅ Implementado | ❌ Templates + cron | trial-prospection.cron.ts |
| Convites (multi-user) | ✅ Implementado | ❌ Regra de negócio | modules/invites/ |
| Materiais (salvar/reenviar) | ✅ Implementado | ❌ Forward direto | message.processor.ts |
| Fallback degradado | ✅ Implementado | ❌ Templates | shared/utils/fallback-templates.ts |
| Memória de conversa (multi-turno) | ✅ Últimas 5 msgs | ✅ Injeta no prompt | generate-client-reply.ts |
| Classificação de leads | ❌ Não existe | — | Futuro: nó classificador |
| FAQ contextual | ❌ Não existe | — | Futuro: dados do dono |

---

## AiPort — Interface Expandida (proposta)

Atual:
```typescript
export interface AiPort {
  generateContent(prompts: string[]): Promise<string>;
}
```

Proposta para suportar transcrição:
```typescript
export interface AiPort {
  generateContent(prompts: string[]): Promise<string>;
  transcribeAudio?(audioBuffer: Buffer, mimeType: string): Promise<string | null>;
}
```

O `?` mantém compatibilidade — adapters que não suportam áudio (Gemini) retornam `null`.
O adapter Groq implementa via Whisper.

---

## Decisões Pendentes (para LangGraph futuro)

| Decisão | Opções | Recomendação |
|---------|--------|--------------|
| Checkpointer | PostgreSQL vs Redis | PostgreSQL (já é o banco, persiste entre deploys) |
| Manter AiFallbackAdapter | vs LangChain model com fallback | Manter adapter próprio (menos acoplamento) |
| Tabela de estado | Migrar `onboarding_states` vs nova tabela | Nova tabela `conversation_checkpoints` (schema LangGraph) |
| Observabilidade | LangSmith vs custom logging | Custom logging no beta, LangSmith quando escalar |

---

## Otimização de Tokens

### Problema

Cada mensagem de cliente gera 1 chamada de IA. Com 20 donos × 30 clientes/dia = 600 chamadas/dia.
Se cada chamada usa ~400 tokens de prompt, isso queima tokens rápido e custa mais.

### Estratégia em 2 fases

#### Fase 1 — Beta: Prompt compacto + Caching automático

**Princípio:** menos tokens ≠ menos qualidade. É remover redundância, não contexto útil.

1. **Perfil semântico compacto** (~80-120 tokens)
   - Em vez de prompt verboso com regras repetidas, usar perfil denso com personalidade
   - Dados do `businesses` (já coletados no onboarding) condensados em 1-2 linhas

2. **Estrutura fixa para caching**
   - O system prompt por dono deve ter prefixo idêntico entre chamadas
   - Providers aplicam desconto automaticamente:
     - Groq: 50% nos tokens cacheados
     - Gemini 2.0+: até 90% (implicit caching)
   - Não requer código extra — só manter o prompt estável

3. **Sem histórico de conversa**
   - ~~Cada resposta ao cliente é isolada (sem enviar mensagens anteriores)~~
   - **ATUALIZADO:** Histórico básico implementado (últimas 5 mensagens do lead)
   - Injetado APÓS o prefixo fixo do dono para preservar caching
   - Custo adicional: ~30-80 tokens/chamada (compensado pelo ganho de experiência)
   - Funciona porque a Cleo é secretária (anota e repassa), não consultora

**Resultado esperado:** ~150 tokens/chamada × 600 chamadas/dia = ~90K tokens/dia = **~R$0,05/dia** no Gemini Flash

#### Fase 2 — Produção: Memória por lead

1. **Tabela `lead_memory`**
   ```sql
   CREATE TABLE lead_memory (
     id UUID PRIMARY KEY,
     lead_id UUID REFERENCES leads(id),
     summary TEXT,        -- "Interessada em limpeza de pele, perguntou preço dia 10/08"
     interaction_count INT DEFAULT 0,
     updated_at TIMESTAMPTZ
   );
   ```

2. **Injeção contextual**
   - Quando o mesmo cliente manda mensagem de novo, injeta o resumo (~30-50 tokens)
   - Cleo responde de forma personalizada sem custo significativo

3. **Sumarização progressiva**
   - A cada 5 interações com o mesmo lead, IA gera novo resumo
   - Descarta interações antigas, mantém só o resumo atualizado
   - Custo: 1 chamada extra a cada 5 (amortizado)

4. **Context caching explícito (Gemini)**
   - Para donos com alto volume (>100 clientes/dia)
   - Cache do perfil do dono por 1h = 90% desconto em todas as chamadas daquela hora

### Comparativo de custo

| Cenário | Tokens/chamada | Custo/dia (600 chamadas) | Custo/mês |
|---------|---------------|--------------------------|-----------|
| Sem otimização (prompt verboso) | ~500 | ~R$0,15 | ~R$4,50 |
| Perfil compacto (Fase 1) | ~150 | ~R$0,05 | ~R$1,50 |
| + Caching automático | ~150 (cobra 50%) | ~R$0,025 | ~R$0,75 |
| + Memória por lead (Fase 2) | ~180 (cobra 50%) | ~R$0,03 | ~R$0,90 |

**Para 100 donos em produção:** Fase 1 = ~R$15/mês | Fase 2 = ~R$9/mês

### Monitoramento e Alertas

- Contador de chamadas diárias por provider (Redis)
- Alerta ao admin (via WhatsApp) quando:
  - Provider retorna 429 (rate limit atingido)
  - Todos os providers falham (AI_ALL_PROVIDERS_FAILED)
  - Uso diário atinge 80% do threshold configurado
  - **Modelo descontinuado** — fallback automático acionado (ver seção "Fallback de Modelo")
- Dashboard simples (futuro): custo estimado por dono

---

## Personalidade da Cleo

> Documentação completa de personalidade, tom de voz e cenários de comportamento:
> ver [personalidade-cleo.md](../produto/personalidade-cleo.md)

A personalidade é transmitida via prompts compactos com contexto emocional — não via regras explícitas longas.
Princípio: dar à IA o **contexto do negócio + tom + público** e deixar ela adaptar naturalmente.
