# Teste E2E via Webhook Simulado

Guia para testar o fluxo completo **Trial → Ativação → Onboarding** sem precisar de WhatsApp real.

---

## Pré-requisitos

- Docker Compose rodando (`docker compose up --build`)
- Pelo menos uma chave de IA configurada no `.env` (DEEPSEEK_API_KEY, GROQ_API_KEY ou GEMINI_API_KEY)
- Backend respondendo em `http://localhost:3001/health`

---

## Como funciona

O fluxo real é:
```
Frontend → POST /api/trial/start → código ATIVAR-XXXX
Usuário → WhatsApp → Evolution API → POST /webhooks/evolution → backend processa
```

No teste simulado, substituímos o WhatsApp por chamadas HTTP diretas ao webhook:
```
curl → POST /api/trial/start → código ATIVAR-XXXX
curl → POST /webhooks/evolution (simula mensagem) → backend processa
Banco → SELECT respostas da Cleo (tabela messages + onboarding_states)
```

As respostas da Cleo são enviadas via `messaging.sendText()` para a Evolution API. Como não há WhatsApp real conectado, a mensagem falha com 400 — **mas o processamento interno acontece corretamente** e podemos verificar pelo banco.

---

## Passo a Passo

### 1. Iniciar Trial (gera código de ativação)

```bash
curl -s -X POST http://localhost:3001/api/trial/start \
  -H "Content-Type: application/json" \
  -d '{"name": "Teste E2E", "phone": "5548999887766"}' | jq .
```

**Resposta esperada:**
```json
{
  "activationCode": "ATIVAR-XXXX",
  "message": "Trial iniciado! Envie o código para a Cleo no WhatsApp."
}
```

> Anote o `activationCode` retornado.

---

### 2. Simular envio do código de ativação via webhook

Substitua `ATIVAR-XXXX` pelo código real do passo anterior.
O `instance` deve ser igual ao `MONITOR_INSTANCE` do `.env` (default: `secretary`).

```bash
curl -s -X POST http://localhost:3001/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "instance": "secretary",
    "event": "messages.upsert",
    "data": {
      "key": {
        "remoteJid": "5548999887766@s.whatsapp.net",
        "fromMe": false,
        "id": "test-msg-001"
      },
      "message": {
        "conversation": "ATIVAR-XXXX"
      },
      "messageTimestamp": 1723728000,
      "pushName": "Teste E2E"
    }
  }'
```

**Esperado:** Retorna `{"received": true}` imediatamente (processamento assíncrono).

**O que acontece internamente:**
- Código validado → usuário complementado com telefone
- Onboarding criado no step `awaiting_intro_confirmation`
- Cleo tenta enviar mensagem de intro (falha 400 sem WhatsApp real, mas o estado é salvo)

---

### 3. Verificar estado no banco

```bash
# Conectar no banco (porta 5434 no host)
docker exec -it hicleo-app-db psql -U hicleo -d hicleo

# Ver o onboarding state
SELECT step, data FROM onboarding_states
JOIN users ON users.id = onboarding_states.user_id
WHERE users.phone = '5548999887766';

# Ver mensagens trocadas (se alguma foi salva)
SELECT text, direction, timestamp FROM messages
JOIN leads ON leads.id = messages.lead_id
ORDER BY timestamp DESC LIMIT 10;
```

---

### 4. Simular respostas do onboarding (step a step)

Cada mensagem avança o onboarding. Envie na ordem:

```bash
# Função auxiliar para enviar mensagem simulada
send_msg() {
  local MSG_ID="test-msg-$(date +%s)"
  curl -s -X POST http://localhost:3001/webhooks/evolution \
    -H "Content-Type: application/json" \
    -d "{
      \"instance\": \"secretary\",
      \"event\": \"messages.upsert\",
      \"data\": {
        \"key\": {
          \"remoteJid\": \"5548999887766@s.whatsapp.net\",
          \"fromMe\": false,
          \"id\": \"$MSG_ID\"
        },
        \"message\": {
          \"conversation\": \"$1\"
        },
        \"messageTimestamp\": $(date +%s),
        \"pushName\": \"Teste E2E\"
      }
    }"
  echo ""
  sleep 3  # Aguarda processamento (IA + BullMQ)
}
```

**Sequência de mensagens:**

| # | Comando | Step que avança |
|---|---------|-----------------|
| 1 | `send_msg "Vamos lá!"` | awaiting_intro_confirmation → confirm_name |
| 2 | `send_msg "Pedro Silva"` | confirm_name → business_type |
| 3 | `send_msg "Corretor de imóveis, vendo apartamentos e casas"` | business_type → target_audience |
| 4 | `send_msg "Casais jovens e famílias buscando primeiro imóvel"` | target_audience → tone_of_voice |
| 5 | `send_msg "2"` (descontraído mas profissional) | tone_of_voice → business_hours |
| 6 | `send_msg "Seg a sex, 9h às 18h"` | business_hours → outside_hours_behavior |
| 7 | `send_msg "1"` (avisa que retorna) | outside_hours_behavior → confirm_summary |
| 8 | `send_msg "ok, tudo certo"` | confirm_summary → completed |

---

### 5. Verificar resultado final

```sql
-- Onboarding deve estar em 'completed'
SELECT step, data FROM onboarding_states
JOIN users ON users.id = onboarding_states.user_id
WHERE users.phone = '5548999887766';

-- Business profile salvo
SELECT name, services, target_audience, tone_of_voice,
       business_hours_start, business_hours_end, business_days
FROM businesses
JOIN users ON users.id = businesses.user_id
WHERE users.phone = '5548999887766';
```

