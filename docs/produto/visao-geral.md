# Visão Geral do Produto — Hi Cleo

## O que é

Secretária virtual de WhatsApp para pequenos negócios (corretores, clínicas, professores, lojas, personal trainers).

O diferencial: **não existe dashboard principal** — tudo é feito dentro do WhatsApp.
O dono conversa com a Cleo e ela organiza tudo.

---

## Problema que resolve

Pequenos negócios usam WhatsApp como ferramenta principal de vendas, mas:

- Perdem clientes por falta de follow-up
- Esquecem de responder mensagens antigas
- Não organizam leads
- Não sabem quem está quente ou frio

**Resultado:** perda de dinheiro por desorganização, não por falta de leads.

---

## Solução

O WhatsApp do próprio dono vira o "painel de gestão". Ele conversa com a Cleo e pede o que precisa:

- "quais são meus leads de hoje?"
- "quem está sem resposta?"
- "manda material para o João"
- "agenda retorno para amanhã"

Enquanto isso, a Cleo atende os clientes do dono automaticamente — com a personalidade e tom configurados no onboarding.

---

## Funcionalidades Core

| Funcionalidade | Como funciona |
|----------------|---------------|
| Captura automática de leads | Toda nova conversa no WhatsApp do dono cria um lead |
| Respostas automáticas com IA | Cleo responde clientes no tom do dono, sem inventar dados |
| Follow-up automático | Alerta o dono quando cliente não recebe resposta há X dias |
| Comandos por linguagem natural | Dono pede qualquer coisa por texto ou áudio |
| Onboarding conversacional | 5 perguntas pelo WhatsApp = Cleo configurada pro negócio |
| Multi-user (planos Equipe/Empresa) | Dono convida colaboradores para conectar mais WhatsApps |

---

## Público-alvo

- Profissionais autônomos e MEIs
- Pequenas empresas (1-8 pessoas)
- Que usam WhatsApp como canal principal de vendas/atendimento
- Que não querem (ou não sabem usar) CRMs complexos

---

## Modelo de negócio

| Plano | Conexões | Preço |
|-------|----------|-------|
| Solo | 1 WhatsApp | R$89,90/mês |
| Equipe | Até 3 | R$239,90/mês |
| Empresa | Até 8 | R$629,90/mês |

---

## Stack técnica

- **Backend:** Node.js 22 + TypeScript (Express, Hexagonal Architecture)
- **Frontend:** Next.js 16 + Tailwind + Radix UI
- **Banco:** PostgreSQL 16 (self-hosted via Docker) + Drizzle ORM
- **WhatsApp:** Evolution API / Evolution Go (open-source, Baileys)
- **IA:** DeepSeek (primário) → Groq (fallback) → Gemini (último recurso)
- **Fila:** BullMQ + Redis
- **Pagamento:** Mercado Pago (PIX + cartão)
- **Testes:** Vitest
- **Monitoramento:** Sentry + Pino logger
- **Deploy:** Docker Compose em VPS

---

## Fluxo do sistema

```
WhatsApp → Evolution API → Webhook → Fila (BullMQ) → Worker
                                                        │
                              ┌──────────────────────────┼──────────────────┐
                              ▼                          ▼                  ▼
                         Secretária                 Cliente novo        Follow-up
                        (comandos dono)            (IA responde)       (cron alerta)
                              │                          │                  │
                              ▼                          ▼                  ▼
                        DeepSeek/Groq/          DeepSeek/Groq/         Notificação
                        Gemini (fallback)       Gemini + perfil             │
                              │                          │                  │
                              └──────────────────────────┼──────────────────┘
                                                         ▼
                                                  Evolution API → WhatsApp
```
