# Tasker 1 Build / Preview Report

## Tasker Name
Tasker 1 - UI Owner + Build / Preview / Vercel

## Branch Name
feature/ux-navigation-polish

## Milestone Completed
Focused UX/navigation polish update for the Sekhem Product Application shell.

## UI Changes Made
- Replaced customer-facing user identity with Michael Carter / MC while keeping Technical Director and Enterprise Admin.
- Made profile dropdown actions route to Admin / Settings and Sign Out route to `/login`.
- Added View All Programs and New Program Workspace actions to the program selector.
- Added a mock New Program Workspace dialog with Enterprise Admin permission messaging and draft confirmation.
- Added Command Center CTAs for New Initiative and New Program Workspace.
- Added R&D Radar Submit New Initiative CTA.
- Updated `/demo/initiatives/new` wording to New Initiative Intake and adjusted submit button copy.
- Added Create Program Workspace to the Admin / Settings permission matrix with Enterprise Admin as the only full permission role.
- Added `/demo/support` mock Support Center route.
- Added top-bar Ask Sekhem Assistant button wired to the existing mock assistant panel.

## Files Changed
- `app/demo/admin-settings/page.tsx`
- `app/demo/command-center/page.tsx`
- `app/demo/initiatives/new/page.tsx`
- `app/demo/layout.tsx`
- `app/demo/rd-radar/page.tsx`
- `app/demo/support/page.tsx`
- `components/demo/new-program-workspace-dialog.tsx`
- `components/demo/sidebar.tsx`
- `components/demo/top-bar.tsx`
- `components/sekhem/top-bar.tsx`
- `lib/demo-data.ts`
- `docs/pm-handoffs/tasker-1-build-preview-report.md`

## Commands Run
- `git status --short`
- `git branch --show-current`
- `pnpm exec tsc --noEmit`
- `pnpm run build`
- `pnpm run lint`

## Validation Results
- TypeScript: Pass.
- Build: Pass. `/demo/support` and `/login` included in generated routes.
- Lint: Pass with 0 errors. Existing warnings remain acceptable.

## Remaining Issues
- Existing lint warnings remain in unrelated files for unused imports and unused variables.
- Pre-existing uncommitted `docs/pm-handoffs/decision-log.md` change was left untouched and is not part of this task.

## Next Step
Ready for Codex review and product-owner walkthrough.

## Ready for Codex Review
Yes.

## Vercel Preview Author Note

The previous preview retrigger commit was removed to keep branch history clean.
Future preview-triggering commits must be authored by:

- Git user.name: sekhemaifactory-creator
- Git user.email: sekhem.ai.factory@gmail.com

No empty commit should be used for preview triggering.
Any Vercel preview retrigger must include a real documentation or UI update.

---

# Backend Discovery Package for Tasker 4

## Purpose

This package is prepared to unblock Tasker 4.

Tasker 4 cannot start backend implementation safely without understanding the actual UI routes, screens, mock data, and UI-to-backend expectations.

This package gives Tasker 4 a backend-facing map of the current Sekhem Product Application UI.

---

## 1. Route Inventory

### Root / Access

| Route | Purpose |
|---|---|
| `/` | Root entry / product access entry |
| `/login` | Secure access gate / mock login |

### Product Application Routes

| Route | Purpose |
|---|---|
| `/demo/overview` | Product application overview |
| `/demo/command-center` | Operational command center |
| `/demo/rd-radar` | R&D Radar and recommended initiatives |
| `/demo/initiatives` | Initiatives list |
| `/demo/initiatives/new` | New Initiative Intake |
| `/demo/initiatives/[id]` | Initiative workspace/detail |
| `/demo/initiatives/evpn-bgp-validation-pack` | EVPN BGP Validation Pack initiative |
| `/demo/code-draft-demo` | Sandboxed Code Draft Workspace |
| `/demo/security-gate` | Security Gate |
| `/demo/failure-blocker-center` | Failure / Blocker Center |
| `/demo/release-factory` | Release Factory |
| `/demo/locked-advanced-modules` | Locked Advanced Modules hub |
| `/demo/locked-advanced-modules/[slug]` | Locked module detail |
| `/demo/admin-settings` | Admin / users / roles / permissions |
| `/demo/support` | Support Center |
| `/demo/infrastructure-health` | Infrastructure Health |
| `/demo/repo-intelligence` | Repository Intelligence |
| `/demo/workflow-manager` | Workflow Manager |
| `/demo/knowledge-base` | Knowledge Base |
| `/demo/agent-war-room` | Agent War Room |
| `/demo/ai-cto` | AI CTO / Technical Planner |
| `/demo/ai-patch-assistant` | AI Patch Assistant preview |
| `/demo/audit-approvals` | Audit and approvals |

