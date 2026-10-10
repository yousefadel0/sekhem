# What is real today

Owner: Engineering Lead · Last verified: 2026-09-02

The deployed baseline entering this program was GitHub, Backend, and Vercel SHA `6a90f1419e6806778216dcb07d5db362cbd02a3a`, with Backend health 200 on local/private/public paths. No Production change is implied by this document.

`PRODUCTION_LIVE`: cookie authentication/RBAC, persisted AI Gateway provider/model/repository configuration, bounded read-only repository snapshots, llama.cpp structured output, R&D analysis persistence, evidence/candidate creation, and safe diagnostics. Accepted Production evidence records one successful `REVIEW_REQUIRED` R&D cycle with schema/citations passing, five Evidence records, a candidate, and no repository writes.

`PARTIAL`: product workflow writes, workflow callback runtime, AI Patch drafts, Knowledge Base, approvals, and operational dashboards. Some paths use memory or a subset of the Prisma schema.

`MOCK_OR_FALLBACK`: RAG answer preview, AI preview stubs, and many legacy demo datasets. They are not Production AI execution.

`UI_ONLY`: several `/demo/*` pages and locked advanced-module journeys.

`PLANNED`: DB-backed multi-user/tenant authentication, full workflow orchestration, complete monitoring/backups, GitLab canonical hosting, and automated Production promotion.

Operational `/demo/admin-settings`, `/demo/rd-radar`, `/demo/ai-patch-assistant`, and `/demo/knowledge-base` routes require authenticated roles. Other `/demo/*` routes are public demonstrations and receive a visible `DEMO DATA` banner.
