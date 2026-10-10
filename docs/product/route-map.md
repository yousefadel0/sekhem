# Sekhem Product Application Route Map

## Document Status

- Product: Sekhem Product Application
- Scope: active application routes under the current UI/UX state
- Customer-facing note: the `/demo` prefix is internal route naming only and must not be exposed as product language.

## Active Route Map

| Internal Route | Customer-facing screen name | Business purpose |
|---|---|---|
| `/` | Product Application Entry | Redirects users to the application overview. |
| `/login` | Login | Entry point for authenticated Product Application users. |
| `/demo/overview` | Platform Overview | Shows module map, platform KPIs, Phase 1 Activation scope, and navigation to key modules. |
| `/demo/command-center` | Command Center | Provides executive visibility across initiatives, approvals, risks, and platform health. |
| `/demo/agent-war-room` | AI Assistant War Room | Shows AI technical assistant activity, workload, status, and orchestration visibility. |
| `/demo/ai-cto` | AI Technical Planner | Generates and reviews technical planning memos, assumptions, architecture notes, and recommended tasks. |
| `/demo/initiatives` | Initiatives | Tracks recommended initiatives and approved execution programs through their lifecycle. |
| `/demo/initiatives/new` | New Initiative Intake | Captures a new initiative candidate and routes it into review and planning. |
| `/demo/rd-radar` | R&D Radar | Monitors signals and turns evidence into recommended initiatives and roadmap opportunities. |
| `/demo/knowledge-base` | Knowledge Base | Provides searchable evidence, decisions, documents, and engineering knowledge. |
| `/demo/repo-intelligence` | Repo Intelligence | Reviews source control activity, impact analysis, risk scoring, and suggested tests. |
| `/demo/workflow-manager` | Workflow Manager | Shows controlled workflow execution and approval process automation. |
| `/demo/code-draft-demo` | Sandboxed Code Draft Workspace | Displays AI-assisted draft changes and engineering handoff in a controlled workspace. |
| `/demo/ai-patch-assistant` | AI Patch Assistant | Future patch recommendation workspace; must remain controlled by human approval. |
| `/demo/security-gate` | Security Gate | Runs and displays release security controls, policy status, risk score, and approval gate. |
| `/demo/failure-blocker-center` | Failure / Blocker Center | Manages blocker classification, evidence, suggested action, next step, and escalation. |
| `/demo/release-factory` | Release Factory | Manages release candidates, artifacts, SHA256, release notes, rollback plans, and approval checklist. |
| `/demo/audit-approvals` | Audit & Approvals | Tracks approvals, decision records, audit evidence, and governance traceability. |
| `/demo/infrastructure-health` | Infrastructure Health | Shows service readiness, operational health, capacity, and incident indicators. |
| `/demo/locked-advanced-modules` | Locked Advanced Modules | Lists advanced modules that require activation review and commercial/approval activation. |
| `/demo/locked-advanced-modules/[slug]` | Locked Module Detail | Explains a locked module, why it is locked, activation requirements, and required infrastructure. |
| `/demo/lab-validation-support` | Lab Validation | Shows lab validation readiness and support diagnostics; advanced capability. |
| `/demo/admin-settings` | Admin / Settings | Controls roles, permissions, application settings, and workspace administration. |
| `/demo/support` | Support Center | Provides support-oriented assistance and operational guidance. |

## Route Policy

1. The route prefix `/demo` is internal only.
2. Do not use the word “Demo” in customer-facing screen names, documentation, slides, or handoff notes.
3. Use Product Application, Phase 1 Activation, Limited Preview, Locked Add-on, or Advanced Package.
4. Do not expose vendor implementation names in route descriptions.
5. Any route that suggests code, release, security, infrastructure, or activation must state Human Approval Required where applicable.

## Open Route Validation Items

Tasker Doc should ask Tasker 1 or QA to confirm the generated build route list after every UI merge, because file-based routes can change during product polish.
