# Stage 2 Post-Reboot Resilience Hardening Runbook

Status: PLAN / RUNBOOK ONLY. No runtime execution performed.

Source of truth reviewed first:

- `docs/pm-handoffs/stage-2-tasker-instructions.md` from latest `main`
- `docs/pm-handoffs/post-reboot-resilience-incident-report.md` from latest `main`

This runbook prepares the implementation plan for post-reboot resilience hardening after a real ESXi/host reboot incident. It does not execute a reboot, change runtime services, change firewall rules, run Docker changes, expose services publicly, mutate databases, run migrations, or activate any n8n workflow.

---

## 1. Objective

Make unattended reboot/power-loss recovery reliable for the current Stage 2 private runtime.

The hardening target is to prevent the two failure patterns observed during the incident:

1. Nginx on `sekhem-app-01` starting before the Tailscale IP `100.74.93.25` exists.
2. n8n on `sekhem-automation-01` starting before PostgreSQL on `100.125.158.124:5432` is reachable.

The runbook also covers ESXi VM auto-start ordering and health script cleanup.

---

## 2. Current runtime facts

Current private runtime:

- `sekhem-data-01` — Tailscale IP `100.125.158.124`
- PostgreSQL: `100.125.158.124:5432`
- Redis: `100.125.158.124:6379`
- MinIO API: `100.125.158.124:9000`
- MinIO Console: `100.125.158.124:9001`
- `sekhem-automation-01` — Tailscale IP `100.72.37.105`
- n8n private listener: `100.72.37.105:5678`
- `sekhem-app-01` — Tailscale IP `100.74.93.25`
- Backend process binds only to `127.0.0.1:3001`
- Backend private Nginx listener: `100.74.93.25:8080`
- Backend private health: `http://100.74.93.25:8080/api/health`
- Admin Tailscale IP: `100.89.249.75`

---

## 3. Incident lessons

The incident report recorded:

- ESXi/host reboot occurred after power loss.
- VMs did not auto-start after host recovery.
- After manual VM startup, services started before dependencies were ready.
- Nginx failed to bind `100.74.93.25:8080` because the Tailscale IP was not ready.
- n8n entered a crash/restart loop because PostgreSQL on `100.125.158.124:5432` was not yet reachable.
- Runtime was recovered manually and validated.

This proves post-reboot hardening is not optional.

---

## 4. Strict scope

Allowed in this runbook:

- ESXi VM auto-start order design.
- systemd drop-in design.
- wait script design.
- validation commands.
- rollback commands.
- risk notes.
- QA gate.
- controlled validation plan.

Forbidden in this runbook:

- No uncontrolled reboot.
- No host reboot execution.
- No public exposure.
- No DB reset.
- No migrations.
- No `db:push`.
- No `db:seed`.
- No n8n production workflow.
- No R&D Collector execution.
- No AI provider connection.
- No frontend cutover.
- No secrets printed.
- No source-control runtime writes.
- No backup scheduling.
- No restore test.
- No retention deletion.

---

## 5. ESXi VM Auto Start plan

### Required startup order

```text
1. sekhem-data-01
2. sekhem-automation-01
3. sekhem-app-01
```

### Recommended delay

```text
sekhem-data-01: start first
sekhem-automation-01: start 60 seconds after data
sekhem-app-01: start 60 seconds after automation
```

### Reason

- Data services must start before automation.
- n8n depends on PostgreSQL.
- App-facing private listener depends on Tailscale readiness.

### ESXi UI implementation guidance

This is a manual ESXi host setting, not a repo or VM script.

Expected operator path:

```text
ESXi Web UI
→ Host
→ Manage
→ System
→ Autostart
→ Edit Settings
→ Enabled = Yes
→ Configure VM startup order:
   1. sekhem-data-01
   2. sekhem-automation-01
   3. sekhem-app-01
```

### ESXi validation checklist

```text
Auto Start enabled: PASS/FAIL
sekhem-data-01 order=1: PASS/FAIL
sekhem-automation-01 order=2: PASS/FAIL
sekhem-app-01 order=3: PASS/FAIL
Startup delay documented: PASS/FAIL
No public exposure changed: PASS/FAIL
```

---

## 6. Nginx startup guard on `sekhem-app-01`

### Goal

Nginx must start only after Tailscale IP `100.74.93.25` exists locally.

### Proposed wait script path

```text
/opt/sekhem/runtime/wait-for-tailscale-ip.sh
```

### Proposed wait script design

```bash
#!/usr/bin/env bash
set -euo pipefail

REQUIRED_IP="100.74.93.25"
TIMEOUT_SECONDS="120"
SLEEP_SECONDS="2"
ELAPSED="0"

echo "waiting_for_tailscale_ip=${REQUIRED_IP}"

while [ "${ELAPSED}" -lt "${TIMEOUT_SECONDS}" ]; do
  if ip -4 addr show | grep -q "${REQUIRED_IP}/"; then
    echo "tailscale_ip_ready=PASS"
    exit 0
  fi
  sleep "${SLEEP_SECONDS}"
  ELAPSED=$((ELAPSED + SLEEP_SECONDS))
done

echo "tailscale_ip_ready=FAIL"
exit 1
```

