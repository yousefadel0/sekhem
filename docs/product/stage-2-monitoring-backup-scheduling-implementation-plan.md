# Stage 2 Monitoring/Backup Scheduling Implementation Plan

Status: DOCUMENTATION ONLY — No execution performed.

Base context:
- Stage 2 Batch 10 is CLOSED.
- Monitoring and backup Batch 1 & 2 validated read-only scripts.
- PR #28 runbook merged (SHA: 539190263bad29361bd752be68ccba3dfdb30a6e).

## 1. Proposed Cron/Systemd Timer Schedule

### 1.1 Health Scripts

| Script | VM | Proposed Frequency | Log Path | Notes |
|--------|----|------------------|---------|------|
| check-app-health.sh | sekhem-app-01 | every 5 min | /opt/sekhem/runtime/logs/app-health.log | Monitor backend/Nginx private health |
| check-automation-health.sh | sekhem-automation-01 | every 5 min | /opt/sekhem/runtime/logs/automation-health.log | Monitor n8n container & private HTTP health |
| check-data-health.sh | sekhem-data-01 | every 5 min | /opt/sekhem/runtime/logs/data-health.log | Monitor PostgreSQL, Redis, MinIO private health |
| check-disk-usage.sh | all | every 15 min | included in above logs | Disk usage check |

### 1.2 Backup Scripts

| Script | VM | Proposed Frequency | Log Path | Notes |
|--------|----|------------------|---------|------|
| postgres-logical-backup.sh | sekhem-data-01 | daily 02:00 | /opt/sekhem/runtime/logs/postgres-backup.log | server-local, dry-run tested |
| n8n-db-backup.sh | sekhem-data-01 | daily 02:15 | /opt/sekhem/runtime/logs/n8n-db-backup.log | server-local, .env excluded |
| n8n-runtime-metadata-backup.sh | sekhem-automation-01 | daily 02:30 | /opt/sekhem/runtime/logs/n8n-runtime-backup.log | .env excluded |
| backend-metadata-backup.sh | sekhem-app-01 | daily 02:45 | /opt/sekhem/runtime/logs/backend-metadata-backup.log | .env & secrets excluded |

## 2. Retention Policy

- Health logs: 14 days
- Backup logs: 30 days
- Backup archives: 90 days or per PM policy
- Ensure no secrets written to logs

## 3. Failure Handling

- Health script failure: alert admin, retain logs, no automatic restart
- Backup script failure: alert admin, retain partial backup, do not overwrite existing backup
- Manual intervention required for restore

## 4. Disable/Rollback Procedure

- For cron entries: remove or comment out scheduled entries
- For systemd timers: `sudo systemctl disable --now <timer_name>`
- Validate: `crontab -l` or `systemctl list-timers | grep sekhem`
- No script execution required for rollback

## 5. Docker Image Pinning Proposal

- Record current container images and tags:
  - n8nio/n8n:latest
  - postgres:16-alpine
  - redis:7-alpine
  - minio/minio:latest
- Pin future updates to immutable tags or digest
- Pull only after PM approval
- Health validation post-update required

## 6. Validation Checklist (Documentation-only)

- Scripts exist on server paths
- Permissions root-owned/restricted
- No secrets in docs
- No cron/systemd timers created
- Dry-run/manual validation was done (Batch 1 & 2)
- Logs path defined
- Frequency defined
- Retention policy defined
- Failure handling defined
- Disable/rollback procedure defined
- Docker images inventory/pinning plan defined

## 7. QA Gate

QA to verify:
1. Documentation only, no execution performed
2. One Markdown file
3. Paths, scripts, logs defined and correct
4. Frequency, retention, failure handling, rollback defined
5. Docker pinning plan documented only
6. No secrets or credentials included
7. No public exposure
8. No cron or timers actually created

---

Safety confirmation: Documentation only, no runtime changes, no services restarted, no backups executed, no Docker or firewall changes.