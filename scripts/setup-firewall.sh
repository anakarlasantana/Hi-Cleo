#!/bin/bash
# ===========================================
# Hi Cleo — Setup do Firewall (UFW)
# ===========================================
# Executa no servidor de produção para bloquear portas internas.
# Libera apenas: SSH (22), HTTP (80), HTTPS (443).
#
# Uso:
#   sudo bash scripts/setup-firewall.sh
#
# Para verificar status depois:
#   sudo ufw status verbose
#
# Para desabilitar temporariamente (manutenção):
#   sudo ufw disable

set -euo pipefail

echo "=== Hi Cleo — Configuração do Firewall (UFW) ==="
echo ""

# --- Verificar se é root ---
if [ "$EUID" -ne 0 ]; then
    echo "❌ Este script precisa ser executado como root (sudo)."
    exit 1
fi

# --- Instalar UFW se não estiver presente ---
if ! command -v ufw &> /dev/null; then
    echo "📦 Instalando UFW..."
    apt-get update -qq && apt-get install -y -qq ufw
fi

# --- Reset para estado limpo ---
echo "🔄 Resetando regras do UFW..."
ufw --force reset

# --- Política padrão: bloquear tudo de entrada, liberar saída ---
echo "🔒 Definindo política padrão (deny incoming, allow outgoing)..."
ufw default deny incoming
ufw default allow outgoing

# --- Regras de entrada ---
echo "✅ Liberando SSH (porta 22)..."
ufw allow 22/tcp comment 'SSH'

echo "✅ Liberando HTTP (porta 80)..."
ufw allow 80/tcp comment 'HTTP - Redirect to HTTPS'

echo "✅ Liberando HTTPS (porta 443)..."
ufw allow 443/tcp comment 'HTTPS - Nginx'

# --- Bloquear explicitamente portas internas (documentação) ---
# Estas já estão bloqueadas pelo "deny incoming" padrão,
# mas listamos explicitamente para clareza e auditoria.
echo "🚫 Bloqueando porta 3001 (backend)..."
ufw deny 3001/tcp comment 'Backend - apenas interno'

echo "🚫 Bloqueando porta 3000 (frontend)..."
ufw deny 3000/tcp comment 'Frontend - apenas interno'

echo "🚫 Bloqueando porta 5432 (PostgreSQL)..."
ufw deny 5432/tcp comment 'PostgreSQL - apenas interno'

echo "🚫 Bloqueando porta 6379 (Redis)..."
ufw deny 6379/tcp comment 'Redis - apenas interno'

echo "🚫 Bloqueando porta 8080 (Evolution API)..."
ufw deny 8080/tcp comment 'Evolution API - apenas interno'

# --- Ativar firewall ---
echo ""
echo "🔥 Ativando firewall..."
ufw --force enable

# --- Mostrar status ---
echo ""
echo "=== Status Final ==="
ufw status verbose

echo ""
echo "✅ Firewall configurado com sucesso!"
echo ""
echo "Portas abertas: 22 (SSH), 80 (HTTP), 443 (HTTPS)"
echo "Portas bloqueadas: 3000, 3001, 5432, 6379, 8080"
echo ""
echo "💡 Dicas:"
echo "  - Verificar status: sudo ufw status"
echo "  - Desabilitar (emergência): sudo ufw disable"
echo "  - Logs: sudo tail -f /var/log/ufw.log"