### Proposed systemd drop-in path

```text
/etc/systemd/system/nginx.service.d/10-sekhem-wait-tailscale.conf
```

### Proposed drop-in design

```ini
[Unit]
Wants=tailscaled.service
After=network-online.target tailscaled.service

[Service]
ExecStartPre=/opt/sekhem/runtime/wait-for-tailscale-ip.sh
```

### Validation commands design

```bash
sudo systemctl daemon-reload
sudo systemctl cat nginx
sudo systemctl restart nginx
systemctl is-active nginx
sudo ss -tulpn | grep ':8080'
curl -sS -o /tmp/app-health.out -w 'HTTP_CODE=%{http_code}\n' --max-time 10 http://100.74.93.25:8080/api/health
sudo /opt/sekhem/runtime/check-app-health.sh
```

### Expected validation result

```text
nginx_active=PASS
nginx_private_bind=PASS
backend_private_nginx_http_code=200
check-app-health result=PASS
```

---

## 7. n8n startup guard on `sekhem-automation-01`

### Goal

n8n must start only after PostgreSQL on `100.125.158.124:5432` is reachable.

### Proposed wait script path

```text
/opt/sekhem/runtime/wait-for-postgres-route.sh
```

### Proposed wait script design

```bash
#!/usr/bin/env bash
set -euo pipefail

POSTGRES_HOST="100.125.158.124"
POSTGRES_PORT="5432"
TIMEOUT_SECONDS="180"
SLEEP_SECONDS="3"
ELAPSED="0"

echo "waiting_for_postgres=${POSTGRES_HOST}:${POSTGRES_PORT}"

while [ "${ELAPSED}" -lt "${TIMEOUT_SECONDS}" ]; do
  if nc -z -w 3 "${POSTGRES_HOST}" "${POSTGRES_PORT}" >/dev/null 2>&1; then
    echo "postgres_route_ready=PASS"
    exit 0
  fi
  sleep "${SLEEP_SECONDS}"
  ELAPSED=$((ELAPSED + SLEEP_SECONDS))
done

echo "postgres_route_ready=FAIL"
exit 1
```

### Proposed Compose startup wrapper option

Because n8n is managed through Docker Compose, prefer a dedicated systemd oneshot service that starts the Compose runtime only after the route check passes.

Proposed service path:

```text
/etc/systemd/system/sekhem-n8n-compose.service
```

Proposed service design:

