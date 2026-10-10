# Sekhem Decision Log

## Current Project Status

- Product Application UI uploaded to GitHub.
- Repository: https://github.com/sekhemaifactory-creator/sekhem-product-application.git
- Branch: main
- Current commit: 272cf05 Initial clean Sekhem product application
- Local working directory: G:\My Drive\Sekhem\MVP\sekhem-product-application

## Product Definition

Sekhem Product Application is a customer-facing application after Phase 1 Activation.

It is NOT:
- public website
- pricing page
- commercial offer
- prototype page

## Main Product Journey

R&D Radar
→ Recommended Initiative
→ Evidence
→ Execution Path
→ AI Technical Memo
→ Tasks / Execution Kanban
→ Sandboxed Code Draft Workspace
→ Security Gate
→ Failure / Blocker Center
→ Release Factory
→ Locked Advanced Modules

## Technology Direction

Frontend:
- Next.js
- React
- TypeScript

Backend:
- NestJS
- TypeScript

Database:
- PostgreSQL

ORM:
- Prisma first unless strong reason for Drizzle

Auth:
- Auth.js initially
- Keycloak later for enterprise/on-prem

Queue / Jobs:
- BullMQ + Redis later

Storage:
- S3-compatible storage later

Knowledge / RAG:
- pgvector first
- Qdrant later if needed

Automation:
- n8n/workflow runtime later, hidden behind backend API

AI:
- AI Gateway routing to OpenAI / Claude / future local model

## Customer-facing Terminology Rule

Customer UI must NOT expose vendor/tool names.

Forbidden in customer UI:
- GitLab
- GitHub
- n8n
- OpenAI
- Claude
- OpenHands
- PostgreSQL
- Redis
- MinIO
- Qdrant

Approved replacements:
- Source Control Platform
- Repository Control
- Automation Engine
- Workflow Runtime
- External AI Provider
- Self-hosted Code Runner
- Data Store
- Cache Layer
- Artifact Storage
- Knowledge Index

## AI Governance Rule

AI assists, plans, drafts, and explains.

Humans approve, reject, merge, deploy, and accept risk.

No automatic merge.
No automatic deployment.
No production modification.
No AI replacement of engineers.

## Current Stage

Stage 0 — Clickable Product Application UI
Status: GitHub uploaded, build/preview/Vercel validation pending.

Next:
Stage 1 — Backend Skeleton
Stage 2 — Workflow Automation / n8n / AI Gateway
Stage 3 — RAG / Knowledge Layer
Stage 4 — Code Runner / OpenHands later

## Package Manager Decision

Decision:
pnpm is the official package manager for Sekhem Product Application.

Reason:
npm failed on the Windows/PowerShell environment with:
"Exit handler never called!"

Tasker 1 validated that pnpm install, TypeScript check, build, and lint are working.

Commands:
pnpm install
pnpm exec tsc --noEmit
pnpm run build
pnpm run lint

Impact:
Vercel must use pnpm.
Future setup docs must use pnpm.
npm should not be used for this project unless the environment is intentionally changed.

## Tasker 1 Role Decision

Decision:
Tasker 1 is confirmed as the UI Owner + Build / Preview / Vercel owner.

Reason:
Tasker 1 originally built the Sekhem Product Application UI with v0 and is the most aware of the current UI structure, navigation, routes, and visual decisions.

Scope:
Tasker 1 may work on:
- UI/UX polish
- Navigation polish
- Route fixes
- Product wording cleanup
- Profile/user dropdown polish
- New Initiative / New Program Workspace UI alignment
- Build validation
- Preview validation
- Vercel readiness
- Tasker 1 handoff updates

Branching rule:
- main remains the stable baseline.
- Any UI/UX code changes must happen on a feature branch, such as:
  feature/ux-navigation-polish
- Handoff-only updates may be committed normally if coordinated.
- No merge to main without PM approval.

Restrictions:
- No backend.
- No database.
- No real integrations.
- No pricing inside product UI.
- No vendor/tool names in customer-facing UI.
- No force push.

## Tasker QA Role Decision

Decision:
Add TASKER QA as the quality review and cross-check owner.

Role:
TASKER QA reviews outputs from Tasker 1, Tasker Doc, Tasker 4, and Tasker 5 before PM approval.

Primary responsibility:
- Review whether Tasker 4 backend contract is correct.
- Check if API Contract matches the actual Product Application UI journey.
- Check if DB schema draft supports the UI.
- Check if Mock-to-API Mapping is complete.
- Check if backend plan is safe before Codex implementation.
- Identify gaps, risks, wrong assumptions, missing endpoints, missing entities, and over-engineering.
- Answer PM questions with a clear approve / reject / needs-fix recommendation.

TASKER QA does not implement code.
TASKER QA does not edit UI.
TASKER QA does not create backend.
TASKER QA does not change architecture without PM approval.

Assigned handoff file:
docs/pm-handoffs/tasker-qa-review-report.md

## Backend Batch 1 Execution Decision

Decision:
TASKER QA approved Tasker 4 backend contract for Backend Batch 1 implementation.

Execution model:
Use ChatGPT Tasker 4 first as the backend execution owner to prepare the implementation plan, file structure, code content, and validation commands.

Codex should only be used if direct repository coding is required or if manual patch execution becomes inefficient.

Credit-control rule:
- Do not use Codex for planning.
- Do not use Codex for repeated exploratory prompts.
- Use Codex only for the approved Backend Batch 1 implementation.
- Keep Codex scope limited to `/backend`.
- No frontend/UI changes.
- No real integrations.

Approved Backend Batch 1 scope:
- `/backend` only
- NestJS + TypeScript
- In-memory seed services only
- Read-only REST endpoints only
- DTOs
- Thin controllers
- Service layer
- Consistent response wrapper
- README
- `.env.example`
- No real database connection
- No Prisma migrations
- No Auth.js
- No Keycloak
- No n8n
- No real AI
- No RAG
- No GitHub/GitLab/source-control integration
- No OpenHands
- No production access
- No secrets
- No write actions

Implementation branch:
feature/backend-skeleton-batch-1

Review flow:
Tasker 4 executes or manages Codex.
Tasker 4 updates backend handoff.
TASKER QA reviews implementation.
PM approves merge only after QA approval.
