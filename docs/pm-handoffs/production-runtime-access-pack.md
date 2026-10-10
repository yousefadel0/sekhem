# SEKHEM — Production Runtime Access Pack

## Purpose

This file gives taskers the technical runtime map needed for safe production-readiness diagnosis and execution.

This file must contain **technical locations only**, not secrets.

It supports:

- Tasker 4 backend / PostgreSQL diagnosis.
- Infra environment checks.
- QA validation.
- Safe copy-paste command preparation.
- No-Codex-first execution.

## Security Rule

Never store secrets in this file.

Forbidden values:

- passwords.
- private keys.
- API keys.
- tokens.
- cookies.
- full connection strings.
- full `DATABASE_URL` values.
- `.env` contents.
- provider credentials.
- SSH private key contents.

Allowed values:

- environment names.
- server aliases.
- server host/IP if approved by PM for private project sources.
- SSH username.
- SSH port.
- whether an SSH key is required.
- local SSH key path on PM/operator machine, without key contents.
- repository paths.
- backend/frontend paths.
- env file paths only.
- service names.
- database type, host alias, DB name if safe, and DB user if safe.
- safe command policy.

## Access Scope

This file is for approved SEKHEM production taskers only.

Approved roles:

- PM / Doctor Amr.
- Infra.
- Tasker 4.
- QA.
- Other taskers only when explicitly approved.

## Project Entry Links

Use these locations first. Do not guess an alternative repository, tracker, or runtime endpoint.

| Purpose | Actual project location | Notes |
| --- | --- | --- |
| GitHub repository | `https://github.com/sekhemaifactory-creator/sekhem-product-application` | Primary source repository |
| GitHub main branch | `https://github.com/sekhemaifactory-creator/sekhem-product-application/tree/main` | Refresh before starting work |
| Production execution board | `https://docs.google.com/spreadsheets/d/1DA-B5g1ifzy8xZCQKAHNgPEDsUel-_8AGK_KQ0pDhSU/edit` | Live `production plan` board for PROD tasks |
| Master Action Plan | `https://docs.google.com/spreadsheets/d/1JHX9CYf4NxUj7OkSKIvClCMWzIx7wRR0nCQomdzTXto/edit` | General tracker referenced by PM operating rules |
| Production plan | `docs/product/production-plan.md` | PROD epic and board operating rules |
| Production release directive | `docs/pm-handoffs/production-runtime-release-directive.md` | Production scope and gates |
| Production execution model | `docs/pm-handoffs/production-execution-operating-model.md` | Tasker workflow and blockers |
| Stage 2 tasker instructions | `docs/pm-handoffs/stage-2-tasker-instructions.md` | Stage 2 runtime facts and gates |
| PM operating rules | `docs/pm-handoffs/current-pm-operating-rules.md` | Branch, merge, and runtime decisions |
| Ownership map | `docs/pm-handoffs/sekhem-tasker-ownership-map.md` | Tasker ownership boundaries |
| Backend API freeze | `docs/product/backend-api-freeze.md` | Approved backend contract reference |
| n8n workflow factory | `automation/n8n/factory/` | Reusable workflow templates only |
| n8n workflow contracts | `automation/n8n/workflows/` | Controlled workflow contract files |
| Backend private health | `http://100.74.93.25:8080/api/health` | Private/Tailscale runtime only |
| n8n private listener | `http://100.72.37.105:5678` | Private/Tailscale runtime only |

## Environment Inventory

| Environment | Purpose | Status | Notes |
| --- | --- | --- | --- |
| Local | developer/local validation | Available | Repository root; backend defaults to `http://localhost:3001/api` |
| Staging / private Stage 2 runtime | production-readiness validation | Documented private runtime | Primary target before production; Tailscale/private only |
| Production | final production runtime | Not documented / not approved | No direct changes without PM approval |

## Server Access Map

### Private Stage 2 Node Map

