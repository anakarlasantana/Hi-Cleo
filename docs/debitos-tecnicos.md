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

### Outros concluídos
- ~~#11 Padronizar banco para inglês~~ ✅
- ~~#20 Migrations versionadas~~ ✅ (Supabase CLI)
- ~~Limpeza de código~~ ✅ (37 UI components, 23 deps Radix, LeadStatus cold)

---

## 🔴 PENDENTE — ÚNICO BLOQUEANTE

### 31. Reestruturação do Fluxo de Ativação e Suporte Multi-Usuário

**Status:** Pendente — Pré-requisito para planos Equipe/Empresa  
**Prioridade:** Máxima (bloqueia monetização completa)  
**Estimativa:** 3-5 dias (após decisões de negócio)

---

#### Diagnóstico do Problema

O sistema foi construído com foco no plano Solo (1 pagamento = 1 WhatsApp = 1 user). Agora que os planos Equipe (3 conexões) e Empresa (8 conexões) existem no banco com preços, o fluxo de pagamento → ativação → conexão não suporta múltiplos WhatsApps por assinatura. Além disso, o código de ativação é um bearer token sem vínculo ao comprador — qualquer pessoa que tenha acesso ao código pode usá-lo.

---

#### Fluxo Atual (problemático para multi-conta)

```
1. POST /api/payments → MP processa → gera activation_code (sem user_id, sem email)
2. Frontend redireciona → /ativacao?code=ATIVAR-XXXX
3. Usuário manda código no WhatsApp da Cleo
4. activateUser() → CRIA user no banco (com phone da mensagem)
5. Onboarding: 3 perguntas → marca código como used
6. Frontend redireciona → /conectar?code=ATIVAR-XXXX
7. Endpoint gera QR code → cria whatsapp_session vinculada ao user
```

**Problemas nesse fluxo:**
- Passo 1: Código não sabe QUEM pagou (sem email, sem user_id)
- Passo 4: User criado pelo PHONE de quem manda a msg — se alguém transferir o código, outra pessoa cria o user
- Passo 7: Não valida se o código pertence ao user. Não verifica slots disponíveis no plano.
- Plano Equipe: Como o dono conecta 3 WhatsApps? O código já foi marcado como `used` na primeira ativação.

---

#### Novo Fluxo Proposto

```
1. POST /api/payments → MP processa → CRIA USER no banco (com email + plano)
   → gera activation_code vinculado ao user_id e user_email
   → user fica com subscription ativa mas sem phone/business (incompleto)

2. Frontend redireciona → /ativacao?code=ATIVAR-XXXX
   → Tela mostra instruções para mandar código no WhatsApp

3. Usuário manda código no WhatsApp da Cleo
   → BUSCA user existente pelo activation_code.user_id
   → COMPLEMENTA user (add phone, name)
   → Cria business profile
   → Roda onboarding (perguntas de configuração)
   → Marca código como used

4. Frontend detecta ativação → redireciona → /conectar?code=ATIVAR-XXXX
   → Aceita termos
   → Endpoint de QR code:
     a) Valida que o código pertence ao user (via user_email ou user_id)
     b) Busca plan do user → max_users
     c) Conta whatsapp_sessions ativas do user
     d) Se slots < max_users → gera QR code
     e) Se slots >= max_users → retorna erro "limite atingido"
   → Escaneamento cria whatsapp_session com instance_name único

5. Para conexões ADICIONAIS (Equipe/Empresa):
   → Mesma página /conectar (com o code do dono)
   → Cada scan cria nova session com instance_name diferente
   → UI mostra: "2 de 3 conexões usadas"
```

---

#### Mudanças no Banco de Dados (migration necessária)

```sql
-- 1. Vincular código ao comprador
ALTER TABLE activation_codes ADD COLUMN user_email TEXT;
ALTER TABLE activation_codes ADD COLUMN user_id UUID REFERENCES users(id);

-- 2. Permitir user sem phone inicialmente (criado no pagamento)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
-- Re-adicionar UNIQUE mas permitindo NULL
CREATE UNIQUE INDEX idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;

-- 3. Adicionar email como identificador alternativo
CREATE UNIQUE INDEX idx_users_email_unique ON users(email) WHERE email IS NOT NULL;
```

