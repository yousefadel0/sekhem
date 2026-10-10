# Stage 2 Monitoring and Backup Scheduling Plan

Status: PLAN ONLY. No execution performed.

Context:

Stage 2 Batch 8 is closed. The current private runtime includes:

- Backend on `sekhem-app-01`
- n8n on `sekhem-automation-01`
- PostgreSQL, Redis, and MinIO on `sekhem-data-01`
- Private Tailscale-only access model
- No public API cutover
- No public n8n exposure
- No production data activation

This plan defines monitoring and backup scheduling hardening. It does not create cron jobs, systemd timers, database dumps, Docker changes, service restarts, or firewall changes.

---

## 1. Objectives

The goals of this plan are:

1. Define safe health-check schedules for backend, n8n, and data services.
2. Define backup scheduling policy for PostgreSQL, n8n DB, n8n runtime, backend runtime metadata, and MinIO data.
3. Define log retention and disk usage alert thresholds.
4. Define Docker image pinning recommendations.
5. Define restore/rollback test approach.
6. Preserve the current security model: no public exposure and no secrets in docs.

---

## 2. Non-goals and forbidden actions

This document does not approve or perform:

- Service changes
- Cron creation
- Systemd timer creation
- DB commands
- Docker image changes
- Docker container restarts
- Backend restarts
- n8n restarts
- PostgreSQL/Redis/MinIO restarts
- Firewall changes
- Credentials creation or rotation
- Public DNS or public exposure
- Tailscale Funnel
- Exit Node
- Subnet Router
- Router port forwarding
- Production data use
- Secrets in repository documents

---

## 3. Runtime inventory assumptions

### `sekhem-app-01`

Role:

- Backend runtime
- Private Nginx reverse proxy

Private endpoints:

- Backend process: `127.0.0.1:3001` after hardening
- Private Nginx listener: `100.74.93.25:8080`
- Backend health: `http://100.74.93.25:8080/api/health`

### `sekhem-automation-01`

Role:

- n8n private automation runtime

Private endpoints:

- n8n UI/API: `http://100.72.37.105:5678`
- n8n health: `http://100.72.37.105:5678/healthz`

### `sekhem-data-01`

Role:

- PostgreSQL
- Redis
- MinIO

Private endpoints:

- PostgreSQL: `100.125.158.124:5432`
- Redis: `100.125.158.124:6379`
- MinIO API: `100.125.158.124:9000`
- MinIO console: `100.125.158.124:9001`

---

## 4. Monitoring schedule plan

### 4.1 Backend health check schedule

Recommended frequency:

- Every 5 minutes during pilot runtime.
- Every 1 minute only during controlled test windows or rollout validation.

Check target:

```text
http://100.74.93.25:8080/api/health
```

Expected result:

- HTTP `200` or `204`
- Service field identifies Sekhem backend
- No stack traces
- No secrets

Recommended check outputs:

```text
backend_health=PASS|FAIL
backend_http_code=<code>
backend_latency_ms=<duration>
backend_bind=127.0.0.1:3001
nginx_bind=100.74.93.25:8080
```

Alert conditions:

- HTTP code not `200` or `204`
- Timeout above 10 seconds
- backend process not active
- Nginx private health fails
- backend process binds to `0.0.0.0`, `*`, or `[::]` on port `3001`
- Nginx binds to anything other than `100.74.93.25:8080`

### 4.2 n8n health check schedule

Recommended frequency:

- Every 5 minutes during pilot runtime.
- Every 1 minute during workflow validation windows only.

Check target:

```text
http://100.72.37.105:5678/healthz
```

Expected result:

- HTTP `200`
- `status=ok`
- container `sekhem-n8n` healthy
- restart policy remains `unless-stopped`
- private port binding remains `100.72.37.105:5678`

Recommended check outputs:

```text
n8n_health=PASS|FAIL
n8n_http_code=<code>
n8n_container_health=healthy|starting|unhealthy
n8n_db_connection=PASS|FAIL
n8n_private_bind=PASS|FAIL
```

Alert conditions:

- n8n HTTP health fails
- n8n container is not running
- n8n container health is `unhealthy`
- n8n DB connection fails
- n8n binds outside `100.72.37.105:5678`
- UFW rule opens `5678` beyond approved Tailscale/admin access

### 4.3 Data service health schedule

Recommended frequency:

