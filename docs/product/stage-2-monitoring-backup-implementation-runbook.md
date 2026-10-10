# Stage 2 Monitoring and Backup Implementation Runbook

Status: RUNBOOK ONLY. No execution performed.

Base context:

- PR #27 monitoring and backup scheduling plan is approved and merged.
- Merge SHA: `539190263bad29361bd752be68ccba3dfdb30a6e`
- Current runtime remains private-only.
- This file proposes implementation scripts, schedules, validation, disable/rollback, and QA gates.

This runbook is documentation only. It does not create scripts, cron jobs, systemd timers, database backups, Docker changes, restarts, firewall changes, credentials, or public exposure.

---

## 1. Runtime inventory targets

### `sekhem-app-01`

Role:

- Backend runtime
- Private Nginx listener

Known private endpoints:

```text
backend health: http://100.74.93.25:8080/api/health
backend app target after hardening: 127.0.0.1:3001
private Nginx bind: 100.74.93.25:8080
```

### `sekhem-automation-01`

Role:

- n8n private runtime

Known private endpoints:

```text
n8n UI/API: http://100.72.37.105:5678
n8n health: http://100.72.37.105:5678/healthz
```

### `sekhem-data-01`

Role:

- PostgreSQL
- Redis
- MinIO

Known private endpoints:

```text
PostgreSQL: 100.125.158.124:5432
Redis: 100.125.158.124:6379
MinIO API: 100.125.158.124:9000
MinIO Console: 100.125.158.124:9001
```

---

## 2. Server-local path proposal

### Common runtime paths

```text
/opt/sekhem/runtime
/opt/sekhem/runtime/health
/opt/sekhem/runtime/logs
/opt/sekhem/backups
```

### App VM paths

```text
/opt/sekhem/runtime/health/check-app-health.sh
/opt/sekhem/runtime/logs/app-health.log
/opt/sekhem/backups/backend
/opt/sekhem/backups/backend/backend-metadata-backup.sh
```

### Automation VM paths

```text
/opt/sekhem/runtime/health/check-automation-health.sh
/opt/sekhem/runtime/logs/automation-health.log
/opt/sekhem/backups/n8n
/opt/sekhem/backups/n8n/n8n-db-backup.sh
/opt/sekhem/backups/n8n/n8n-runtime-backup.sh
```

### Data VM paths

```text
/opt/sekhem/runtime/health/check-data-health.sh
/opt/sekhem/runtime/logs/data-health.log
/opt/sekhem/backups/postgres
/opt/sekhem/backups/minio
/opt/sekhem/backups/postgres/postgres-backup.sh
```

### Recommended permissions

```text
directories: 750 root:root for backup directories
scripts: 750 root:root
logs: 640 root:root or 750 root:root directory with 640 files
backup files: 640 root:root
.env files: unchanged, 600 root:root where already configured
```

---

## 3. Health script designs

These scripts are designs only. They must not be created or executed without a separate PM-approved implementation batch.

### 3.1 Backend health check script design

Target file:

```text
/opt/sekhem/runtime/health/check-app-health.sh
```

Purpose:

- Confirm backend service is running.
- Confirm private Nginx health returns success.
- Confirm backend loopback bind remains correct.
- Confirm Nginx remains private.
- Confirm UFW is active.
- Confirm disk/memory thresholds.
- Print no secrets.

Proposed script:

