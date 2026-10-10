# Sekhem Product Application Journey

## Document Status

- Product: Sekhem Product Application
- Scope: customer-facing Product Application after Phase 1 Activation
- Not in scope: public website, pricing page, commercial offer, vendor implementation details
- Audience: PM, Product, UI/UX, Backend, Automation, QA

## Main Product Journey

```text
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
```

## Journey Stages

### 1. R&D Radar

Purpose: identify technology signals, community movement, vendor roadmap signals, market shifts, and infrastructure opportunities.

Expected user outcome:
- Review active R&D signals.
- Understand why a signal matters.
- Convert a signal into a recommended initiative.

Customer-facing language:
- Technology Radar
- R&D Signal
- Strategic Opportunity
- Evidence-linked Recommendation

### 2. Recommended Initiative

Purpose: convert a selected R&D signal into a structured initiative candidate.

Expected user outcome:
- Review recommended initiative name, value, risk, scope, and readiness.
- Decide whether to open a formal initiative.

Rules:
- AI may recommend.
- Human owner must approve initiative adoption.
- Low-confidence recommendations must be routed to human review.

### 3. Evidence

Purpose: show the supporting source material behind an initiative.

Expected user outcome:
- Review source documents, summaries, confidence, and evidence packets.
- Confirm that the initiative is based on traceable information.

Rules:
- Evidence must be visible before execution planning.
- AI output without evidence cannot be treated as adoption-ready.

### 4. Execution Path

Purpose: translate the initiative into a controlled execution path.

Expected user outcome:
- See the planned path from initiative to technical memo, tasks, sandboxed workspace, security gate, and release candidate.
- Identify required approvals and blockers early.

### 5. AI Technical Memo

Purpose: provide AI-assisted technical planning for the initiative.

Expected user outcome:
- Receive technical summary, assumptions, risks, affected areas, suggested tasks, and test recommendations.

Rules:
- AI explains and drafts.
- Human validates and approves.
- AI cannot make final architecture, release, security, or deployment decisions.

### 6. Tasks / Execution Kanban

Purpose: convert approved planning into visible execution tasks.

Expected user outcome:
- Track task stages, owners, status, blockers, and approval requirements.
- Manage work without implying automatic deployment.

### 7. Sandboxed Code Draft Workspace

Purpose: provide a safe area for draft code recommendations, patch previews, and engineering handoff.

Expected user outcome:
- Review draft outputs and proposed changes in a controlled workspace.
- Keep code drafting separate from source control merge or deployment.

Rules:
- AI can draft.
- AI cannot merge.
- AI cannot deploy.
- AI cannot modify production.

### 8. Security Gate

Purpose: evaluate release readiness and block risky outputs.

Expected user outcome:
- Review Secrets Scan, License Check, Policy Check, SBOM Status, External Dependency Warning, Risk Score, Blocked / Passed Status, and Human Approval Gate.

Rules:
- Security violations block release movement.
- Human approval is required for exceptions.

### 9. Failure / Blocker Center

Purpose: collect design, code, permission, dependency, security, lab, confidence, and approval blockers.

Expected user outcome:
- Review root cause, evidence, suggested action, next step, rollback option, assignee, and escalation status.

Rule:
- Max AI fix attempts = 2.
- After 2 failed attempts, human review is required.

### 10. Release Factory

Purpose: produce governed release candidates and evidence packages.

Expected user outcome:
- Review release candidates, artifacts, SHA256, release notes, rollback plan, approval checklist, and final human approval status.

Rules:
- No automatic production deployment.
- No release proceeds without human approval.

### 11. Locked Advanced Modules

Purpose: show future/advanced capabilities without implying they are active by default.

Expected user outcome:
- Understand what exists as a locked add-on or advanced package.
- Understand required activation, infrastructure, and approvals.

Rules:
- Locked modules require approval and commercial activation.
- AI cannot unlock modules.
- Locked modules must be documented as Limited Preview, Locked Add-on, or Advanced Package.
