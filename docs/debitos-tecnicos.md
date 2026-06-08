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
| 🔴 Bloqueante | #22 (deploy) |
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