- PostgreSQL: every 5 minutes
- Redis: every 5 minutes
- MinIO: every 5 minutes
- Docker volume presence: every 30 minutes
- Disk usage: every 15 minutes

Expected outputs:

```text
postgres_health=PASS|FAIL
redis_health=PASS|FAIL
minio_health=PASS|FAIL
postgres_private_bind=PASS|FAIL
redis_private_bind=PASS|FAIL
minio_private_bind=PASS|FAIL
```

Alert conditions:

- PostgreSQL container unhealthy
- PostgreSQL `pg_isready` fails
- Redis container unhealthy
- Redis ping fails using server-local password loading
- MinIO health endpoint fails
- Any data port binds outside `100.125.158.124`
- Data service UFW rule allows unexpected sources

---

## 5. Backup schedule plan

### 5.1 PostgreSQL backup schedule

Scope:

- Runtime PostgreSQL databases hosted on `sekhem-data-01`
- n8n database
- Future backend database only after PM-approved activation

Recommended schedule:

- Daily full logical backup at 02:00 local time
- Additional manual backup before any schema-affecting change
- Weekly retention review

Recommended retention:

- Daily backups: 7 days
- Weekly backups: 4 weeks
- Monthly backups: 3 months during pilot

Backup type:

- Logical `pg_dump` in custom format for each approved database
- No destructive commands
- No restore unless explicitly approved

Storage location:

```text
/opt/sekhem/backups/postgres
/opt/sekhem/backups/n8n
```

Security rules:

- Load DB credentials from server-local `.env`
- Do not print credentials
- Do not include `.env` in backup archives
- Backup files should be `640 root:root`
- Backup directories should be `750 root:root`

Validation:

- Backup file exists
- Backup file is non-empty
- Backup metadata recorded without secrets
- Optional `pg_restore --list` validation in a later approved restore-readiness batch

### 5.2 n8n DB backup schedule

Scope:

- Dedicated n8n PostgreSQL database on `sekhem-data-01`

Recommended schedule:

- Daily at 02:15 local time
- Manual backup before workflow import/export, credential changes, or n8n upgrade

Storage location:

```text
/opt/sekhem/backups/n8n
```

Validation:

- `.dump` file created
- File non-empty
- Permission `640 root:root`
- No secrets printed
- `pg_restore --list` planned for restore-readiness testing

### 5.3 n8n runtime backup schedule

Scope:

- n8n Docker Compose file
- n8n runtime volume metadata
- server-local operational files
- health scripts

Exclude:

- `.env`
- secrets
- tokens
- credential values

Recommended schedule:

- Daily after n8n DB backup
- Manual backup before n8n upgrades or workflow import/export

Storage location:

```text
/opt/sekhem/backups/n8n
```

Validation:

- Archive created
- Archive non-empty
- Archive excludes `.env`
- Archive permissions `640 root:root`

### 5.4 Backend backup schedule

Scope:

- Backend deployed commit metadata
- Backend service file
- Private Nginx config
- backend runtime logs summary
- backend build/runtime metadata

Exclude:

- `.env`
- `node_modules`
- `.git`
- secrets
- tokens
- private keys

Recommended schedule:

- Daily metadata snapshot
- Runtime archive before deployment changes
- Runtime archive after successful deployment validation

Storage location:

```text
/opt/sekhem/backups/backend
```

Validation:

- Metadata file created
- Runtime archive created when approved
- `.env` excluded
- Permissions restricted

### 5.5 MinIO backup consideration

Current status:

- MinIO is private and healthy.
- MinIO may not yet hold critical production objects.

Plan:

1. During pilot, confirm whether MinIO contains only test/runtime objects or durable product artifacts.
2. Do not assume MinIO is disposable once workflows begin using it.
3. Before production-like use, define MinIO backup method:
   - volume-level backup during maintenance window, or
   - bucket-level replication/export using MinIO client, or
   - off-VM encrypted object backup.
4. Validate object listing and restore in a future approved restore-readiness batch.

Recommended schedule after MinIO is used for durable data:

- Daily object backup or replication
- Weekly restore test on non-production target

Security rules:

- No MinIO access keys in docs
- No credentials printed
- No public MinIO exposure

---

## 6. Log retention plan

### Backend logs

Location:

```text
/opt/sekhem/logs/backend
```

Recommended retention:

- Keep 14 days during pilot
- Compress logs older than 2 days
- Delete or archive logs older than 14 days unless incident hold is active

Alert conditions:

