#!/bin/bash
# test-e2e-onboarding.sh — Teste E2E do fluxo Trial → Ativação → Onboarding
# Simula o fluxo completo via webhook, sem precisar de WhatsApp real.
#
# Pré-requisitos:
#   - docker compose up --build (rodando)
#   - Backend em http://localhost:3001/health retornando 200
#   - Pelo menos uma chave de IA no .env (DEEPSEEK, GROQ ou GEMINI)
#
# Uso: bash test-e2e-onboarding.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
PHONE="${TEST_PHONE:-5548999887766}"
INSTANCE="${MONITOR_INSTANCE:-secretary}"
DELAY="${STEP_DELAY:-4}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "╔══════════════════════════════════════════════════╗"
echo "║   Hi Cleo — Teste E2E (Webhook Simulado)        ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Backend: $BASE_URL"
echo "║  Phone:   $PHONE"
echo "║  Instance: $INSTANCE"
echo "║  Delay:   ${DELAY}s entre mensagens"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Health check
echo "🔍 Verificando saúde do backend..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HEALTH" != "200" ]; then
  echo -e "${RED}❌ Backend não está saudável (HTTP $HEALTH). Rode 'docker compose up --build' primeiro.${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Backend saudável${NC}"
echo ""

# === 1. Iniciar Trial ===
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 PASSO 1: Iniciando trial..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

RESULT=$(curl -s -X POST "$BASE_URL/api/trial/start" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"Teste E2E\", \"phone\": \"$PHONE\"}")

CODE=$(echo "$RESULT" | grep -o 'ATIVAR-[A-Z0-9]\{4\}')
if [ -z "$CODE" ]; then
  echo -e "${RED}❌ Falha ao obter código.${NC}"
  echo "   Resposta: $RESULT"
  echo ""
  echo "   Possíveis causas:"
  echo "   - Telefone já usado (cooldown 90 dias)"
  echo "   - Rate limit por IP (3/24h)"
  echo "   - Banco indisponível"
  echo ""
  echo "   Para limpar e tentar de novo:"
  echo "   docker exec hicleo-app-db psql -U hicleo -d hicleo -c \"DELETE FROM trial_attempts WHERE phone = '$PHONE'; DELETE FROM users WHERE phone = '$PHONE';\""
  exit 1
fi
echo -e "${GREEN}✅ Código gerado: $CODE${NC}"
echo ""

# Função para enviar mensagem simulada
send_msg() {
  local MSG="$1"
  local STEP_NAME="$2"
  local MSG_ID="test-$(date +%s%N | cut -c1-13)"

  echo -n "  💬 [$STEP_NAME] Enviando: \"$MSG\" ... "

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/webhooks/evolution" \
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
    }")

  if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${YELLOW}HTTP $HTTP_CODE (pode ser normal se webhook secret configurado)${NC}"
  fi

  sleep "$DELAY"
}

# === 2. Ativação ===
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 PASSO 2: Enviando código de ativação..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
send_msg "$CODE" "ativação"
echo ""

# === 3. Onboarding ===
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎓 PASSO 3: Fluxo de onboarding..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
send_msg "Vamos lá!" "intro_confirmation"
send_msg "Pedro Silva" "confirm_name"
send_msg "Corretor de imóveis, vendo apartamentos e casas" "business_type"
send_msg "Casais jovens e famílias buscando primeiro imóvel" "target_audience"
send_msg "2" "tone_of_voice"
send_msg "Seg a sex, 9h às 18h" "business_hours"
send_msg "1" "outside_hours"
send_msg "ok, tudo certo" "confirm_summary"
echo ""

# === 4. Verificação ===
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔎 PASSO 4: Verificando resultado..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

STEP=$(docker exec hicleo-app-db psql -U hicleo -d hicleo -t -c \
  "SELECT step FROM onboarding_states JOIN users ON users.id = onboarding_states.user_id WHERE users.phone = '$PHONE';" 2>/dev/null | tr -d ' \n')

if [ "$STEP" = "completed" ]; then
  echo -e "${GREEN}✅ ONBOARDING COMPLETO!${NC}"
  echo ""
  echo "📊 Business Profile salvo:"
  docker exec hicleo-app-db psql -U hicleo -d hicleo -c \
    "SELECT name, target_audience, tone_of_voice, business_hours_start, business_hours_end, business_days FROM businesses JOIN users ON users.id = businesses.user_id WHERE users.phone = '$PHONE';" 2>/dev/null
elif [ -z "$STEP" ]; then
  echo -e "${RED}❌ Onboarding não encontrado no banco.${NC}"
  echo "   Verifique os logs: docker compose logs --tail=50 backend"
else
  echo -e "${YELLOW}⚠️ Onboarding parou no step: $STEP${NC}"
  echo ""
  echo "📋 Estado atual:"
  docker exec hicleo-app-db psql -U hicleo -d hicleo -c \
    "SELECT step, data FROM onboarding_states JOIN users ON users.id = onboarding_states.user_id WHERE users.phone = '$PHONE';" 2>/dev/null
  echo ""
  echo "💡 Dica: Verifique os logs para erros de IA:"
  echo "   docker compose logs --tail=30 backend | grep -i 'error\|falha\|failed'"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 Para limpar e repetir o teste:"
echo "   docker exec hicleo-app-db psql -U hicleo -d hicleo -c \\"
echo "     \"DELETE FROM businesses WHERE user_id IN (SELECT id FROM users WHERE phone = '$PHONE');"
echo "      DELETE FROM onboarding_states WHERE user_id IN (SELECT id FROM users WHERE phone = '$PHONE');"
echo "      DELETE FROM activation_codes WHERE user_id IN (SELECT id FROM users WHERE phone = '$PHONE');"
echo "      DELETE FROM trial_attempts WHERE phone = '$PHONE';"
echo "      DELETE FROM users WHERE phone = '$PHONE';\""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