---

## 2. Main Product Journey

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

---

## 3. Core UI Screens

### Command Center

Backend needs:
- project/program dashboard summary
- active initiatives
- pending approvals
- open blockers
- security status
- release readiness
- activity feed

Future endpoint:
`GET /api/projects/:id/dashboard`

---

### R&D Radar

Backend needs:
- recommended initiatives
- R&D signals
- evidence sources
- business value
- technical risk
- recommended safe path

Future endpoint:
`GET /api/initiatives`

Main seed initiative:
`EVPN BGP Validation Pack`

---

### Initiative Workspace

Backend needs:
- initiative detail
- overview
- evidence
- execution path
- AI technical memo
- tasks / kanban
- activity trace
- blockers
- approvals
- security gate status
- release candidate status

Future endpoints:
- `GET /api/initiatives/:slug`
- `GET /api/initiatives/:id/activity`
- `GET /api/initiatives/:id/tasks`

---

### Sandboxed Code Draft Workspace

Backend needs:
- code draft metadata
- safe artifact list
- simulated branch status
- human review state
- CI/security preview status

Safe artifacts:
- `evpn_bgp_reference_topology.md`
- `evpn_bgp_config_template.yaml`
- `evpn_bgp_test_cases.yaml`
- `validate_evpn_bgp_logs.py`

Rules:
- no production repository modification
- no automatic merge
- no automatic deployment
- no SONiC core / FRR / SWSS / SAI / platform driver changes
- human engineering review required

---

### Security Gate

Backend needs:
- secrets scan status
- license check status
- policy check status
- SBOM status
- external dependency warning
- risk score
- blocked / passed status
- human approval gate

Future endpoint:
`GET /api/security-gates/:id`

---

### Failure / Blocker Center

Backend needs:
- blocker list
- type
- cause
- severity
- owner
- evidence
- suggested action
- next step
- rollback option
- AI fix attempts
- human review requirement

Required blocker types:
- Design Error
- Code Error
- Permission Error
- Dependency Error
- Security Gate Failed
- Lab Validation Failed
- Low AI Confidence
- Missing Approval

Business rule:
Max AI fix attempts = 2.
After that = Human review required.

Future endpoint:
`GET /api/blockers`

---

### Release Factory

Backend needs:
- release candidate
- artifacts
- SHA256
- release notes
- rollback plan
- approval checklist
- human approval required

Future endpoint:
`GET /api/release-candidates/:id`

---

### Locked Advanced Modules

Locked modules:
- Deep NOS Implementation
- Hardware Lab Automation
- Self-hosted Code Runner
- Local LLM Server
- OpenWiFi Extension
- Advanced Security Compliance
- Annual Update Package

Backend needs:
- module slug
- status
- activation requirement
- infrastructure requirement
- hardware/GPU/lab requirement
- approval requirement

Future endpoints:
- `GET /api/modules`
- `GET /api/modules/:slug`

---

## 4. Expected Mock / Static Data Areas

Tasker 4 should inspect these likely areas:

- `app/demo/*`
- `components/demo/*`
- `lib/demo-data.ts`
- `lib/sekhem-data.ts`

Expected data groups:
- programs / project selector
- dashboard KPIs
- recommended initiatives
- initiative detail data
- evidence sources
- execution path options
- tasks / kanban
- activity timeline
- blockers
- security gate checks
- release candidates
- artifacts
- locked modules
- users / roles / permissions

---

## 5. UI-to-Backend Mapping Draft