```ini
[Unit]
Description=Sekhem n8n Compose Runtime
Wants=network-online.target tailscaled.service docker.service
After=network-online.target tailscaled.service docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/sekhem/automation/n8n
ExecStartPre=/opt/sekhem/runtime/wait-for-postgres-route.sh
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=240
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

### Important implementation note

If this service is adopted, the existing `restart: unless-stopped` behavior inside Docker Compose must be reviewed to avoid two independent startup controllers fighting each other after reboot.

Safe implementation option:

- keep Docker Compose restart policy, but use the systemd service as the boot-time controlled starter only; or
- adjust Compose restart policy in a separate PM-approved batch if needed.

No Compose file change is approved by this plan.

### Validation commands design

```bash
sudo systemctl daemon-reload
sudo systemctl cat sekhem-n8n-compose.service
sudo systemctl start sekhem-n8n-compose.service
cd /opt/sekhem/automation/n8n
sudo docker compose ps
sudo docker inspect --format='{{.Name}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}} status={{.State.Status}} restart={{.HostConfig.RestartPolicy.Name}}' sekhem-n8n
curl -sS -o /tmp/n8n-health.out -w 'HTTP_CODE=%{http_code}\n' --max-time 15 http://100.72.37.105:5678/healthz
sudo /opt/sekhem/runtime/check-automation-health.sh
```

### Expected validation result

```text
postgres_route_ready=PASS
sekhem-n8n status=running
sekhem-n8n health=healthy
n8n private bind=100.72.37.105:5678
n8n health HTTP 200
check-automation-health result=PASS
```

---

## 8. Health script cleanup

### Goal

All health scripts must be Unix-formatted and must handle exit codes cleanly.

Scripts to verify:

```text
/opt/sekhem/runtime/check-disk-usage.sh
/opt/sekhem/runtime/check-app-health.sh
/opt/sekhem/runtime/check-automation-health.sh
/opt/sekhem/runtime/check-data-health.sh
```

### Required cleanup checks

```bash
sudo sed -i 's/\r$//' /opt/sekhem/runtime/check-disk-usage.sh
sudo sed -i 's/\r$//' /opt/sekhem/runtime/check-app-health.sh
sudo sed -i 's/\r$//' /opt/sekhem/runtime/check-automation-health.sh
sudo sed -i 's/\r$//' /opt/sekhem/runtime/check-data-health.sh
sudo bash -n /opt/sekhem/runtime/check-disk-usage.sh
sudo bash -n /opt/sekhem/runtime/check-app-health.sh
sudo bash -n /opt/sekhem/runtime/check-automation-health.sh
sudo bash -n /opt/sekhem/runtime/check-data-health.sh
```

### Runtime validation

```bash
sudo /opt/sekhem/runtime/check-app-health.sh
sudo /opt/sekhem/runtime/check-automation-health.sh
sudo /opt/sekhem/runtime/check-data-health.sh
```

Expected:

```text
result=PASS
no numeric argument required
no CRLF-related failure
```

---

## 9. Controlled validation plan

### Phase 1 — No reboot validation

Run after implementation:

```text
app health: PASS
automation health: PASS
data health: PASS
nginx systemd cat includes wait guard: PASS
n8n systemd cat includes PostgreSQL route guard: PASS
no public exposure: PASS
```

### Phase 2 — VM-level reboot validation

Requires separate PM approval.

Order:

```text
1. reboot sekhem-data-01 only, validate data health
2. reboot sekhem-automation-01 only, validate n8n health
3. reboot sekhem-app-01 only, validate backend/nginx health
```

Expected:

```text
all VMs return to Tailscale
all SSH reachable
all services healthy
no manual intervention required
```

### Phase 3 — ESXi/host reboot validation

Requires separate PM approval and maintenance window.

Expected:

```text
ESXi auto-start order works
sekhem-data-01 starts first
sekhem-automation-01 starts second
sekhem-app-01 starts third
all health scripts PASS
no public exposure
```

---

## 10. Rollback commands design

### Rollback Nginx guard

```bash
sudo rm -f /etc/systemd/system/nginx.service.d/10-sekhem-wait-tailscale.conf
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl restart nginx
systemctl is-active nginx
```

### Rollback n8n systemd wrapper

```bash
sudo systemctl disable --now sekhem-n8n-compose.service || true
sudo rm -f /etc/systemd/system/sekhem-n8n-compose.service
sudo systemctl daemon-reload
cd /opt/sekhem/automation/n8n
sudo docker compose up -d
sudo docker compose ps
```

### Rollback wait scripts

```bash
sudo rm -f /opt/sekhem/runtime/wait-for-tailscale-ip.sh
sudo rm -f /opt/sekhem/runtime/wait-for-postgres-route.sh
```

### Rollback ESXi auto-start

Manual ESXi UI rollback only:

```text
Host → Manage → System → Autostart → disable or adjust VM order
```

Rollback must not reboot the host unless separately approved.

---

## 11. Risk notes

### Nginx risk

If the wait script is wrong, Nginx may not start. Mitigation:

- `nginx -t` before restart.
- `systemctl cat nginx` review.
- rollback drop-in immediately if validation fails.

### n8n risk

If two controllers compete, n8n may restart unexpectedly. Mitigation:

- inspect Compose restart policy.
- keep changes minimal.
- validate with `docker compose ps` and health endpoint.
- avoid Compose file changes unless separately approved.

### ESXi auto-start risk

Wrong startup order may reproduce the incident. Mitigation:

- data first, automation second, app third.
- document delay.
- validate by VM-level reboots before host reboot.

### Health script risk

Formatting issues can cause false FAIL. Mitigation:

- strip CRLF.
- run `bash -n`.
- validate scripts manually.

---

## 12. QA gate

QA must confirm before implementation approval:

1. This is plan/runbook only.
2. No reboot execution is included.
3. No host reboot execution is included.
4. ESXi auto-start order is data → automation → app.
5. Nginx waits for Tailscale IP `100.74.93.25`.
6. n8n waits for PostgreSQL `100.125.158.124:5432`.
7. Health script cleanup covers app, automation, data, and disk scripts.
8. Controlled validation starts with no-reboot validation, then VM-level reboot only after approval, then host reboot only after separate approval.
9. Rollback commands exist.
10. No public exposure is introduced.
11. No DB reset, migration, `db:push`, `db:seed`, frontend cutover, AI provider, R&D Collector execution, or secrets are included.

QA decision expected:

```text
APPROVED FOR PM IMPLEMENTATION REVIEW
```

or

```text
NOT APPROVED — FIX RUNBOOK
```

---

## 13. Explicit safety confirmation

This document is a plan/runbook only.

No uncontrolled reboot was executed.
No host reboot was executed.
No public exposure was introduced.
No DB reset was performed.
No migrations were run.
No `db:push` was run.
No `db:seed` was run.
No n8n production workflow was executed.
No R&D Collector was executed.
No AI provider was connected.
No frontend cutover was performed.
No secrets were printed.
No source-control runtime writes were performed.