```bash
#!/usr/bin/env bash
set -euo pipefail

WARN_DISK=70
CRIT_DISK=85
APP_TS_IP="100.74.93.25"
BACKEND_PORT="3001"
NGINX_PORT="8080"
HEALTH_URL="http://${APP_TS_IP}:${NGINX_PORT}/api/health"
LOCAL_URL="http://127.0.0.1:${BACKEND_PORT}/api/health"

RESULT="PASS"

echo "===== APP HEALTH CHECK ====="
echo "timestamp=$(date -Is)"
echo "host=$(hostnamectl --static)"
echo "tailscale_ip=$(tailscale ip -4 | head -n 1 || true)"

echo "memory:"
free -h

echo "disk:"
df -h / /opt 2>/dev/null || df -h /
ROOT_USED=$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')
if [ "${ROOT_USED}" -ge "${CRIT_DISK}" ]; then
  echo "disk_root=CRITICAL_${ROOT_USED}%"
  RESULT="FAIL"
elif [ "${ROOT_USED}" -ge "${WARN_DISK}" ]; then
  echo "disk_root=WARNING_${ROOT_USED}%"
else
  echo "disk_root=PASS_${ROOT_USED}%"
fi

echo "ufw:"
sudo ufw status verbose

echo "backend_service:"
if systemctl is-active sekhem-backend >/dev/null; then
  echo "backend_service=PASS"
else
  echo "backend_service=FAIL"
  RESULT="FAIL"
fi

echo "backend_local_health:"
LOCAL_CODE=$(curl -sS -o /tmp/sekhem-app-local-health.out -w "%{http_code}" --max-time 10 "${LOCAL_URL}" || true)
echo "backend_local_http_code=${LOCAL_CODE}"
if [ "${LOCAL_CODE}" != "200" ] && [ "${LOCAL_CODE}" != "204" ]; then
  RESULT="FAIL"
fi

echo "backend_private_nginx_health:"
NGINX_CODE=$(curl -sS -o /tmp/sekhem-app-nginx-health.out -w "%{http_code}" --max-time 10 "${HEALTH_URL}" || true)
echo "backend_private_nginx_http_code=${NGINX_CODE}"
if [ "${NGINX_CODE}" != "200" ] && [ "${NGINX_CODE}" != "204" ]; then
  RESULT="FAIL"
fi

echo "listeners:"
sudo ss -tulpn | grep -E ":(${BACKEND_PORT}|${NGINX_PORT})\\b" || true

if sudo ss -tulpn | grep ":${BACKEND_PORT}" | grep -q "127.0.0.1:${BACKEND_PORT}"; then
  echo "backend_loopback_bind=PASS"
else
  echo "backend_loopback_bind=FAIL"
  RESULT="FAIL"
fi

if sudo ss -tulpn | grep ":${NGINX_PORT}" | grep -q "${APP_TS_IP}:${NGINX_PORT}"; then
  echo "nginx_private_bind=PASS"
else
  echo "nginx_private_bind=FAIL"
  RESULT="FAIL"
fi

echo "result=${RESULT}"
test "${RESULT}" = "PASS"
```

Recommended schedule:

```text
every 5 minutes
```

---

### 3.2 n8n health check script design

Target file:

```text
/opt/sekhem/runtime/health/check-automation-health.sh
```

Purpose:

- Confirm n8n container is running and healthy.
- Confirm n8n HTTP health endpoint returns success.
- Confirm n8n DB connection using existing server-local runtime env without printing values.
- Confirm private binding remains restricted.
- Confirm disk/memory thresholds.

Proposed script:

```bash
#!/usr/bin/env bash
set -euo pipefail

WARN_DISK=70
CRIT_DISK=85
N8N_TS_IP="100.72.37.105"
N8N_PORT="5678"
N8N_DIR="/opt/sekhem/automation/n8n"
RESULT="PASS"

echo "===== AUTOMATION HEALTH CHECK ====="
echo "timestamp=$(date -Is)"
echo "host=$(hostnamectl --static)"
echo "tailscale_ip=$(tailscale ip -4 | head -n 1 || true)"

free -h
df -h / /opt 2>/dev/null || df -h /
ROOT_USED=$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')
if [ "${ROOT_USED}" -ge "${CRIT_DISK}" ]; then
  echo "disk_root=CRITICAL_${ROOT_USED}%"
  RESULT="FAIL"
elif [ "${ROOT_USED}" -ge "${WARN_DISK}" ]; then
  echo "disk_root=WARNING_${ROOT_USED}%"
else
  echo "disk_root=PASS_${ROOT_USED}%"
fi

sudo ufw status verbose

sudo docker ps --filter "name=sekhem-n8n" --format 'name={{.Names}} status={{.Status}} ports={{.Ports}}'
N8N_HEALTH=$(sudo docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' sekhem-n8n 2>/dev/null || echo missing)
echo "n8n_container_health=${N8N_HEALTH}"
if [ "${N8N_HEALTH}" != "healthy" ]; then
  RESULT="FAIL"
fi

HTTP_CODE=$(curl -sS -o /tmp/n8n-health.out -w "%{http_code}" --max-time 10 "http://${N8N_TS_IP}:${N8N_PORT}/healthz" || true)
echo "n8n_http_code=${HTTP_CODE}"
if [ "${HTTP_CODE}" != "200" ]; then
  RESULT="FAIL"
fi

if sudo ss -tulpn | grep ":${N8N_PORT}" | grep -q "${N8N_TS_IP}:${N8N_PORT}"; then
  echo "n8n_private_bind=PASS"
else
  echo "n8n_private_bind=FAIL"
  RESULT="FAIL"
fi

if [ -x "${N8N_DIR}/check-n8n-health.sh" ]; then
  sudo "${N8N_DIR}/check-n8n-health.sh"
else
  echo "n8n_existing_health_script=missing"
  RESULT="FAIL"
fi

echo "result=${RESULT}"
test "${RESULT}" = "PASS"
```