| UI Area | Future Endpoint |
|---|---|
| Dashboard / Command Center | `GET /api/projects/:id/dashboard` |
| Modules | `GET /api/modules` |
| Initiatives List | `GET /api/initiatives` |
| Initiative Detail | `GET /api/initiatives/:slug` |
| Activity Timeline | `GET /api/initiatives/:id/activity` |
| Tasks / Kanban | `GET /api/initiatives/:id/tasks` |
| Approvals | `GET /api/approvals` |
| Security Gate | `GET /api/security-gates/:id` |
| Blockers | `GET /api/blockers` |
| Release Candidate | `GET /api/release-candidates/:id` |

---

## 6. Customer-Facing Terminology Rules

Forbidden in customer-facing UI/API responses:
- Demo
- MVP
- Prototype
- Fake
- Pricing
- Commercial offer
- GitHub
- GitLab
- n8n
- OpenAI
- Claude
- OpenHands
- PostgreSQL
- Redis
- MinIO
- Qdrant
- AI decides
- AI approves
- AI deploys
- AI replaces engineers

Approved labels:
- Product Application
- Phase 1 Activation
- AI Technical Planner
- AI CTO Assistant
- Human Approval Required
- Source Control Platform
- Automation Engine
- Workflow Runtime
- External AI Provider
- Self-hosted Code Runner
- Data Store
- Cache Layer
- Artifact Storage
- Knowledge Index
- Sandboxed Workspace
- Limited Preview
- Locked Add-on
- Advanced Package

---

## 7. Build / Preview Report

Package manager:
`pnpm`

Known validation status from Tasker 1:
- `pnpm install`: PASS
- `pnpm exec tsc --noEmit`: PASS
- `pnpm run build`: PASS
- `pnpm run lint`: PASS with warnings only
- `pnpm dev`: PASS

Dev URL:
`http://localhost:3000`

Branch:
`feature/ux-navigation-polish`

Main:
stable baseline

---

## 8. Backend Blocker Resolution

This package is intended to unblock Tasker 4 so he can produce:

- API Contract v1
- DB Schema Draft
- Mock-to-API Mapping
- First Backend Batch Plan

Tasker 4 should still not implement backend code until the API contract is reviewed and approved by PM.

First backend milestone should be:

- NestJS backend skeleton
- Prisma schema
- Seed data matching UI
- Read-only endpoints matching current UI
- No real AI
- No real n8n
- No real Git integration
- No OpenHands
- No production access

---

## Final Main Merge Readiness Report

Branch:
`feature/final-main-merge-readiness`

Main merge result:
`origin/main` merged into `feature/final-main-merge-readiness` from current `feature/ux-navigation-polish`.

Conflicts:
No conflicts.

Frontend validation:
- `pnpm install` — PASS
- `pnpm run build` — PASS
- `pnpm run lint` — PASS with existing warnings only

Backend validation:
- `cd backend` — PASS
- `pnpm install` — PASS
- `pnpm run build` — PASS
- `pnpm run lint` — PASS
- `pnpm run test` — PASS
- `pnpm prisma:validate` — PASS
- `pnpm prisma:generate` — PASS

Route check result:
Local production Next server on port `3100` returned HTTP 200 for:
- `/demo/overview`
- `/demo/rd-radar`
- `/demo/initiatives`
- `/demo/initiatives/evpn-bgp-validation-pack`
- `/demo/security-gate`
- `/demo/failure-blocker-center`
- `/demo/release-factory`
- `/demo/locked-advanced-modules`

Forbidden wording scan result:
PASS. Scoped customer-facing source scan over `app`, `components`, and `lib` found no matches for:
- pricing
- commercial offer
- contact sales
- GitLab
- GitHub
- n8n
- OpenAI
- Claude
- OpenHands
- PostgreSQL visible in customer-facing UI
- Redis visible in customer-facing UI
- MinIO visible in customer-facing UI
- Qdrant visible in customer-facing UI

Vercel preview status:
Not available during local branch preparation. No manual deployment was performed.

Final recommendation:
Ready for CI/Vercel validation and PM main-merge review. Do not merge to `main` until required checks pass.