---

## Verificação de respostas da Cleo (logs)

Como o `messaging.sendText()` falha sem WhatsApp real, as respostas da Cleo ficam nos **logs do backend**:

```bash
docker compose logs -f backend 2>&1 | grep -A2 "mensagem processada"
```

Ou acompanhe em tempo real com:
```bash
docker compose logs -f backend
```

Toda resposta gerada pela IA aparece nos logs antes de tentar enviar.

---

## Troubleshooting

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| 429 no trial/start | Rate limit por IP (3 trials/24h) | Trocar o telefone ou esperar 24h |
| 409 no trial/start | Telefone já usado nos últimos 90 dias | Usar outro número fictício |
| Webhook retorna 401 | `EVOLUTION_WEBHOOK_SECRET` configurado mas não enviado no header | Adicionar `x-webhook-secret` no curl ou remover a var do .env |
| Onboarding não avança | IA não conseguiu interpretar a resposta | Verificar logs para erros de IA. Checar se chave está válida |
| Step pula para completed | IA interpretou resposta como contendo múltiplas informações | Normal em alguns casos — verificar dados salvos |

---

## Script completo automatizado

Para rodar o teste inteiro de uma vez:

```bash
#!/bin/bash
# test-e2e-onboarding.sh
# Uso: ./test-e2e-onboarding.sh

set -e
BASE_URL="http://localhost:3001"
PHONE="5548999887766"
INSTANCE="secretary"

echo "=== 1. Iniciando Trial ==="
RESULT=$(curl -s -X POST "$BASE_URL/api/trial/start" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Teste E2E\", \"phone\": \"$PHONE\"}")

CODE=$(echo "$RESULT" | grep -o 'ATIVAR-[A-Z0-9]\{4\}')
if [ -z "$CODE" ]; then
  echo "❌ Falha ao obter código: $RESULT"
  exit 1
fi
echo "✅ Código gerado: $CODE"

send_msg() {
  local MSG="$1"
  local MSG_ID="test-$(date +%s%N | cut -c1-13)"
  curl -s -X POST "$BASE_URL/webhooks/evolution" \
    -H "Content-Type: application/json" \
    -d "{
      \"instance\": \"$INSTANCE\",
      \"event\": \"messages.upsert\",
      \"data\": {
        \"key\": {
          \"remoteJid\": \"${PHONE}@s.whatsapp.net\",
          \"fromMe\": false,
          \"id\": \"$MSG_ID\"
        },
        \"message\": { \"conversation\": \"$MSG\" },
        \"messageTimestamp\": $(date +%s),
        \"pushName\": \"Teste E2E\"
      }
    }" > /dev/null
  echo "  → Enviado: \"$MSG\""
  sleep 4
}

echo ""
echo "=== 2. Enviando código de ativação ==="
send_msg "$CODE"

echo ""
echo "=== 3. Onboarding ==="
send_msg "Vamos lá!"
send_msg "Pedro Silva"
send_msg "Corretor de imóveis, vendo apartamentos e casas"
send_msg "Casais jovens e famílias buscando primeiro imóvel"
send_msg "2"
send_msg "Seg a sex, 9h às 18h"
send_msg "1"
send_msg "ok, tudo certo"

echo ""
echo "=== 4. Verificando resultado ==="
docker exec hicleo-app-db psql -U hicleo -d hicleo -t -c \
  "SELECT step FROM onboarding_states JOIN users ON users.id = onboarding_states.user_id WHERE users.phone = '$PHONE';" | tr -d ' '

STEP=$(docker exec hicleo-app-db psql -U hicleo -d hicleo -t -c \
  "SELECT step FROM onboarding_states JOIN users ON users.id = onboarding_states.user_id WHERE users.phone = '$PHONE';" | tr -d ' \n')

if [ "$STEP" = "completed" ]; then
  echo "✅ Onboarding COMPLETO!"
  echo ""
  echo "=== Business Profile ==="
  docker exec hicleo-app-db psql -U hicleo -d hicleo -c \
    "SELECT name, target_audience, tone_of_voice, business_hours_start, business_hours_end FROM businesses JOIN users ON users.id = businesses.user_id WHERE users.phone = '$PHONE';"
else
  echo "⚠️ Onboarding parou no step: $STEP"
  echo ""
  echo "=== Estado atual ==="
  docker exec hicleo-app-db psql -U hicleo -d hicleo -c \
    "SELECT step, data FROM onboarding_states JOIN users ON users.id = onboarding_states.user_id WHERE users.phone = '$PHONE';"
fi
```

Salve como `test-e2e-onboarding.sh` na raiz do projeto e rode com `bash test-e2e-onboarding.sh`.

---

## Limpeza após teste

Para repetir o teste com o mesmo telefone:

```sql
-- No psql (docker exec -it hicleo-app-db psql -U hicleo -d hicleo)
DELETE FROM businesses WHERE user_id IN (SELECT id FROM users WHERE phone = '5548999887766');
DELETE FROM onboarding_states WHERE user_id IN (SELECT id FROM users WHERE phone = '5548999887766');
DELETE FROM activation_codes WHERE user_id IN (SELECT id FROM users WHERE phone = '5548999887766');
DELETE FROM trial_attempts WHERE phone = '5548999887766';
DELETE FROM users WHERE phone = '5548999887766';
```
