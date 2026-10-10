# Stage 2 Restore-Readiness Gate Plan

Status: PLAN ONLY. No restore execution performed.

Source of truth reviewed first:

- `docs/pm-handoffs/stage-2-tasker-instructions.md` from latest `main`
- Main commit used as branch base: `95037fee7c8c2715159d61373b0002a2156c92a0`

## 1. Purpose

This plan defines how Sekhem Stage 2 backups should be validated for restore-readiness without touching the live runtime.

The goal is to prepare a safe, isolated restore-readiness gate for the backup artifacts created by Monitoring/Backup Batch 2 and the scheduled health monitoring state created by Monitoring/Backup Batch 3.

This document does not approve restore execution.

## 2. Current runtime facts

Current Stage 2 runtime is private-only:

- `sekhem-app-01` — Tailscale IP `100.74.93.25`
- Backend process binds only to `127.0.0.1:3001`
- Backend private Nginx listener: `100.74.93.25:8080`
- Backend private health: `http://100.74.93.25:8080/api/health`
- `sekhem-automation-01` — Tailscale IP `100.72.37.105`
- n8n private listener: `100.72.37.105:5678`
- `sekhem-data-01` — Tailscale IP `100.125.158.124`
- PostgreSQL: `100.125.158.124:5432`
- Redis: `100.125.158.124:6379`
- MinIO API: `100.125.158.124:9000`
- MinIO Console: `100.125.158.124:9001`

## 3. Scope

Allowed in this plan:

- Define isolated restore target.
- Define restore inputs from existing backup files.
- Define validation checks.
- Define rollback and cleanup.
- Define forbidden live runtime restore rules.
- Define QA gate.

Forbidden in this plan:

- No restore execution.
- No live runtime restore.
- No DB mutation.
- No service restart.
- No Docker changes.
- No public exposure.
- No secrets in docs.
- No credentials in repo, docs, logs, or handoffs.

## 4. Restore-readiness model

Restore-readiness must be handled in two separate gates:

1. **Readiness Plan Gate** — this document.
2. **Isolated Restore Test Gate** — future PM-approved execution batch only.

Live restore is never allowed during restore-readiness testing.

## 5. Isolated restore target

Recommended isolated target options, in priority order:

### Option A — New isolated VM

Preferred target:

```text
sekhem-restore-test-01
```

Network posture:

- Private only.
- Tailscale/private admin access only if PM approves.
- No public DNS.
- No public ports.
- No router forwarding.
- No Tailscale Funnel.
- No Exit Node.
- No Subnet Router.

Suggested purpose:

- Temporary restore validation.
- Destroy or clean after test.
- Never connect to production/live services.

### Option B — Isolated directory on non-live VM

Only acceptable for archive inspection, metadata validation, and `pg_restore --list` style validation.

Not acceptable for running restored services if it risks port conflicts or shared volumes.

### Option C — Local admin workstation validation

Useful only for non-secret archive checks:

- tar listing
- checksum verification
- metadata review
- `pg_restore --list` if tools exist

Not acceptable for full service restore.

## 6. Restore inputs

Restore-readiness should use server-local backup artifacts only.

### 6.1 PostgreSQL logical backup

Source VM:

```text
sekhem-data-01
```

Script:

```text
/opt/sekhem/backups/postgres/postgres-logical-backup.sh
```

Backup path pattern:

```text
/opt/sekhem/backups/postgres/postgres-*.dump
```

Restore-readiness validation inputs:

- Latest PostgreSQL `.dump` file.
- File size.
- File permission.
- Ownership.
- `pg_restore --list` output in isolated context only.

### 6.2 n8n database backup

Source VM:

```text
sekhem-data-01
```

Script:

```text
/opt/sekhem/backups/n8n/n8n-db-backup.sh
```

Backup path pattern:

```text
/opt/sekhem/backups/n8n/n8n-db-*.dump
```

Restore-readiness validation inputs:

- Latest n8n DB `.dump` file.
- File size.
- File permission.
- Ownership.
- `pg_restore --list` output in isolated context only.

### 6.3 n8n runtime metadata backup

Source VM:

```text
sekhem-automation-01
```

Script:

```text
/opt/sekhem/backups/n8n/n8n-runtime-metadata-backup.sh
```

Backup path patterns:

```text
/opt/sekhem/backups/n8n/n8n-runtime-metadata-*.txt
/opt/sekhem/backups/n8n/n8n-runtime-metadata-*.tar.gz
```

Restore-readiness validation inputs:

- Metadata text file.
- Archive listing.
- Confirmation that `.env`, secrets, tokens, keys, and credentials are excluded.

### 6.4 Backend metadata backup

Source VM:

```text
sekhem-app-01
```

Script:

```text
/opt/sekhem/backups/backend/backend-metadata-backup.sh
```

Backup path patterns:

