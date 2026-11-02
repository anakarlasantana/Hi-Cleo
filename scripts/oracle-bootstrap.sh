#!/bin/bash
# ===========================================
# Hi Cleo — Bootstrap da VPS (Oracle Cloud / qualquer Ubuntu 22.04+)
# ===========================================
# Idempotente: pode rodar mais de uma vez sem efeito colateral.
#
# Uso (root ou sudo):
#   sudo bash scripts/oracle-bootstrap.sh
#
# O que faz:
#  1. iptables 80/443  ← pegadinha do Oracle: as imagens vêm com REJECT ANTES
#     do UFW, então abrir na Security List + UFW não basta (site fica mudo).
#  2. Docker + compose plugin
#  3. Swap (2 GB) — segurança extra se o build do Next passar de 4 GB
#  4. UFW (22/80/443) + fail2ban
#  5. Diretório de deploy (/opt/hi-cleo/backups)

set -euo pipefail

SWAP_SIZE="${SWAP_SIZE:-2G}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/hi-cleo}"

log() { echo -e "\n\033[1;32m$*\033[0m"; }

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "❌ Rode como root: sudo bash $0"
    exit 1
  fi
}
need_root

# --- 1. iptables (Oracle) -------------------------------------------------
log "1/5 Liberando 80/443 no iptables (Oracle bloqueia antes do UFW)"
if command -v iptables >/dev/null 2>&1; then
  for port in 80 443; do
    # -C testa se a regra existe; se não existir, insere no topo (INPUT 1).
    if ! iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
      iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
      echo "  ✅ ACCEPT tcp/$port inserido"
    else
      echo "  ↷ ACCEPT tcp/$port já existia"
    fi
  done

  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save
  elif [ -d /etc/iptables ]; then
    iptables-save > /etc/iptables/rules.v4
  else
    echo "  ⚠️  Regras não persistidas: instale iptables-persistent (apt install iptables-persistent)"
  fi
else
  echo "  ⚠️  iptables não encontrado (imagem minimal?) — confira a Security List da VCN"
fi

# --- 2. Docker ------------------------------------------------------------
log "2/5 Instalando Docker + compose plugin (se necessário)"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  echo "  ✅ Docker instalado"
else
  echo "  ↷ Docker já instalado: $(docker --version)"
fi

docker compose version >/dev/null 2>&1 || {
  echo "❌ 'docker compose' (plugin v2) não encontrado"
  exit 1
}

# --- 3. Swap --------------------------------------------------------------
log "3/5 Configurando swap (${SWAP_SIZE})"
if swapon --show | grep -q '/swapfile'; then
  echo "  ↷ swap já ativo"
else
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  ✅ swap de ${SWAP_SIZE} ativo"
fi

# --- 4. UFW + fail2ban ----------------------------------------------------
log "4/5 Firewall (UFW) e fail2ban"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  # --force evita prompt interativo; mantém idempotente
  ufw --force enable >/dev/null || true
  echo "  ✅ UFW: 22/80/443 liberados"
else
  echo "  ⚠️  ufw não instalado (apt install ufw)"
fi

if ! command -v fail2ban-client >/dev/null 2>&1; then
  apt-get install -y -qq fail2ban >/dev/null 2>&1 || echo "  ⚠️  falha ao instalar fail2ban"
fi
systemctl enable --now fail2ban >/dev/null 2>&1 || true

# --- 5. Diretório de deploy ----------------------------------------------
log "5/5 Preparando ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}/backups"
chmod 700 "${DEPLOY_DIR}/backups"
echo "  ✅ ${DEPLOY_DIR} pronto (backups em ${DEPLOY_DIR}/backups)"

log "Bootstrap concluído."
cat <<EOF

Próximos passos:
  1. clone do repositório:   git clone <repo> ${DEPLOY_DIR}/app && cd ${DEPLOY_DIR}/app
  2. variáveis de produção:  cp .env.production.example .env && \$EDITOR .env
                            (chmod 600 .env)
  3. certificado TLS:        coloque fullchain.pem + privkey.pem em nginx/ssl/
  4. subir:                  bash scripts/deploy.sh
  5. DNS:                    A/AAAA do domínio → IP reservado da instância
EOF