---

#### Mudanças no Backend

| Arquivo | O que muda |
|---------|------------|
| `payment.service.ts` | Criar user no banco ao processar pagamento (email + plan). Vincular user_id ao activation_code. |
| `activation.service.ts` | `activateUser()` busca user existente pelo code.user_id em vez de criar novo. Complementa com phone/name/business. |
| `activation.repository.ts` | `createCode()` aceita `userEmail` e `userId`. Nova query `findCodeByUserEmail()`. |
| `activation.controller.ts` | Endpoint QR code valida ownership + verifica slots disponíveis. |
| `subscription.service.ts` | `activate()` usa user_id direto (user já existe), não precisa buscar por email. |
| `plans.service.ts` | Expor `getRemainingSlots(userId)` para UI mostrar "X de Y conexões". |
| `onboarding.service.ts` | Sem mudança funcional — recebe userId que já existe. |

---

#### Mudanças no Frontend

| Arquivo | O que muda |
|---------|------------|
| `/conectar/use-qr-connection.ts` | Exibir slots usados/disponíveis. Botão "Conectar outro WhatsApp" quando slots > 1. |
| `/conectar/conectar-content.tsx` | Mostrar contador de conexões. Mensagem de erro clara quando limite atingido. |
| `/ativacao/activation-content.tsx` | Sem mudança grande — continua fazendo polling do status. |

---

#### Decisões de Negócio a Definir Antes de Implementar

| # | Pergunta | Opções | Impacto |
|---|----------|--------|---------|
| 1 | Quem conecta WhatsApps adicionais? | A) Só o dono (mesmo QR, N dispositivos dele) / B) Dono convida colaboradores | Se B: precisa de sistema de convites |
| 2 | Como o dono se identifica ao adicionar conexão? | A) Mesmo código / B) Email + link mágico / C) Login com senha | Se A: mais simples. Se B/C: área do cliente |
| 3 | Adicionar conexão é via web ou WhatsApp? | A) Web (botão na tela /conectar) / B) Cleo ("quero conectar outro WhatsApp") | Se A: já resolve. Se B: nova intent |
| 4 | Expiração com N conexões: | A) Desconecta todas / B) Mantém 1 (downgrade) / C) Carência de 7 dias | Afeta cron de expiração |
| 5 | Transferência de plano entre devices: | A) Não permite / B) Permite desconectar um e conectar outro | Se B: endpoint de "desconectar slot" |

---

#### Critérios de Aceite

- [ ] Pagamento processado → user existe no banco com email + plano + subscription ativa
- [ ] Activation code vinculado ao user_id e user_email (intransferível)
- [ ] Ativação via WhatsApp complementa user existente (não cria novo)
- [ ] Endpoint de QR code valida que código pertence ao user correto
- [ ] Endpoint de QR code verifica slots: `active_sessions < plan.max_users`
- [ ] Solo: 1 conexão permitida, erro claro ao tentar segunda
- [ ] Equipe: até 3 conexões, UI mostra "2 de 3 usadas"
- [ ] Empresa: até 8 conexões
- [ ] Tentativa acima do limite → erro "Limite de conexões atingido. Faça upgrade."
- [ ] Downgrade desconecta sessões excedentes (comportamento definido)
- [ ] Código usado por email diferente → rejeição

---

#### Riscos

- Quebra de compatibilidade com users já ativados (migration de dados existentes)
- Se users.phone passa a ser NULL, queries que fazem `.eq('phone', ...)` podem precisar de ajuste
- Onboarding precisa lidar com user "incompleto" (sem phone) de forma graceful
- Testes existentes de activation podem quebrar

---

#### Referências

- Detalhamento completo: `docs/debito-tecnico/reestruturacao-fluxo-ativacao-multiusuario.md`
- Schema atual: `backend/supabase/migrations/20260525000001_initial_schema.sql`
- Payment tables: `backend/supabase/migrations/20260526000001_payment_tables.sql`

---

### 22. Deploy no servidor (VPS limpa com Docker)