- Repeated backend startup errors
- HTTP 5xx spike in Nginx logs
- backend log size grows unexpectedly
- secrets appear in logs

### n8n logs

Source:

- Docker logs for `sekhem-n8n`
- Future workflow execution logs inside n8n DB

Recommended retention:

- Docker log rotation should be configured in a later Docker logging hardening batch
- Preserve n8n execution history policy separately before production workflows

Alert conditions:

- n8n crash loop
- DB connection failures
- credential errors
- workflow execution failures above approved threshold

### Data service logs

Scope:

- PostgreSQL container logs
- Redis container logs
- MinIO container logs

Recommended retention:

- Docker log rotation via daemon configuration in a later approved batch
- Do not change Docker daemon configuration in this plan

Alert conditions:

- PostgreSQL connection saturation
- Redis auth failures
- MinIO health failures
- repeated container restarts

---

## 7. Disk usage alerts

Recommended checks:

- Every 15 minutes on `/`
- Every 15 minutes on `/opt`
- Daily backup directory size summary
- Daily Docker volume size summary

Thresholds:

```text
warning: >= 70% used
critical: >= 85% used
emergency: >= 92% used
```

Per-VM focus:

- `sekhem-app-01`: backend logs, build artifacts, repo checkout
- `sekhem-automation-01`: n8n backups, Docker logs, workflow artifacts
- `sekhem-data-01`: Docker volumes, PostgreSQL data, MinIO data, Redis append-only files

Response policy:

- Warning: inspect growth source
- Critical: stop new deployments/imports until reviewed
- Emergency: PM approval required for cleanup actions

No automated deletion should be introduced without a separate approved retention implementation batch.

---

## 8. Docker image pinning recommendation

Current known risk:

- Some containers may use floating tags such as `latest`.

Recommendation:

1. Inventory all runtime images and current digests.
2. Pin images to tested versions or immutable digests.
3. Document upgrade procedure per service.
4. Backup before upgrade.
5. Validate health after upgrade.

Candidate services:

- `n8nio/n8n`
- `postgres:16-alpine`
- `redis:7-alpine`
- `minio/minio`

Priority:

1. n8n image pinning
2. MinIO image pinning
3. Redis patch version pinning
4. PostgreSQL patch version pinning, with extra caution

No image changes are approved by this plan.

---

## 9. Rollback and restore test approach

### Backup validation without restore

Allowed in a future backup-validation batch:

- Confirm files exist
- Confirm files are non-empty
- Confirm permissions
- Confirm `.env` excluded
- Confirm `pg_restore --list` can read database dump
- Confirm tar listing is sane

### Restore readiness planning

Separate future batch should define:

1. Restore target VM or isolated restore directory.
2. Restore order:
   - infrastructure runtime directory
   - Docker volumes or database dump
   - service config
   - health checks
3. Secret restore process, separately approved.
4. Post-restore validation checklist.

### Do not perform restore on live runtime

No live restore should be performed without:

- PM approval
- Maintenance window
- backup of current state
- rollback target
- validation owner

---

## 10. Proposed implementation batch split

### Batch 9A — Read-only monitoring scripts and manual runner

Scope:

- Create health scripts for app, automation, and data VMs
- No cron
- No timers
- Run manually only
- No service changes

### Batch 9B — Backup dry-run scheduling design

Scope:

- Create server-local backup scripts
- Run manually only
- No cron
- Validate backup files and exclusions

### Batch 9C — Scheduling implementation

Scope:

- Create cron/systemd timers only after scripts are stable
- Add retention rules only after PM approval
- Add alerting destination only after PM approval

### Batch 9D — Docker image pinning plan

Scope:

- Inventory image tags/digests
- Propose pinned versions
- No image pulls or restarts until approved

---

## 11. QA gate

QA must confirm before any implementation:

- No secrets are included in docs
- No cron/timer is created by this plan
- No DB command is executed by this plan
- No Docker image change is performed by this plan
- No firewall/public exposure change is performed by this plan
- Backup locations are server-local and restricted
- `.env` is excluded from normal backups
- Redis health check design loads password without printing it
- Monitoring scripts are read-only
- Restore testing is separated from live runtime

---

## 12. Explicit confirmation

This document is a plan only.

No execution was performed.
No service changes were made.
No cron jobs were created.
No DB commands were run.
No Docker changes were made.
No restarts were performed.
No credentials were added.
No public exposure was introduced.
No secrets were added to docs.