| Node | Tailscale IP | Primary purpose | Primary runtime location |
| --- | --- | --- | --- |
| `sekhem-app-01` | `100.74.93.25` | Backend app and private Nginx listener | `/opt/sekhem/app/repo` |
| `sekhem-automation-01` | `100.72.37.105` | Private n8n automation runtime | `/opt/sekhem/automation/n8n` |
| `sekhem-data-01` | `100.125.158.124` | PostgreSQL, Redis, and MinIO private data services | `/opt/sekhem/data-services` |
| Admin workstation | `100.89.249.75` | Approved private administration source | Operator-managed |

### Staging Server

| Field | Value |
| --- | --- |
| Server alias | `sekhem-app-01` |
| Hostname / IP | `100.74.93.25` |
| SSH user | TBD - not documented in repository |
| SSH port | TBD - not documented in repository |
| SSH key required | TBD - not documented in repository |
| SSH key local path | TBD - operator-machine value, not documented in repository |
| Allowed access users | PM / Infra / approved taskers |
| Notes | Private/Tailscale app runtime. Backend health: `http://100.74.93.25:8080/api/health`. No secrets in this table. |

### Production Server

| Field | Value |
| --- | --- |
| Server alias | TBD - production runtime not documented or approved |
| Hostname / IP | TBD - production runtime not documented or approved |
| SSH user | TBD |
| SSH port | TBD |
| SSH key required | TBD |
| SSH key local path | TBD |
| Allowed access users | PM / Infra only unless approved |
| Notes | No production action without PM go/no-go |

## Repository Runtime Paths

### Staging Paths

| Component | Path |
| --- | --- |
| Main repository path | `/opt/sekhem/app/repo` |
| Backend path | `/opt/sekhem/app/repo/backend` |
| Frontend path | `/opt/sekhem/app/repo` |
| Workflow / n8n path | `/opt/sekhem/automation/n8n` |
| Deployment scripts path | No approved deployment scripts path. Health/runtime scripts: `/opt/sekhem/runtime/health` |
| Logs path | `/opt/sekhem/runtime/logs` |
| Artifact storage mount/path | Backups: `/opt/sekhem/backups`; isolated restore inspection only: `/opt/sekhem/restore-test/*` |

### Production Paths

| Component | Path |
| --- | --- |
| Main repository path | TBD |
| Backend path | TBD |
| Frontend path | TBD |
| Workflow / n8n path | TBD |
| Deployment scripts path | TBD |
| Logs path | TBD |
| Artifact storage mount/path | TBD |

## Runtime Configuration Locations

Do not print the content of any file listed here.

| Environment | Config type | Path / location | Notes |
| --- | --- | --- | --- |
| Staging | Backend env file | `/etc/sekhem/backend.env` | Path only; repository docs specify `600 root:root` |
| Staging | Frontend env/config | TBD - not documented | Path only |
| Staging | Docker compose file | `/opt/sekhem/automation/n8n` working directory | n8n uses `docker compose`; exact filename not documented |
| Staging | PM2 ecosystem file | Not documented / not approved | If applicable |
| Staging | Systemd service file | `/etc/systemd/system/sekhem-n8n-compose.service` | n8n controlled starter path |
| Staging | Nginx config | `/etc/nginx/sites-available/sekhem-backend-private` | Private backend listener |
| Production | Backend env file | TBD | Path only |
| Production | Frontend env/config | TBD | Path only |
| Production | Docker compose file | TBD | If applicable |
| Production | PM2 ecosystem file | TBD | If applicable |
| Production | Systemd service file | TBD | If applicable |
| Production | Nginx config | TBD | If applicable |

## Runtime Services

| Environment | Service | Name / command alias | Notes |
| --- | --- | --- | --- |
| Staging | Backend service | Backend process on `127.0.0.1:3001`; private Nginx listener on `100.74.93.25:8080` | No restart without approval if state-changing |
| Staging | Frontend service | Repository root frontend; exact runtime service name not documented | No deploy without approval |
| Staging | Workflow service | `sekhem-n8n`; controlled starter `/etc/systemd/system/sekhem-n8n-compose.service` | No public trigger without approval |
| Staging | Database service | PostgreSQL `100.125.158.124:5432`; Redis `100.125.158.124:6379`; MinIO `100.125.158.124:9000` | No writes/migrations for diagnosis |
| Production | Backend service | TBD | PM approval required |
| Production | Frontend service | TBD | PM approval required |
| Production | Workflow service | TBD | PM approval required |
| Production | Database service | TBD | PM approval required |

