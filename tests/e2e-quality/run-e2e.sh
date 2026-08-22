#!/bin/bash
# ===========================================
# Hi Cleo — Testes E2E de Qualidade via Docker
# ===========================================
# Uso: ./tests/e2e-quality/run-e2e.sh [args...]
#   Exemplo: ./tests/e2e-quality/run-e2e.sh --single onboarding
#
# Como funciona (SEM depender do WhatsApp real):
# 1. O teste simula webhooks de entrada diretamente no backend (mesmo payload da Evolution API)
# 2. O backend processa normalmente (fila, IA, regras, classificação)
# 3. A resposta é persistida no banco ANTES de tentar enviar via WhatsApp
# 4. O teste lê a resposta do banco
# 5. Se a Evolution API estiver offline, o envio falha mas a resposta já foi salva
#
# Pré-requisitos:
#   - Docker Compose rodando (docker compose up -d)
#   - Ollama rodando localmente (ollama serve)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_DIR"

# Detectar docker socket
DOCKER_CMD="docker"
if ! docker info > /dev/null 2>&1; then
  if DOCKER_HOST=unix:///var/run/docker.sock docker info > /dev/null 2>&1; then
    export DOCKER_HOST=unix:///var/run/docker.sock
  else
    echo "❌ Docker não está acessível"
    exit 1
  fi
fi

echo "━━━ Hi Cleo — Testes E2E de Qualidade ━━━"
echo ""

# Verifica se os serviços base estão rodando
if ! docker compose ps --format "{{.Name}}" 2>/dev/null | grep -q "hicleo-backend"; then
  echo "⚠️  Backend não está rodando. Subindo serviços..."
  docker compose up --build -d
  echo "⏳ Aguardando serviços ficarem saudáveis..."
  sleep 10
fi

# Verifica se o backend está saudável
echo "🔍 Verificando saúde do backend..."
timeout 60 bash -c 'until curl -sf http://localhost:3001/health > /dev/null 2>&1; do sleep 2; done' || {
  echo "❌ Backend não ficou saudável em 60s. Verifique os logs:"
  echo "   docker compose logs backend"
  exit 1
}
echo "✅ Backend saudável"

# Verifica se o Ollama está acessível
echo "🔍 Verificando Ollama..."
if ! curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
  echo "❌ Ollama não está rodando em localhost:11434"
  echo "   Inicie com: ollama serve"
  exit 1
fi
echo "✅ Ollama acessível"

# Verifica se a Evolution API está conectada (informativo, não bloqueia)
echo "🔍 Verificando Evolution API..."
if curl -sf http://localhost:8082/ > /dev/null 2>&1; then
  echo "✅ Evolution API acessível (mensagens serão entregues via WhatsApp)"
else
  echo "⚠️  Evolution API offline (teste funciona normalmente — respostas são salvas no banco)"
fi

echo ""
echo "🚀 Executando testes E2E..."
echo ""

# Roda o container de teste (build + run + remove ao terminar)
docker compose --profile e2e run --rm --build e2e-quality "$@"
