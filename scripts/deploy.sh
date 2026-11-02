#!/bin/bash
# ===========================================
# Hi Cleo — Deploy de produção (VPS)
# ===========================================
# Uso:
#   bash scripts/deploy.sh              # atualiza código e sobe tudo
#   bash scripts/deploy.sh --no-pull    # sem git pull (deploy do que está no disco)
#   bash scripts/deploy.sh --logs       # acompanha os logs ao final
#
# O que faz (idempotente):
#  1. Confere pré-requisitos (.env, certificados, docker)
#  2. git pull (ff-only) — aborta se houver conflito/diff local
#  3. build das imagens (backend inclui migrations/seeds; frontend inlina NEXT_PUBLIC_*)
#  4. docker compose up -d (o serviço `migrate` roda e o backend só sobe se ela passar)
#  5. espera /health e mostra o resumo; limpa imagens antigas

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="${HEALTH_URL:-http://localhost:3001/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"
DO_PULL=1
SHOW_LOGS=0

for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    --logs) SHOW_LOGS=1 ;;
    *) echo "❌ argumento desconhecido: $arg"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

log()  { echo -e "\n\033[1;32m$*\033[0m"; }
fail() { echo -e "\n\033[1;31m❌ $*\033[0m"; exit 1; }

# --- 1. Pré-requisitos ----------------------------------------------------
log "1/5 Pré-requisitos"
[ -f .env ] || fail ".env não encontrado. Use: cp .env.production.example .env"
grep -q '^NODE_ENV=production' .env || echo "  ⚠️  NODE_ENV não é 'production' no .env (o compose força, mas revise)"
grep -qE '^NEXT_PUBLIC_API_URL=https://' .env || echo "  ⚠️  NEXT_PUBLIC_API_URL ausente/sem https — o frontend vai embutir localhost no build"
grep -qE '^CORS_ORIGIN=https://' .env || echo "  ⚠️  CORS_ORIGIN ausente/sem domínio — o navegador pode bloquear a API"
[ -f nginx/ssl/fullchain.pem ] || echo "  ⚠️  nginx/ssl/fullchain.pem ausente (TLS não sobe)"
[ -f nginx/ssl/privkey.pem ]   || echo "  ⚠️  nginx/ssl/privkey.pem ausente (TLS não sobe)"
command -v docker >/dev/null || fail "Docker não instalado (rode scripts/oracle-bootstrap.sh)"
docker compose version >/dev/null 2>&1 || fail "'docker compose' (v2) não encontrado"
echo "  ✅ pré-requisitos verificados"

# --- 2. Código ------------------------------------------------------------
if [ "$DO_PULL" -eq 1 ]; then
  log "2/5 Atualizando código (git pull --ff-only)"
  if [ -n "$(git status --porcelain)" ]; then
    fail "há alterações locais no servidor. Guarde/descarte antes de atualizar (ou use --no-pull)"
  fi
  git pull --ff-only
else
  log "2/5 git pull ignorado (--no-pull)"
fi
echo "  commit: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# --- 3. Build -------------------------------------------------------------
log "3/5 Build das imagens (backend: migrations/seeds · frontend: NEXT_PUBLIC_*)"
docker compose -f "$COMPOSE_FILE" build backend frontend migrate

# --- 4. Subir -------------------------------------------------------------
log "4/5 Subindo serviços (migrate → backend → frontend → nginx)"
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# --- 5. Healthcheck -------------------------------------------------------
log "5/5 Aguardando ${HEALTH_URL} (até ${HEALTH_TIMEOUT}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    docker compose -f "$COMPOSE_FILE" logs --tail=40 backend migrate
    fail "backend não ficou saudável em ${HEALTH_TIMEOUT}s"
  fi
  sleep 3
done

echo ""
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo "🌱 Migrations/seeds (última execução):"
docker compose -f "$COMPOSE_FILE" logs --tail=6 migrate 2>/dev/null | sed 's/^/   /'

docker image prune -f >/dev/null 2>&1 || true

log "Deploy concluído ✅  ($(git rev-parse --short HEAD))"

if [ "$SHOW_LOGS" -eq 1 ]; then
  docker compose -f "$COMPOSE_FILE" logs -f backend
fi