## Database Runtime Map

### Staging Database

| Field | Value |
| --- | --- |
| DB type | PostgreSQL |
| Host alias / hostname | `sekhem-data-01` / `100.125.158.124` |
| Port | `5432` |
| Database name | TBD - not documented safely |
| Database user | TBD - not documented safely |
| DATABASE_URL location | `/etc/sekhem/backend.env` path only |
| Migration policy | Additive only; no reset |
| Write policy | No writes during read-only diagnosis |

### Production Database

| Field | Value |
| --- | --- |
| DB type | PostgreSQL |
| Host alias / hostname | TBD |
| Port | TBD |
| Database name | TBD |
| Database user | TBD |
| DATABASE_URL location | TBD path only |
| Migration policy | Additive only after PM approval |
| Write policy | No writes without explicit PM approval |

## Approved Runtime Flags

Fill actual flag names and approved values only. Do not include secrets.

| Flag | Approved value | Environment | Notes |
| --- | --- | --- | --- |
| SEKHEM_RUNTIME_MODE | `memory` or PM-approved `postgres_read` | Staging | Code allowlist only; confirm active server value without printing secrets |
| SEKHEM_DATA_SOURCE | `memory` or PM-approved `postgres_read` | Staging | Must match runtime mode |
| SEKHEM_DB_WRITE_MODE | `none` by default; `rd_radar_only` only when separately PM-approved | Staging | Guarded mode only |
| SEKHEM_DB_MIGRATIONS_ALLOWED | `false` | Staging/Production | Runtime rejects migration activation |
| SEKHEM_DB_SEED_ALLOWED | `false` | Staging/Production | Runtime rejects seed activation |
| SEKHEM_ALLOW_EXTERNAL_ADAPTERS | `false` | Staging/Production | Runtime rejects broad external adapter activation |

## Safe Diagnosis Command Policy

Taskers may request copy-paste commands only if they fit the production execution operating model.

Allowed categories:

- current working directory checks.
- repository branch/status/diff checks.
- last commit checks.
- dependency version checks.
- non-deploying lint/test/build checks.
- schema validation commands that do not write or migrate.
- service status checks that do not restart services.
- health checks that do not expose secrets.

Forbidden categories without explicit PM approval:

- destructive delete or cleanup.
- database reset.
- destructive migration.
- direct database write.
- printing env files or secret values.
- production restart.
- deployment.
- public exposure.
- AI provider activation.
- public webhook activation.
- GitHub push, force-push, automatic PR, automatic merge, or product-runtime GitHub write action.

## PROD-01.001 Runtime Access Requirements

For `PROD-01.001`, Tasker 4 needs only:

- target environment name.
- server alias/IP/hostname.
- SSH user and port.
- repository path.
- backend path.
- backend env file path only.
- database config location only.
- approved runtime flag names and intended values.
- service names if status check is required.

Tasker 4 must not ask for:

- passwords.
- full `DATABASE_URL`.
- full `.env` contents.
- private key contents.
- provider credentials.

## Completion Evidence Format

When a task uses this access pack, report:

```text
Issue ID:
Environment used:
Server alias:
Paths used:
Config locations checked without printing values: yes/no
Runtime flags confirmed without secrets: yes/no
DB target confirmed without secrets: yes/no
Commands requested/run:
Evidence summary:
Forbidden actions check: PASS / FAIL
Google Sheet row updated: yes/no
```

## Maintenance Rule

This file must be updated when:

- server location changes.
- repository path changes.
- service name changes.
- env/config location changes.
- runtime flags change.
- DB target changes.
- deployment topology changes.

No tasker may guess runtime paths, server names, DB target, or config locations. If missing, the task is BLOCKED until this file is updated.
