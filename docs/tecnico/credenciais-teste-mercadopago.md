# Credenciais de Teste — Mercado Pago (Sandbox)

Referência de dados de teste para usar nos testes E2E do checkout.

> **Importante:** O Access Token de teste começa com prefixo `APP_USR` e é configurado em `MERCADO_PAGO_ACCESS_TOKEN` no `.env`. As credenciais de teste são geradas automaticamente ao criar a aplicação no painel MP.

---

## Regras do Sandbox

- E-mails de comprador **devem** terminar em `@testuser.com` (ex: `test_user_123@testuser.com`)
- O comprador (buyer) e o vendedor (seller) **não podem** ser a mesma conta de teste
- Test users são criados no painel: https://www.mercadopago.com.br/developers/panel/app → Test accounts
- Cada aplicação pode ter até 15 test users

---

## Dados para Teste no Checkout

### PIX

| Campo | Valor para teste |
|-------|-----------------|
| Nome | `João Teste` |
| E-mail | `test_user_123@testuser.com` |
| WhatsApp | `(48) 99999-0001` |

> **Nota:** Para PIX funcionar no sandbox, o buyer test user deve ser diferente do seller (aplicação). Criar um buyer test user no painel MP se o erro `invalid_users_involved` persistir.

### Cartão de Crédito (Aprovado)

| Campo | Valor |
|-------|-------|
| Número do cartão | `5480 8328 0103 3311` (Mastercard) |
| Validade | `11/30` |
| CVV | `123` |
| Nome no cartão | `APRO` |
| CPF do titular | `12345678909` |

### Cartão de Crédito (Rejeitado)

| Campo | Valor |
|-------|-------|
| Número do cartão | `4235 6477 2802 5682` (Visa) |
| Validade | `11/30` |
| CVV | `123` |
| Nome no cartão | `OTHE` |
| CPF do titular | `12345678909` |

---

## Cartões de Teste Disponíveis

| Bandeira | Número | CVV | Validade |
|----------|--------|-----|----------|
| Mastercard (crédito) | `5480 8328 0103 3311` | `123` | `11/30` |
| Visa (crédito) | `4235 6477 2802 5682` | `123` | `11/30` |
| American Express (crédito) | `3753 651535 56885` | `1234` | `11/30` |
| Elo (débito) | `5067 7667 8388 8311` | `123` | `11/30` |

---

## Cenários de Pagamento (Nome no Cartão)

O **nome do titular** controla o resultado do pagamento no sandbox:

| Resultado | Nome no cartão | CPF |
|-----------|---------------|-----|
| ✅ Aprovado | `APRO` | `12345678909` |
| ❌ Recusado (erro geral) | `OTHE` | `12345678909` |
| ⏳ Pendente | `CONT` | qualquer |
| ❌ Saldo insuficiente | `FUND` | qualquer |
| ❌ CVV inválido | `SECU` | qualquer |
| ❌ Cartão expirado | `EXPI` | qualquer |
| ❌ Erro no formulário | `FORM` | qualquer |
| ❌ Pagamento duplicado | `DUPL` | qualquer |
| ❌ Cartão bloqueado | `LOCK` | qualquer |

---

## Fluxo Completo de Teste E2E (Cartão Aprovado)

1. Navegar para `/checkout?plan=solo&billing=monthly`
2. Preencher:
   - Nome: `João Teste`
   - E-mail: `test_user_123@testuser.com`
   - WhatsApp: `(48) 99999-0001`
3. Selecionar **Cartão**
4. Preencher cartão:
   - Número: `5480 8328 0103 3311`
   - Validade: `11/30`
   - CVV: `123`
   - Nome no cartão: `APRO`
   - CPF: `123.456.789-09`
5. Clicar **Pagar agora**
6. Esperar redirecionamento para `/ativacao?code=XXXX`

---

## Referência

- Documentação oficial: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-cards
- Test accounts: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-accounts
- Painel de aplicações: https://www.mercadopago.com.br/developers/panel/app