Recommended schedule:

```text
every 5 minutes
```

---

### 3.3 Data services health check script design

Target file:

```text
/opt/sekhem/runtime/health/check-data-health.sh
```

Purpose:

- Confirm PostgreSQL health.
- Confirm Redis health using password loaded from `.env` without printing it.
- Confirm MinIO health.
- Confirm private bindings remain restricted.
- Confirm disk/memory thresholds.
- Print no secrets.

Proposed script:

```bash
#!/usr/bin/env bash
set -euo pipefail

WARN_DISK=70
CRIT_DISK=85
DATA_TS_IP="100.125.158.124"
DATA_ENV="/opt/sekhem/data-services/.env"
RESULT="PASS"

echo "===== DATA HEALTH CHECK ====="
echo "timestamp=$(date -Is)"
echo "host=$(hostnamectl --static)"
echo "tailscale_ip=$(tailscale ip -4 | head -n 1 || true)"

free -h
df -h / /opt 2>/dev/null || df -h /
ROOT_USED=$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')
if [ "${ROOT_USED}" -ge "${CRIT_DISK}" ]; then
  echo "disk_root=CRITICAL_${ROOT_USED}%"
  RESULT="FAIL"
elif [ "${ROOT_USED}" -ge "${WARN_DISK}" ]; then
  echo "disk_root=WARNING_${ROOT_USED}%"
else
  echo "disk_root=PASS_${ROOT_USED}%"
fi

sudo ufw status verbose
sudo docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
sudo docker inspect --format='{{.Name}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}} restart={{.HostConfig.RestartPolicy.Name}}' sekhem-postgres sekhem-redis sekhem-minio

if sudo docker exec sekhem-postgres pg_isready >/dev/null 2>&1; then
  echo "postgres_health=PASS"
else
  echo "postgres_health=FAIL"
  RESULT="FAIL"
fi

if sudo test -f "${DATA_ENV}"; then
  set -a
  . "${DATA_ENV}"
  set +a
  if sudo docker exec -e REDIS_PASSWORD="${REDIS_PASSWORD}" sekhem-redis sh -c 'redis-cli -a "$REDIS_PASSWORD" ping' 2>/dev/null | grep -q '^PONG$'; then
    echo "redis_health=PASS"
  else
    echo "redis_health=FAIL"
    RESULT="FAIL"
  fi
else
  echo "redis_health=FAIL_ENV_MISSING"
  RESULT="FAIL"
fi

if sudo docker exec sekhem-minio sh -c 'curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null'; then
  echo "minio_health=PASS"
else
  echo "minio_health=FAIL"
  RESULT="FAIL"
fi

for port in 5432 6379 9000 9001; do
  if sudo ss -tulpn | grep ":${port}" | grep -q "${DATA_TS_IP}:${port}"; then
    echo "private_bind_${port}=PASS"
  else
    echo "private_bind_${port}=FAIL"
    RESULT="FAIL"
  fi
done

echo "result=${RESULT}"
test "${RESULT}" = "PASS"
```

Recommended schedule:

```text
every 5 minutes
```

---

## 4. Backup script designs

These scripts are proposals only. They must not be created or executed without a separate PM-approved implementation batch.

### 4.1 PostgreSQL backup script design

Target file:

```text
/opt/sekhem/backups/postgres/postgres-backup.sh
```