```text
/opt/sekhem/backups/backend/backend-metadata-*.txt
/opt/sekhem/backups/backend/backend-metadata-*.tar.gz
```

Restore-readiness validation inputs:

- Metadata text file.
- Archive listing.
- Branch and commit metadata.
- Confirmation that `.env`, `node_modules`, `.git`, logs, secrets, tokens, keys, and credentials are excluded.

## 7. Validation checks

### 7.1 Backup file checks

For each backup artifact:

```text
file exists: PASS/FAIL
file size > 0: PASS/FAIL
owner root:root or approved owner: PASS/FAIL
permissions restricted: PASS/FAIL
expected extension/type: PASS/FAIL
```

Expected permissions:

```text
backup scripts: 750 root:root
backup directories: 750 root:root
backup files: 640 root:root
```

### 7.2 Secret exclusion checks

Archive listings must be checked for forbidden patterns:

```text
.env
.pem
.key
secret
token
credential
auth
```

Expected output:

```text
env_exclusion=PASS
secret_exclusion=PASS
```

No secret values may be printed.

### 7.3 PostgreSQL dump readability

Future isolated validation may run:

```text
pg_restore --list <backup.dump>
```

This is allowed only in an isolated restore-readiness execution batch, not in this plan.

Expected result:

```text
pg_restore_list=PASS
```

### 7.4 n8n DB dump readability

Future isolated validation may run:

```text
pg_restore --list <n8n-db-backup.dump>
```

Expected result:

```text
n8n_pg_restore_list=PASS
```

### 7.5 Metadata consistency checks

Backend metadata should include:

```text
host=sekhem-app-01
repo_dir=/opt/sekhem/app/repo
backend_dir=/opt/sekhem/app/repo/backend
branch=main
commit=<commit-sha>
service_status=<status>
nginx_status=<status>
private_health_url=http://100.74.93.25:8080/api/health
```

n8n metadata should include:

```text
host=sekhem-automation-01
runtime_dir=/opt/sekhem/automation/n8n
container=sekhem-n8n
image=<image-tag>
health=<status>
restart=<policy>
```

## 8. Future isolated restore test outline

This is not approved for execution by this document.

A future restore-readiness execution batch should:

1. Provision or select isolated restore target.
2. Copy backup artifacts to isolated target.
3. Verify checksums if available.
4. Inspect archive contents without extracting secrets.
5. Validate PostgreSQL and n8n dump readability with `pg_restore --list`.
6. If PM approves deeper test, restore into a disposable isolated PostgreSQL container/database, never live runtime.
7. Validate restored schema/listing only.
8. Destroy disposable restore database/container/VM after QA approval.

## 9. Forbidden live runtime restore rules

The following are explicitly forbidden unless PM opens a separate emergency/live-restore batch:

- Restoring any database onto `sekhem-data-01` live PostgreSQL.
- Restoring n8n DB over the live n8n database.
- Restoring backend runtime over `/opt/sekhem/app/repo` live runtime.
- Restoring n8n runtime over `/opt/sekhem/automation/n8n` live runtime.
- Replacing Docker volumes on live runtime.
- Running destructive database commands.
- Running migrations, `db:push`, `db:seed`, DB reset, or Prisma-backed writes.
- Restarting services as part of restore-readiness validation.
- Opening public ports.
- Adding credentials or secrets to repo/docs/logs.

## 10. Rollback and cleanup

For planning only.

Future isolated restore test cleanup should remove only isolated artifacts:

```text
/opt/sekhem/restore-test/*
/tmp/sekhem-restore-test-*
disposable restore database/container/volume on restore-test target only
```

Live runtime cleanup is forbidden.

If an isolated restore test fails:

1. Stop the isolated test only.
2. Preserve logs and command output.
3. Do not retry live.
4. Report failed artifact, failed validation check, and suspected cause.
5. Request QA review before next attempt.

## 11. QA gate

QA must verify:

1. This is plan-only.
2. No restore commands were executed.
3. No live runtime restore is proposed.
4. Isolated restore target is clearly defined.
5. Restore inputs are listed by backup category.
6. Validation checks cover file presence, size, permissions, archive exclusions, and dump readability.
7. `.env`, secrets, tokens, private keys, credentials, and auth headers are excluded from docs and expected archives.
8. Rollback/cleanup only touches isolated target artifacts.
9. Live runtime restore rules are explicit.
10. No DB mutation, service restart, Docker change, public exposure, or credential printing is introduced.

QA decision expected:

```text
APPROVED FOR PM IMPLEMENTATION REVIEW
```

or

```text
NOT APPROVED — FIX PLAN
```

## 12. Explicit safety confirmation

This document is a plan only.

No restore execution was performed.
No live runtime restore was performed.
No DB mutation was performed.
No service restart was performed.
No Docker change was performed.
No public exposure was introduced.
No secrets were added to docs.
