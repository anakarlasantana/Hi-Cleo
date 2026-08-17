#!/bin/bash
# ===========================================
# Hi Cleo — Backup Automatizado do PostgreSQL
# ===========================================
# Faz pg_dump do banco app-db, compacta e mantém os últimos 7 dias.
#
# Instalação (cron no servidor):
#   chmod +x scripts/backup-db.sh
#   crontab -e
#   0 3 * * * /opt/hi-cleo/scripts/backup-db.sh >> /var/log/hicleo-backup.log 2>&1
#
# Restauração:
#   gunzip < /opt/hi-cleo/backups/hicleo_20260817.sql.gz | docker exec -i hicleo-app-db psql -U hicleo -d hicleo

set -euo pipefail

# --- Configuração ---
CONTAINER_NAME="hicleo-app-db"
DB_USER="${DB_USER:-hicleo}"
DB_NAME="${DB_NAME:-hicleo}"
BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hicleo_${DATE}.sql.gz"

# --- Criar diretório de backups se não existir ---
mkdir -p "$BACKUP_DIR"

# --- Executar backup ---
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Iniciando backup do banco ${DB_NAME}..."

if ! docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" --no-owner --no-acl | gzip > "$BACKUP_FILE"; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ ERRO: Backup falhou!"
    rm -f "$BACKUP_FILE"
    exit 1
fi

# --- Verificar tamanho ---
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backup concluído: ${BACKUP_FILE} (${BACKUP_SIZE})"

# --- Rotação: remover backups mais antigos que RETENTION_DAYS ---
REMOVED=$(find "$BACKUP_DIR" -name "hicleo_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$REMOVED" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🗑️  Removidos ${REMOVED} backup(s) antigo(s) (>${RETENTION_DAYS} dias)"
fi

# --- Listar backups atuais ---
TOTAL=$(find "$BACKUP_DIR" -name "hicleo_*.sql.gz" | wc -l)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] 📦 Total de backups armazenados: ${TOTAL}"