Purpose:

- Back up approved PostgreSQL databases using server-local credentials.
- Do not print credentials.
- Do not run restore.
- Do not run migrations.

Proposed approach:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/sekhem/backups/postgres"
DATA_ENV="/opt/sekhem/data-services/.env"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"

set -a
. "${DATA_ENV}"
set +a

OUT="${BACKUP_DIR}/postgres-${POSTGRES_DB}-${STAMP}.dump"

docker run --rm \
  --env-file "${DATA_ENV}" \
  -v "${BACKUP_DIR}:/backup" \
  postgres:16-alpine \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 100.125.158.124 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backup/'"$(basename "${OUT}")"'"'

chmod 640 "${OUT}"
chown root:root "${OUT}"
test -s "${OUT}"
echo "postgres_backup=PASS path=${OUT}"
```

Recommended schedule:

```text
daily at 02:00 local time
manual before schema-impacting work
```

---

### 4.2 n8n DB backup script design

Target file:

```text
/opt/sekhem/backups/n8n/n8n-db-backup.sh
```

Purpose:

- Back up n8n database using n8n runtime `.env`.
- Do not print credentials.

Proposed approach:

```bash
#!/usr/bin/env bash
set -euo pipefail

N8N_DIR="/opt/sekhem/automation/n8n"
BACKUP_DIR="/opt/sekhem/backups/n8n"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/n8n-db-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"

cd "${N8N_DIR}"

docker run --rm \
  --env-file "${N8N_DIR}/.env" \
  -v "${BACKUP_DIR}:/backup" \
  postgres:16-alpine \
  sh -c 'PGPASSWORD="$DB_POSTGRESDB_PASSWORD" pg_dump -h "$DB_POSTGRESDB_HOST" -p "$DB_POSTGRESDB_PORT" -U "$DB_POSTGRESDB_USER" -d "$DB_POSTGRESDB_DATABASE" -Fc -f "/backup/'"$(basename "${OUT}")"'"'

chmod 640 "${OUT}"
chown root:root "${OUT}"
test -s "${OUT}"
echo "n8n_db_backup=PASS path=${OUT}"
```

Recommended schedule:

```text
daily at 02:15 local time
manual before workflow import/export or n8n upgrade
```

---

### 4.3 n8n runtime backup script design

Target file:

```text
/opt/sekhem/backups/n8n/n8n-runtime-backup.sh
```

Purpose:

- Archive n8n runtime files.
- Exclude `.env` and secrets.

Proposed approach:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/sekhem/backups/n8n"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/n8n-runtime-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"

tar \
  --exclude='n8n/.env' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='*secret*' \
  --exclude='*token*' \
  -czf "${OUT}" \
  -C /opt/sekhem/automation n8n

if tar -tzf "${OUT}" | grep -E '(^|/)\.env$'; then
  echo "ERROR: .env found in runtime archive"
  exit 1
fi

chmod 640 "${OUT}"
chown root:root "${OUT}"
test -s "${OUT}"
echo "n8n_runtime_backup=PASS path=${OUT}"
```

Recommended schedule:

```text
daily at 02:30 local time
manual before n8n upgrade
```

---

### 4.4 Backend metadata backup script design

Target file:

```text
/opt/sekhem/backups/backend/backend-metadata-backup.sh
```

Purpose:

- Capture backend deployment metadata and safe config references.
- Do not include `.env`.
- Do not include secrets.

Proposed approach:

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/sekhem/backups/backend"
REPO_DIR="/opt/sekhem/app/repo"
BACKEND_DIR="${REPO_DIR}/backend"
STAMP="$(date +%Y%m%d-%H%M%S)"
META="${BACKUP_DIR}/backend-metadata-${STAMP}.txt"
ARCHIVE="${BACKUP_DIR}/backend-runtime-${STAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"

cd "${REPO_DIR}"
{
  echo "timestamp=$(date -Is)"
  echo "host=$(hostnamectl --static)"
  echo "branch=$(git rev-parse --abbrev-ref HEAD)"
  echo "commit=$(git rev-parse HEAD)"
  echo "backend_dir=${BACKEND_DIR}"
  echo "service=sekhem-backend"
  echo "private_health_url=http://100.74.93.25:8080/api/health"
  echo "git_status_short_start"
  git status --short
  echo "git_status_short_end"
} > "${META}"

