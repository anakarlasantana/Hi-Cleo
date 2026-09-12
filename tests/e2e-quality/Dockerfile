# ===========================================
# Hi Cleo — Testes E2E de Qualidade
# ===========================================
# Container para rodar os testes E2E com IA (personas + judge).
# Usa network_mode: host para acessar Ollama, Backend e PostgreSQL
# na máquina local sem configuração extra de rede.
#
# Build context: raiz do projeto (para acessar backend/package.json e docs/).
# Ativação: docker compose --profile e2e run --rm e2e-quality

FROM node:22-alpine

WORKDIR /app

# Instala dependências do backend (pg, axios, groq-sdk, tsx, etc.)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci && npm cache clean --force

# Copia código dos testes
COPY tests/e2e-quality/ ./tests/e2e-quality/

# Copia docs que a IA lê para avaliar respostas
COPY docs/produto/ ./docs/produto/
COPY docs/tecnico/arquitetura-ia.md ./docs/tecnico/arquitetura-ia.md

# NODE_PATH permite imports de módulos do backend (pg, axios, etc.)
ENV NODE_PATH=/app/backend/node_modules

WORKDIR /app/backend

# ENTRYPOINT fixo: args passados via `docker compose run e2e-quality <args>`
# são anexados a este comando (CMD vira só o default).
# Sem entrypoint, o override do CMD virava `node --single` → "bad option".
ENTRYPOINT ["./node_modules/.bin/tsx", "../tests/e2e-quality/run.ts"]
CMD ["--no-pause"]
