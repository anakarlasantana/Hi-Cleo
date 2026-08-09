# Arquitetura de IA — Hi Cleo

Documento de referência para a camada de inteligência artificial do backend.
Descreve a estrutura atual, as decisões de design e o plano de migração para LangGraph.

---

## Visão Geral

A Cleo usa IA em dois eixos:

1. **Entender o dono** — interpretar comandos, respostas do onboarding e áudios
2. **Atender os clientes do dono** — respostas contextuais baseadas no negócio (usando dados do onboarding: nome, serviços, tom de voz, horário, público-alvo)

Ambos os eixos fazem parte do beta. O onboarding existe justamente para alimentar a IA
com contexto suficiente para que ela atue como secretária real — não como autoresponder.

A estratégia é implementar IA **agora** com funções isoladas (nós) e prompts separados,
de forma que a migração para LangGraph no pós-beta seja mecânica (mover nós para grafos).

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
│   ├── transcribe-audio.ts      # Baixa e transcreve áudio via Whisper
│   ├── recognize-intent.ts      # Classifica intent do dono
│   ├── generate-client-reply.ts # Gera resposta contextual para cliente do dono
│   └── interpret-confirmation.ts # Interpreta confirmação/aceite genérico
├── adapters/                    # Providers de IA
│   ├── gemini.adapter.ts        # Google Gemini 2.0 Flash
│   ├── groq.adapter.ts          # Groq (Llama 3.1 + Whisper)
│   └── ai-fallback.adapter.ts   # Chain de fallback (Gemini → Groq)
└── index.ts                     # Re-exporta tudo para facilitar imports

backend/src/shared/ports/
└── ai.port.ts                   # Interface AiPort (global, usada por adapters e nós)
```

### Módulos que CONSOMEM a IA (não contêm lógica de IA)

```
modules/onboarding/   → usa nodes/interpret-onboarding.ts
modules/queue/        → usa nodes/transcribe-audio.ts, nodes/recognize-intent.ts, nodes/generate-client-reply.ts
modules/terms/        → usa nodes/interpret-confirmation.ts
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

Hoje: `OnboardingService` com switch/case chamando nós.
Futuro: grafo LangGraph com edges condicionais.

```
HOJE:  switch(step) → chama nó → atualiza estado → retorna resposta
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
  isOutsideHours: boolean,
): Promise<string> {
  const prompt = buildClientReplyPrompt(businessContext, isOutsideHours);
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

## Fluxo de Migração (Beta → LangGraph)

### Fase 1 — Agora (pré-beta)
- Criar `modules/ai/` com prompts, nós e estado separados
- Services chamam nós diretamente (sem grafo)
- IA interpreta respostas no onboarding, transcreve áudio, reconhece intents

### Fase 2 — Pós-beta (com dados reais)
- Instalar `@langchain/langgraph`
- Criar `graphs/onboarding.graph.ts` — compila nós em grafo
- Implementar checkpointer Supabase (substitui `onboarding_states`)
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

| Fluxo | Hoje | Alvo (beta) | Alvo (LangGraph) |
|-------|------|-------------|-------------------|
| Ativação (parse dados) | ✅ IA | ✅ IA | Nó no grafo |
| Onboarding (interpretar respostas) | ❌ Regex | ✅ IA via nó | Nós no grafo |
| Transcrição de áudio (onboarding) | ✅ Whisper | ✅ Whisper | Nó `transcribe` |
| Transcrição de áudio (pós-onboarding) | ❌ Salva como material | ✅ Whisper + intent | Nó `transcribe` → router |
| Reconhecimento de intents | ✅ IA | ✅ IA | Nó router no grafo |
| Aceite de termos | ❌ 3 palavras fixas | ✅ IA via nó | Nó no grafo |
| Respostas aos clientes | ❌ Template fixo | ✅ IA contextual (negócio + tom) | Nó especializado no grafo |
| Classificação de leads | ❌ Não existe | ❌ Não existe | Nó classificador |

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
| Checkpointer | Supabase (Postgres) vs Redis | Supabase (já é o banco, persiste entre deploys) |
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
   - Cada resposta ao cliente é isolada (sem enviar mensagens anteriores)
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
- Dashboard simples (futuro): custo estimado por dono

---

## Personalidade da Cleo

> Documentação completa de personalidade, tom de voz e cenários de comportamento:
> ver [personalidade-cleo.md](../produto/personalidade-cleo.md)

A personalidade é transmitida via prompts compactos com contexto emocional — não via regras explícitas longas.
Princípio: dar à IA o **contexto do negócio + tom + público** e deixar ela adaptar naturalmente.