tar \
  --exclude='repo/backend/.env' \
  --exclude='repo/backend/node_modules' \
  --exclude='repo/.git' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='*secret*' \
  --exclude='*token*' \
  -czf "${ARCHIVE}" \
  -C /opt/sekhem/app repo/backend \
  -C /etc/systemd/system sekhem-backend.service \
  -C /etc/nginx/sites-available sekhem-backend-private

if tar -tzf "${ARCHIVE}" | grep -E '(^|/)\.env$'; then
  echo "ERROR: .env found in backend archive"
  exit 1
fi

chmod 640 "${META}" "${ARCHIVE}"
chown root:root "${META}" "${ARCHIVE}"
test -s "${META}"
test -s "${ARCHIVE}"
echo "backend_metadata_backup=PASS metadata=${META} archive=${ARCHIVE}"
```

Recommended schedule:

```text
daily metadata backup
manual archive before and after backend deployment changes
```

---

## 5. MinIO backup consideration

MinIO backup implementation is not proposed as an automatic schedule until object usage is classified.

Required pre-work:

1. Identify whether MinIO contains durable workflow artifacts, user uploads, generated files, or only temporary pilot data.
2. Inventory bucket names without printing access keys.
3. Choose backup method:
   - bucket-level sync/export using MinIO client, or
   - volume snapshot during maintenance, or
   - encrypted off-VM object backup.
4. Define restore target and test method.

Recommended initial schedule after classification:

```text
daily object backup if MinIO contains durable data
weekly restore-readiness validation on isolated target
```

Forbidden in this runbook:

- No MinIO credentials in docs.
- No MinIO client execution.
- No MinIO backup execution.
- No public MinIO exposure.

---

## 6. Cron/systemd timer proposal

No cron or timers are created by this document.

### Option A — Cron proposal

Pros:

- Simple
- Easy to inspect

Cons:

- Less structured logging
- Less dependency control

Proposed future entries:

```text
*/5 * * * * /opt/sekhem/runtime/health/check-app-health.sh >> /opt/sekhem/runtime/logs/app-health.log 2>&1
*/5 * * * * /opt/sekhem/runtime/health/check-automation-health.sh >> /opt/sekhem/runtime/logs/automation-health.log 2>&1
*/5 * * * * /opt/sekhem/runtime/health/check-data-health.sh >> /opt/sekhem/runtime/logs/data-health.log 2>&1
0 2 * * * /opt/sekhem/backups/postgres/postgres-backup.sh >> /opt/sekhem/runtime/logs/postgres-backup.log 2>&1
15 2 * * * /opt/sekhem/backups/n8n/n8n-db-backup.sh >> /opt/sekhem/runtime/logs/n8n-db-backup.log 2>&1
30 2 * * * /opt/sekhem/backups/n8n/n8n-runtime-backup.sh >> /opt/sekhem/runtime/logs/n8n-runtime-backup.log 2>&1
45 2 * * * /opt/sekhem/backups/backend/backend-metadata-backup.sh >> /opt/sekhem/runtime/logs/backend-metadata-backup.log 2>&1
```

### Option B — systemd timer proposal

Pros:

- Better visibility through `systemctl list-timers`
- Better service isolation
- Better future alerting integration

Cons:

- More files to manage
- Slightly higher operational complexity

Recommendation:

- Use manual scripts first.
- Use cron only for pilot if speed matters.
- Move to systemd timers before production-like runtime.

---

## 7. Log retention proposal

No log retention is implemented by this document.

Recommended future rules:

```text
health logs: keep 14 days
backup logs: keep 30 days
backend logs: keep 14 days during pilot
n8n Docker logs: configure Docker log rotation in separate Docker hardening batch
PostgreSQL/Redis/MinIO Docker logs: configure Docker log rotation in separate Docker hardening batch
```

Proposed alert thresholds:

```text
disk warning: >= 70%
disk critical: >= 85%
disk emergency: >= 92%
```

No automated deletion should be implemented until PM approves retention execution.

---

## 8. Docker image inventory and pinning plan

No Docker image changes are approved by this runbook.

Future inventory command design:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker inspect --format='{{.Name}} image={{.Config.Image}} image_id={{.Image}}' <container>
```

