#!/bin/sh
set -eu

mkdir -p /backups
run_backup() {
  stamp=$(date +%Y-%m-%d_%H-%M-%S)
  pg_dump --format=custom --no-owner --file="/backups/borracharia_${stamp}.dump"
  find /backups -type f -name 'borracharia_*.dump' -mtime "+${BACKUP_RETENTION_DAYS:-30}" -delete
}

if [ "${1:-loop}" = "now" ]; then
  run_backup
  exit 0
fi

while true; do
  run_backup
  sleep 86400
done
