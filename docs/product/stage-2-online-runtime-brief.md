# Stage 2 Online Runtime Brief

## Current Mode

Stage 2 will use online runtime mode.

Air-gap deployment is deferred to a later enterprise mode.

The R&D Collector runs with the normal R&D Radar automation runtime for now.

## Tasker Roles

- Tasker Infra: ESXi, VM sizing, networking, reverse proxy, firewall matrix, runtime placement.
- Tasker 4: backend runtime readiness, PostgreSQL activation plan, API boundaries.
- Tasker 5: workflow and AI Gateway runtime plan.
- Tasker Doc: screenshots, website assets, documentation pack.
- TASKER QA: plan and implementation review.

## Runtime Layout

VM1 App/API/Reverse Proxy:
- frontend if self-hosted
- backend API
- AI Gateway boundary
- reverse proxy

VM2 Automation:
- workflow runtime
- R&D Collector
- job workers

VM3 Data:
- PostgreSQL
- Redis
- object storage
- pgvector
- backups

## Operating Rules

Plan first. Implementation starts only after PM approval.

Connections to real services are allowed later during approved implementation, but configuration must stay outside source files.

No production activation is included in this plan.

## Next Documents

- docs/product/stage-2-infra-runtime-plan.md
- docs/product/stage-2-workflow-architecture.md
- docs/product/stage-2-backend-runtime-plan.md