**Status:** Código pronto. Nunca rodou em produção.

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
| 8 | Build e subir containers | `docker compose -f docker-compose.prod.yml up -d --build` |
| 9 | Mercado Pago produção | Trocar `TEST-xxx` por token real, configurar webhook apontando pra URL pública |
| 10 | Conectar WhatsApp | Acessar Evolution API (porta 8080 interna) → criar instância → escanear QR com chip novo |
| 11 | Teste end-to-end | Pagamento real (R$1) → código → ativação → onboarding → resposta automática |

**Observações:**
- O compose de produção sobe TUDO (backend, frontend, Redis, Evolution API, Postgres) — VPS limpa, sem dependência do provider
- Se funciona local com `docker compose up`, funciona no servidor com o compose de prod
- Único passo manual: escanear QR Code para conectar o WhatsApp da Cleo

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

## ⚪ FUTURO — FLUXOS AVANÇADOS

### 15. Serviço de E-mail
- WhatsApp para notificações. E-mail só se necessário depois.

### 23. Dashboard web
- Visualização de leads, métricas, upload de materiais via web.

### 24. Envio em massa de materiais

**Cenário:** Professor diz "manda a aula 3 pra todos os alunos" ou "avisa a turma que a prova é segunda".

**O que falta:**
- Suporte a envio para múltiplos contatos (por nome, tag, ou "todos")
- Selecionar qual material enviar (listar materiais salvos)
- Anexar mensagem personalizada junto com o forward
- Rate limiting inteligente (WhatsApp bane se mandar muitas msgs rápido — espaçar 1-2s entre envios)
- Confirmação antes de disparar ("Enviar pra 10 contatos. Confirma?")

**Exemplos de uso:**
- "manda o PDF da aula 3 pra turma toda"
- "avisa todos que não tem aula amanhã"
- "manda o orçamento pro João e pro Carlos"

**Estimativa:** 2-3 dias

---

### 25. Tags/Grupos de contatos

**Cenário:** Corretor quer separar "compradores" de "vendedores". Professor quer "turma A" e "turma B".

**O que falta:**
- Criar tags (via WhatsApp: "cria tag turma-A")
- Associar leads a tags ("marca João como turma-A")
- Listar leads por tag ("quem é da turma-A?")
- Enviar material/mensagem pra tag inteira ("manda pra turma-A")

**Exemplos de uso:**
- "cria grupo VIP"
- "adiciona Maria no grupo VIP"
- "manda promoção pro grupo VIP"
- "quem é do grupo compradores?"

**Estimativa:** 2 dias

---

### 26. Agendamento de mensagens

**Cenário:** Corretor quer mandar "bom dia" todo dia pra clientes quentes. Professor quer lembrete da prova na véspera.

**O que falta:**
- Agendar envio futuro ("manda pro João amanhã às 9h")
- Mensagens recorrentes ("todo dia às 8h manda bom dia pros clientes quentes")
- Cancelar agendamentos ("cancela o lembrete do João")
- Cron dedicado para disparar mensagens agendadas

**Exemplos de uso:**
- "lembra o João da reunião amanhã às 14h"
- "manda mensagem de aniversário pro Carlos dia 15"
- "toda segunda às 8h manda 'boa semana' pra turma"

**Estimativa:** 2 dias

---

### 27. Respostas automáticas com IA contextual

**Cenário:** Cliente do corretor pergunta "quanto custa o apartamento da rua X?" e a Cleo responde automaticamente com base em dados do negócio.

**O que falta:**
- Base de conhecimento por usuário (FAQ, preços, catálogo)
- Cleo responde perguntas frequentes automaticamente
- Escalonamento: se não souber responder, avisa o dono
- Configurável: "responde automático" vs "só registra e me avisa"

**Exemplos de uso:**
- Aluno: "que horas é a aula?" → Cleo: "Terça e quinta, 19h às 21h"
- Cliente: "vocês atendem domingo?" → Cleo: "Nosso horário é seg-sáb, 8h-18h"
- Lead novo: "quanto custa?" → Cleo: "O plano básico é R$49/mês. Quer mais detalhes?"

