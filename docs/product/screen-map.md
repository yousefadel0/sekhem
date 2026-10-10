# Sekhem Product Application Screen Map

## Document Status

- Product: Sekhem Product Application
- Scope: customer-facing application screens after Phase 1 Activation
- Not in scope: public website, pricing page, commercial offer

## Screen Map

| Screen | Route | Purpose | Customer-facing status |
|---|---|---|---|
| Login | `/login` | Controlled entry point into the Product Application. | Enabled |
| Platform Overview | `/demo/overview` | Shows the full capability map, module categories, platform KPIs, and Phase 1 Activation indicators. | Enabled |
| Command Center | `/demo/command-center` | Executive control dashboard for initiatives, approvals, platform status, and next actions. | Enabled |
| AI Assistant War Room | `/demo/agent-war-room` | Central view of AI specialist assistants, their workload, and activity state. | Limited Preview |
| AI Technical Planner | `/demo/ai-cto` | Technical planning assistant for requirements, architecture notes, engineering memos, and task drafting. | Enabled / Human Approval Required |
| Initiatives | `/demo/initiatives` | Initiative tracking board for recommended and approved execution programs. | Enabled |
| New Initiative Intake | `/demo/initiatives/new` | Intake screen for submitting a new initiative candidate from R&D or business input. | Enabled / Human Approval Required |
| R&D Radar | `/demo/rd-radar` | Technology signal and opportunity radar used to create evidence-linked initiative recommendations. | Enabled |
| Knowledge Base | `/demo/knowledge-base` | Searchable evidence repository for documents, decisions, reports, and engineering knowledge. | Enabled |
| Repo Intelligence | `/demo/repo-intelligence` | Code and repository risk view for impact analysis, suggested tests, and technical review. | Enabled / Human Approval Required |
| Workflow Manager | `/demo/workflow-manager` | Controlled workflow visibility for engineering, approvals, and operational process execution. | Enabled / Human Approval Required |
| Sandboxed Code Draft Workspace | `/demo/code-draft-demo` | Controlled workspace for AI-assisted code drafts, patch previews, and engineering handoff. | Limited Preview / Human Approval Required |
| AI Patch Assistant | `/demo/ai-patch-assistant` | Future workspace for patch suggestions and controlled code-change recommendations. | Locked Add-on / Human Approval Required |
| Release Factory | `/demo/release-factory` | Governed release candidate creation, artifacts, SHA256, release notes, rollback plan, and approval checklist. | Enabled / Human Approval Required |
| Security Gate | `/demo/security-gate` | Security review, policy checks, risk score, blocked/passed status, and exception approvals. | Enabled / Human Approval Required |
| Failure / Blocker Center | `/demo/failure-blocker-center` | Central blocker management for design, code, permission, dependency, security, lab, confidence, and approval blockers. | Enabled / Human Approval Required |
| Audit & Approvals | `/demo/audit-approvals` | Approval queues, decision logs, audit evidence, and governance traceability. | Enabled / Human Approval Required |
| Infrastructure Health | `/demo/infrastructure-health` | Readiness and health view for application, automation, data, storage, and monitoring layers. | Enabled |
| Locked Advanced Modules | `/demo/locked-advanced-modules` | Catalog of locked add-ons and advanced packages requiring activation review. | Locked Add-on |
| Locked Module Detail | `/demo/locked-advanced-modules/[slug]` | Detail page for each locked module with activation path, infrastructure, approvals, and lock reason. | Locked Add-on / Advanced Package |
| Lab Validation | `/demo/lab-validation-support` | Lab readiness, validation scenarios, and support diagnostics for future expansion. | Locked Add-on |
| Admin / Settings | `/demo/admin-settings` | Role, permission, workspace, and application settings management. | Enabled / Human Approval Required |
| Support Center | `/demo/support` | Support-facing route for help and operational assistance. | Enabled |

## Screen Grouping

### Core Command

- Platform Overview
- Command Center
- AI Assistant War Room
- AI Technical Planner
- Initiatives

### Intelligence

- R&D Radar
- New Initiative Intake
- Knowledge Base
- Repo Intelligence

### Execution

- Sandboxed Code Draft Workspace
- Workflow Manager
- AI Patch Assistant
- Release Factory
- Security Gate

### Assurance

- Failure / Blocker Center
- Audit & Approvals
- Infrastructure Health

### Expansion

- Locked Advanced Modules
- Locked Module Detail
- Lab Validation
- Admin / Settings
- Support Center

## Screen Language Rules

The source route prefix `/demo` is an internal technical route. It must not be described to customers as a demo environment. Customer-facing documentation must use Product Application, Phase 1 Activation, Limited Preview, Locked Add-on, or Advanced Package depending on the screen status.
