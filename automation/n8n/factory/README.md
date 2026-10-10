# R&D Radar Workflow Factory

Issue ID: 1301  
Owner: Tasker 5

## Purpose

This folder stores reusable n8n workflow factory templates for R&D Radar automation.

The current template standardizes how future manual/internal workflows build sanitized `WorkflowRunSummary` payloads and call the backend callback contract.

## Current Template

- `rd-radar-workflow-factory.template.json`

## Reference Runtime Workflow

- Workflow name: `SEKHEM Production Track - R&D Radar WorkflowRunSummary Contract`
- Workflow ID: `prodTrackRdRadar0520112154`
- Runtime result: HTTP `202`
- `accepted=true`
- `persistence=false`
- Versioned runtime export PR: `#52`

## Backend Callback Contract

- Method/path: `POST /api/rd-radar/workflow-runs`
- Expected result: HTTP `202`
- Expected current behavior: `accepted=true`, `persistence=false`

## Workflow Status/Readiness Contract

Generated workflows must support the customer-safe status language defined in:

`../workflows/rd-radar-workflow-readiness-status.md`

Required customer-safe fields:

- Workflow Summary
- Latest controlled workflow status
- Live data / Sample view
- Last controlled run status
- Callback status
- Readiness status

Customer UI must use `Automation workflow`, `Workflow callback`, `Workflow Summary`, or `Readiness Check`. It must not use the automation vendor/tool name.

## Factory Rules

Any generated workflow must remain:

- manual/internal only.
- inactive by default.
- free of public triggers.
- free of scheduled triggers.
- free of credentials in committed exports.
- free of execution data.
- free of raw runtime output.
- free of raw HTML/raw content.
- free of tokens, auth headers, private credentials, and full response headers.

## Forbidden Without PM Approval

- public trigger.
- scheduled trigger.
- AI provider call.
- GitHub write.
- direct DB write from n8n.
- raw content storage.
- workflow activation.

## Validation Checklist

Before using a workflow generated from this factory:

1. Confirm `active=false`.
2. Confirm manual/internal trigger only.
3. Confirm no public/scheduled trigger.
4. Confirm no credentials in export.
5. Confirm no forbidden nodes.
6. Confirm backend callback route path is approved.
7. Confirm callback result is HTTP `202`.
8. Confirm `accepted=true`.
9. Confirm `persistence=false` unless PM approves guarded persistence activation.
10. Confirm no AI, GitHub write, or direct DB write from n8n.