**Estimativa:** 3-4 dias

---

### 28. Métricas e relatórios via WhatsApp

**Cenário:** Dono do negócio quer saber "como foi meu mês" sem abrir painel.

**O que falta:**
- Resumo diário/semanal automático (opt-in)
- "Como foi meu mês?" → Cleo manda relatório no WhatsApp
- Métricas: leads novos, convertidos, perdidos, tempo médio de resposta
- Comparativo com período anterior

**Exemplos de uso:**
- "resumo da semana" → "7 leads novos, 3 convertidos, 2 sem resposta"
- "quantos clientes peguei esse mês?" → "23 novos, 5 quentes, 2 fechados"
- Relatório automático toda sexta às 18h

**Estimativa:** 2 dias

---

### 29. Catálogo de materiais organizados

**Cenário:** Professor tem 20 aulas em PDF e quer mandar a específica ("manda a aula 5 pro João"), não só a última.

**O que falta:**
- Nomear materiais ao enviar ("isso é a aula 5")
- Listar materiais salvos ("quais materiais eu tenho?")
- Buscar por nome ("manda a aula sobre integrais pro João")
- Deletar material antigo ("apaga a aula 2")

**Exemplos de uso:**
- Manda PDF → Cleo: "Recebi! Quer dar um nome? (ex: 'aula 5')"
- "quais materiais tenho?" → lista com nomes
- "manda o contrato padrão pro Carlos"

**Estimativa:** 1-2 dias

---

### 30. Guia de comandos + intent "ajuda"

**Cenário:** Usuário ativa a Cleo mas não sabe tudo que ela faz. Precisa de um "manual rápido" + acesso a qualquer momento.

**O que falta:**
- Mensagem de boas-vindas ao final do onboarding com lista de capacidades
- Intent "ajuda"/"help"/"o que você faz?" que relista a qualquer momento
- Resposta inteligente quando confiança entre 50-70%: "Você quis dizer X?" em vez de erro genérico
- Atualizar a mensagem conforme novas features forem adicionadas

**Comportamento esperado:**
1. Onboarding termina → Cleo envia guia com exemplos práticos
2. Usuário diz "ajuda" → Cleo mostra o mesmo guia
3. Cleo não entende (confiança < 70%) → sugere a ação mais provável + mostra opções

**Estimativa:** 0.5 dia

---

## Resumo

| Status | Itens |
|--------|-------|
| ✅ Concluídos | #1-11, #13, #17, #18, #20, #21 |
| 🔴 Bloqueante | #31 (reestruturação ativação multi-user), #22 (deploy) |
| 🟡 Pós-lançamento | #12, #14, #16, #19 |
| ⚪ Futuro | #15, #23-30 |

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


---

### 31. Reestruturação do Fluxo de Ativação e Suporte Multi-Usuário

**Prioridade:** Alta (pré-requisito para planos Equipe/Empresa funcionarem corretamente)

**Contexto:** O fluxo atual cria o `user` no banco apenas durante o onboarding via WhatsApp. O código de ativação não é vinculado ao comprador (email), tornando-o transferível. Planos multi-conta (Equipe=3, Empresa=8) não têm mecanismo para gerar múltiplas conexões WhatsApp de forma controlada.

**Problemas:**
1. User criado no momento errado (onboarding, não pagamento)
2. Código de ativação sem vínculo ao email do comprador (transferível)
3. Sem conceito de "dono do plano" vs "slots de conexão"
4. Endpoint de QR code não valida ownership nem verifica slots disponíveis

**Decisões de negócio pendentes:**
- Quem conecta WhatsApps adicionais? (dono vs colaboradores convidados)
- Autenticação do dono: email+código (stateless) vs login (stateful)?
- Adicionar conexões via interface web ou via Cleo?
- Comportamento ao expirar assinatura com N conexões ativas?

**Impacto:** Módulos activation, payment, plans, subscription, onboarding, frontend /conectar

**Detalhamento completo:** `docs/debito-tecnico/reestruturacao-fluxo-ativacao-multiusuario.md`

**Estimativa:** 3-5 dias (após decisões de negócio definidas)
