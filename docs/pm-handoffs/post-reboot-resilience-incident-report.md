# Post-Reboot Resilience Incident Report

## Decision

```text
APPROVED — CLOSE INCIDENT
OPEN HARDENING BATCH — POST-REBOOT RESILIENCE
```

## Incident status

```text
RECOVERED
```

## Root cause

ESXi/host reboot occurred after power loss.

Primary failure pattern:

- VMs did not auto-start after host recovery.
- After manual VM startup, some services started before their required network/runtime dependencies were ready.

## Specific issues observed

### 1. Nginx startup race on `sekhem-app-01`

Nginx started before Tailscale IP `100.74.93.25` was ready.

Result:

- Nginx failed to bind private listener `100.74.93.25:8080`.

### 2. n8n startup race on `sekhem-automation-01`

n8n started before PostgreSQL / Tailscale route to `sekhem-data-01` was stable.

Required dependency:

- PostgreSQL on `100.125.158.124:5432`

Result:

- n8n entered crash/restart loop.

### 3. Health script cleanup required

Health scripts required cleanup/fix after recovery.

Result:

- Automation health script was fixed and validated.

## Recovery validation

```text
PASS
```

Final evidence:

```text
sekhem-n8n Up 4 minutes (healthy)
100.72.37.105:5678->5678/tcp
n8n_container_health=healthy
n8n_private_bind=PASS
n8n_http_health=PASS
result=PASS
```

## Component recovery status

```text
Tailscale Windows client: PASS
sekhem-app-01 SSH: PASS
sekhem-automation-01 SSH: PASS
sekhem-data-01 SSH: PASS
Backend service: PASS
Nginx private listener: PASS
Backend health: PASS
PostgreSQL: PASS
Redis: PASS
MinIO: PASS
n8n container: PASS
n8n private bind: PASS
n8n health: PASS
Health scripts: PASS after automation script fix
```

## Recovery actions completed

- Windows Tailscale validated.
- All three VMs restored online.
- App Nginx manually started after Tailscale IP was ready.
- Backend private health validated.
- Data services validated healthy.
- n8n container clean recreated after PostgreSQL route was confirmed.
- Automation health script fixed and validated.

## Security review

```text
PASS
```

Confirmed:

- No public exposure introduced.
- Backend remains private.
- n8n remains private.
- Data services remain private.
- No DB reset.
- No migrations.
- No `db:push`.
- No `db:seed`.
- No frontend cutover.
- No AI provider.
- No R&D Collector execution.
- No source-control runtime writes reported.
- No secrets reported.

## QA assessment

The incident was recovered fully. Current runtime health is acceptable.

However, this incident exposed a real resilience gap:

```text
the system is not yet safe against unattended reboot/power-loss recovery.
```

Power loss is not theoretical anymore. It happened.

## Required hardening batch

```text
POST-REBOOT RESILIENCE HARDENING
Priority: HIGH
```

### 1. ESXi Auto Start

Enable VM auto-start order:

```text
data → automation → app
```

Reason:

- Data services must be online before n8n.
- Private network dependencies must stabilize before app-facing private listeners.

### 2. Nginx startup dependency/wait

Add startup guard so Nginx starts only after Tailscale IP exists:

```text
100.74.93.25
```

Reason:

- Nginx private listener depends on the Tailscale interface/IP being ready.

### 3. n8n startup guard

Add startup guard so n8n starts only after PostgreSQL route is reachable:

```text
100.125.158.124:5432
```

Reason:

- n8n depends on PostgreSQL backend on `sekhem-data-01`.

### 4. Script cleanup

Clean CRLF / numeric-exit issues in app/data/automation health scripts if still present.

Reason:

- Health scripts must be reliable after reboot and not fail due to formatting or exit-code handling.

### 5. Controlled reboot validation

After PM approval only:

- controlled reboot of VMs or host
- verify auto-start order
- verify Tailscale readiness
- verify Nginx private bind
- verify n8n startup
- verify backend health
- verify PostgreSQL/Redis/MinIO health
- verify health timers/scripts
- verify no public exposure

## Forbidden without PM approval

- no uncontrolled reboot test
- no production-like exposure
- no public API
- no DB reset
- no migration
- no `db:push`
- no `db:seed`
- no n8n production workflow
- no R&D Collector execution
- no AI provider
- no frontend cutover
- no source-control runtime writes
- no secrets printed

## Next task recommendation

Tasker Infra should prepare the Post-Reboot Resilience Hardening implementation plan/runbook first, then execute only after PM approval.

Do not bundle this with R&D Collector execution or backup scheduling.
