#!/bin/bash
# ===========================================
# Hi Cleo — Testes E2E de Qualidade via Docker
# ===========================================
# Uso: ./tests/e2e-quality/run-e2e.sh
#
# Pré-requisitos:
#   - Docker Compose rodando (docker compose up -d)
#   - Ollama rodando localmente (ollama serve)
#   - WhatsApp conectado na Evolution API
#
# O script verifica tudo antes de executar.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_DIR"

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
timeout 60 bash -c 'until docker compose ps --format "{{.Status}}" backend 2>/dev/null | grep -q "healthy"; do sleep 2; done' || {
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

echo ""
echo "🚀 Executando testes E2E..."
echo ""

# Roda o container de teste (build + run + remove ao terminar)
docker compose --profile e2e run --rm --build e2e-quality
