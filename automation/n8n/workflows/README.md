# n8n R&D Radar WorkflowRunSummary Contract

## Workflow

- Name: SEKHEM Production Track - R&D Radar WorkflowRunSummary Contract
- Workflow ID: prodTrackRdRadar0520112154
- Contract version: 1.0.0
- Trigger type: manual/internal
- Expected active state: false
- Callback endpoint path: POST /api/rd-radar/workflow-runs

## Readiness/Status Contract

- Status contract: `rd-radar-workflow-readiness-status.md`
- Customer-safe workflow summary label: `Workflow Summary`
- Customer-safe data source labels: `Live data` or `Sample view`
- Latest controlled workflow status: `validated`
- Last controlled run status: `PASS`
- Callback status: HTTP `202`, `accepted=true`, `persistence=false`
- Readiness status: `ready_for_pm_review`
- GitHub readiness: `read-only/demo-safe`

Do not show the automation vendor/tool name, internal IPs, private backend URLs, credentials, raw logs, stack traces, raw output, full headers, or execution internals in customer UI.

## Callback Base URL

The repository export must not hardcode private runtime IP addresses or ports.

Use the environment-provided callback base URL placeholder:

```text
SEKHEM_BACKEND_CALLBACK_BASE_URL
```

The runtime callback URL is resolved as:

```text
${SEKHEM_BACKEND_CALLBACK_BASE_URL}/api/rd-radar/workflow-runs
```

Validated runtime path should be configured outside the repository in the n8n/server environment.

## Expected Backend Response

- HTTP status: 202
- accepted: true
- persistence: false

Current runtime behavior is PASS: backend callback returned HTTP 202, accepted=true, persistence=false.

## Sanitization And Forbidden Actions

This repository artifact is a sanitized workflow export for auditability and recovery only.

Confirmed absent:

- no hardcoded private runtime IP or port
- no secrets
- no credentials
- no execution data
- no raw output
- no full headers
- no tokens
- no public trigger
- no scheduled trigger
- no backend code changes
- no DB writes