Images to inventory:

```text
n8nio/n8n:latest
postgres:16-alpine
redis:7-alpine
minio/minio:latest
```

Pinning plan:

1. Record current image tags and digests.
2. Select tested version tags or immutable digests.
3. Update Compose files in a controlled batch.
4. Pull only after PM approval.
5. Backup before image change.
6. Restart only in a maintenance window.
7. Validate health after restart.

Priority:

```text
1. n8n
2. MinIO
3. Redis
4. PostgreSQL, with extra caution
```

---

## 9. Validation checklist

### Documentation-only validation for this PR

- One Markdown file created.
- No runtime files changed.
- No credentials included.
- No scripts executed.
- No cron/timer created.
- No DB command executed.
- No Docker change performed.
- No public exposure introduced.

### Future implementation validation

For each script:

```text
file exists
owner root:root
script permission 750
no secrets printed
health script returns PASS
backup file exists when backup script is manually run
backup file is non-empty
backup file permission 640 root:root
.env excluded from runtime archives
```

For schedules:

```text
manual run PASS before scheduling
cron/timer entry exists only after approval
logs written to approved location
no secrets in logs
failure behavior documented
```

---

## 10. Disable and rollback procedure

### Cron disable proposal

If cron is used in a future batch:

```bash
sudo crontab -l > /tmp/root-cron.before-sekhem-disable.txt
sudo crontab -l | grep -v '/opt/sekhem/runtime/health' | grep -v '/opt/sekhem/backups' | sudo crontab -
```

Validation:

```bash
sudo crontab -l
```

### systemd timer disable proposal

If systemd timers are used in a future batch:

```bash
sudo systemctl disable --now sekhem-app-health.timer
sudo systemctl disable --now sekhem-automation-health.timer
sudo systemctl disable --now sekhem-data-health.timer
sudo systemctl disable --now sekhem-postgres-backup.timer
sudo systemctl disable --now sekhem-n8n-db-backup.timer
sudo systemctl disable --now sekhem-n8n-runtime-backup.timer
sudo systemctl disable --now sekhem-backend-metadata-backup.timer
```

Validation:

```bash
systemctl list-timers | grep sekhem || true
```

### Script rollback proposal

```bash
sudo rm -f /opt/sekhem/runtime/health/check-app-health.sh
sudo rm -f /opt/sekhem/runtime/health/check-automation-health.sh
sudo rm -f /opt/sekhem/runtime/health/check-data-health.sh
sudo rm -f /opt/sekhem/backups/postgres/postgres-backup.sh
sudo rm -f /opt/sekhem/backups/n8n/n8n-db-backup.sh
sudo rm -f /opt/sekhem/backups/n8n/n8n-runtime-backup.sh
sudo rm -f /opt/sekhem/backups/backend/backend-metadata-backup.sh
```

No service restart should be required for script rollback.

### Backup file cleanup proposal

Only remove test backups after PM approval:

```bash
sudo find /opt/sekhem/backups -type f -name '*dryrun*' -print
```

Do not delete backup files automatically without retention approval.

---

## 11. QA gate

QA must verify:

1. This is documentation only.
2. The file is one Markdown file.
3. No runtime scripts are committed as executable files.
4. No secrets are present.
5. Proposed scripts do not print `.env` contents.
6. Redis password is loaded only server-side and not printed.
7. n8n DB password is loaded only server-side and not printed.
8. PostgreSQL password is loaded only server-side and not printed.
9. `.env` is excluded from archives.
10. No restore is proposed on live runtime.
11. Cron/systemd timers are proposals only.
12. Docker image pinning is a plan only.
13. No public exposure is introduced.
14. No DB command is executed by this PR.
15. No Docker pull/change/restart is executed by this PR.

---

## 12. Explicit safety confirmation

This runbook is documentation only.

No script execution was performed.
No cron was created.
No systemd timer was created.
No database backup was executed.
No restore test was performed.
No Docker image was pulled or changed.
No container restart was performed.
No service restart was performed.
No firewall change was made.
No credentials were printed.
No public exposure was introduced.
No secrets were added to repo/docs/logs.
