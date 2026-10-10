# Issue 1506 - R&D Radar Source Allowlist and Controlled Collection Plan

## Status

Decision: PASS - allowlist and controlled collection plan ready for PM review.

Owner: Tasker 5 + Tasker 4 + PM.

Issue ID: 1506 / NEW / NOT IN JIRA TABLE.

Reason: PM raised unresolved product scope question: where R&D Radar gets data from and which sources are approved for production-track collection.

Recommended Jira parent: Stage 2 Production-Track Readiness / R&D Radar Activation.

## Purpose

This document defines the first production-track source allowlist and controlled collection plan for R&D Radar.

It does not approve broad crawling, scheduled collection, public triggers, AI enrichment, GitHub write actions, auto initiative creation, or auto task creation.

Current product truth:

- R&D Radar has validated UI, persistence, and evidence-to-decision flow.
- R&D Radar does not yet have a full production source-collection engine.
- Approved source collection must start from exact allowlisted sources.
- Any automation beyond manual/internal execution requires PM approval.

## Architecture

```text
Approved source allowlist
-> controlled fetch
-> sanitized evidence item
-> backend callback
-> EvidenceReview / CandidateInitiative / PMDecision flow
```

## Operating Constraints

Allowed in this plan:

- exact approved public URLs only.
- manual/internal collection first.
- read-only HTTP fetches from allowlisted sources.
- sanitized evidence objects only.
- backend callbacks using approved R&D Radar contracts.
- GitHub read-only collection only for selected repositories after PM approval.

Forbidden:

- broad crawling.
- recursive uncontrolled links.
- login-only or private pages.
- credentials, cookies, tokens, or private documents.
- raw HTML shown in UI.
- raw headers stored or displayed.
- public trigger.
- scheduled trigger until PM approval.
- AI provider call until separately approved.
- GitHub write action.
- auto initiative creation.
- auto task creation.
- production claim.

## Approval Gates

PM must approve before:

- adding a source to the production-track allowlist.
- automating any source.
- scheduling any collection.
- adding GitHub issue or pull request collection.
- enabling AI enrichment.
- promoting a candidate to initiative creation.

Tasker 5 owns:

- collection method.
- workflow/manual execution boundaries.
- sanitized evidence object.
- callback payload proposal.
- trigger limits.
- what remains manual/internal.

Tasker 4 owns:

- backend callback feasibility.
- required API and persistence fields.
- confirmation that n8n does not write directly to the database.
- additive-only backend requirements.
- schema impact assessment.

PM owns:

- final source allowlist approval.
- approval for automation, scheduling, AI enrichment, and source expansion.

## Sanitized Evidence Object

Every collected item must be reduced to this sanitized shape before any backend callback:

```json
{
  "sourceId": "nist-csf-main",
  "sourceName": "NIST Cybersecurity Framework",
  "sourceUrl": "https://www.nist.gov/cyberframework",
  "sourceCategory": "standards_governance",
  "collectionMethod": "HTML page",
  "collectedAt": "ISO-8601 timestamp",
  "title": "Short public title",
  "sanitizedFinding": "Short human-readable summary with no raw HTML, no raw headers, no private data, and no AI-generated conclusion.",
  "evidenceType": "standard_update | vulnerability | advisory | release | repository_signal | governance_reference",
  "publishedAt": "ISO-8601 timestamp or null",
  "versionOrIdentifier": "CVE/RFC/release/advisory identifier or null",
  "affectedTechnology": ["optional", "controlled", "tags"],
  "collectionStatus": "collected | no_change | needs_human_review | failed_safe",
  "riskFlags": {
    "loginRequired": false,
    "privateContent": false,
    "rawContentStored": false,
    "credentialsUsed": false,
    "recursiveLinksFollowed": false
  }
}
```

## Backend Callback Proposal

Tasker 5 workflow/manual execution should not write directly to PostgreSQL. It should call the backend only.

Proposed endpoint for a future additive backend task:

```text
POST /api/rd-radar/evidence/collect-preview
```

Proposed payload:

```json
{
  "collectionRunId": "rd-collection-run-YYYYMMDD-manual-001",
  "mode": "manual_internal",
  "sourceAllowlistVersion": "issue-1506-v1",
  "sourceCount": 3,
  "evidence": [
    {
      "sourceId": "nist-csf-main",
      "sourceName": "NIST Cybersecurity Framework",
      "sourceUrl": "https://www.nist.gov/cyberframework",
      "sourceCategory": "standards_governance",
      "collectionMethod": "HTML page",
      "collectedAt": "ISO-8601 timestamp",
      "title": "NIST Cybersecurity Framework",
      "sanitizedFinding": "NIST CSF page remains a relevant governance source for cybersecurity risk management framing.",
      "evidenceType": "governance_reference",
      "publishedAt": null,
      "versionOrIdentifier": "CSF",
      "affectedTechnology": ["cybersecurity", "risk-management"],
      "collectionStatus": "collected",
      "riskFlags": {
        "loginRequired": false,
        "privateContent": false,
        "rawContentStored": false,
        "credentialsUsed": false,
        "recursiveLinksFollowed": false
      }
    }
  ],
  "runtimeVerification": {
    "workflowActive": false,
    "triggerType": "manual/internal only",
    "publicTrigger": false,
    "scheduledTrigger": false,
    "aiProviderCalled": false,
    "dbWriteByWorkflow": false,
    "githubWriteAction": false,
    "rawHtmlStored": false,
    "rawHeadersStored": false
  }
}
```

Expected backend response:

```json
{
  "accepted": true,
  "persistence": true,
  "evidenceCount": 1,
  "reviewRequired": true,
  "nextGate": "HUMAN_EVIDENCE_REVIEW_REQUIRED"
}
```

## Backend Feasibility

Existing backend concepts are mostly sufficient for the first controlled collection path:

- `EvidenceSourceV2` can represent source identity, URL, and source type.
- `EvidenceItem` can represent sanitized evidence records.
- `EvidenceReview` can represent human scoring and reviewer decision.
- `CandidateInitiative` can remain downstream of reviewed evidence.
- `PMDecision` can remain downstream of candidate review.
- `WorkflowRunSummary` can record workflow/manual run summaries.

Additive backend requirements likely needed:

- allowlist version field on collection callbacks or workflow summaries.
- collection method field if not already persisted with source type.
- source category field if frontend filtering requires it.
- explicit risk flag fields or a JSON field for collection guardrail proof.
- optional `publishedAt`, `versionOrIdentifier`, and `affectedTechnology` metadata on evidence items.

No direct database write from n8n is approved. n8n/manual collection must call backend APIs only.

Schema decision:

- Existing evidence and review models are enough for a first manual/internal preview if metadata can be normalized into existing fields.
- A future production-track persistence PR should add missing metadata fields additively only if PM approves automated collection or richer source filtering.

## Source Allowlist v1 - Proposed

### Standards and Governance

| Source | URL | Method | Frequency | Risk | Extract | Callback | Frontend Impact | Approval Before Automation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NIST Cybersecurity Framework | `https://www.nist.gov/cyberframework` | HTML page | Weekly manual/internal; later weekly scheduled if approved | Low | title, page update signal, CSF version/reference, sanitized governance finding | `evidenceType=governance_reference`, `sourceCategory=standards_governance` | Yes - evidence and candidate rationale | Yes |
| NIST NVD CVE API | `https://services.nvd.nist.gov/rest/json/cves/2.0` | API | Daily manual/internal for selected CPE/keyword filters; later scheduled if approved | Medium | CVE ID, severity, affected product text, published date, references count, KEV flag if present | `evidenceType=vulnerability`, `versionOrIdentifier=CVE-*` | Yes - security evidence and risk signals | Yes |
| CISA Known Exploited Vulnerabilities Catalog | `https://www.cisa.gov/known-exploited-vulnerabilities-catalog` | HTML page / catalog export if approved | Daily manual/internal; later scheduled if approved | Low | CVE ID, vendor/product, date added, required action, due date | `evidenceType=vulnerability`, `collectionStatus=needs_human_review` | Yes - high-priority security signals | Yes |
| RFC Editor Recent RFCs | `https://www.rfc-editor.org/` and `https://www.rfc-editor.org/series/rfc-download/` | RSS / Atom | Weekly manual/internal; later weekly scheduled if approved | Low | RFC number, title, publication date, stream/status, relevant tags | `evidenceType=standard_update`, `versionOrIdentifier=RFC-*` | Yes - standards update signal | Yes |
| IETF Datatracker | `https://datatracker.ietf.org/` | API / HTML page | Weekly manual/internal for selected working groups only | Medium | draft/RFC title, working group, status, last updated, abstract summary | `evidenceType=standard_update`, `collectionStatus=needs_human_review` | Possible - only for networking roadmap evidence | Yes |
| IEEE public standards pages | `https://standards.ieee.org/` | HTML page / manual URL | Monthly manual review only | Medium | public standard title, family, abstract/overview, update date if public | `evidenceType=standard_update` | Possible - only where relevant | Yes |

### Open Infrastructure and Networking

| Source | URL | Method | Frequency | Risk | Extract | Callback | Frontend Impact | Approval Before Automation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open Compute Project | `https://www.opencompute.org/` | HTML page / RSS if identified | Monthly manual/internal | Low | project title, announcement title, date, relevant networking topic | `evidenceType=governance_reference` | Yes - ecosystem evidence | Yes |
| SONiC official documentation | `https://github.com/sonic-net/SONiC/wiki` | GitHub read-only / HTML page | Weekly manual/internal for exact pages only | Medium | page title, updated date if available, feature/topic, sanitized summary | `evidenceType=repository_signal`, `collectionMethod=GitHub read-only` | Yes - SONiC roadmap/evidence | Yes |
| SONiC build image repository | `https://github.com/sonic-net/sonic-buildimage` | GitHub read-only | Weekly manual/internal for releases/changelog only | Medium | release tag, date, title, selected labels if approved | `evidenceType=release`, `versionOrIdentifier=release tag` | Possible - release and compatibility evidence | Yes |
| Linux Foundation networking/news | `https://www.linuxfoundation.org/` | HTML page / RSS if available | Monthly manual/internal | Low | announcement title, date, project name, sanitized relevance | `evidenceType=governance_reference` | Possible | Yes |
| CNCF projects/news | `https://www.cncf.io/` | RSS / HTML page | Monthly manual/internal for relevant projects only | Low | project/news title, date, maturity/status if public | `evidenceType=governance_reference` | Possible | Yes |
| ONF open networking | `https://opennetworking.org/` | HTML page | Monthly manual/internal if SDN/open networking scope is approved | Low | project/news title, date, relevant technology | `evidenceType=governance_reference` | Possible | Yes |

### Vendor Public Ecosystem

| Source | URL | Method | Frequency | Risk | Extract | Callback | Frontend Impact | Approval Before Automation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Edgecore public docs/release notes | `https://www.edge-core.com/` | HTML page / manual URL | Monthly manual/internal for exact public pages | Medium | product/doc title, release/advisory title, date, affected platform | `evidenceType=release` or `advisory` | Possible - vendor readiness evidence | Yes |
| Broadcom public security advisories/docs | `https://support.broadcom.com/security-advisory` | HTML page / API where publicly documented | Weekly manual/internal for exact public advisories only | Medium | advisory ID/title, date, affected product, severity if public | `evidenceType=advisory` | Yes - security evidence | Yes |
| Marvell public security/advisory/docs | `https://www.marvell.com/` | HTML page / manual URL | Monthly manual/internal | Medium | advisory/doc title, date, affected technology, public severity if available | `evidenceType=advisory` | Possible | Yes |
| NVIDIA/Mellanox public advisories/docs | `https://www.nvidia.com/en-us/security/` | HTML page / manual URL | Weekly manual/internal for public advisories | Medium | advisory title, CVE IDs, affected products, published date | `evidenceType=advisory` | Yes - security evidence | Yes |
| Intel networking advisories | `https://www.intel.com/content/www/us/en/security-center/default.html` | HTML page / manual URL | Weekly manual/internal for public advisories | Medium | advisory ID/title, CVE IDs, affected products, published date | `evidenceType=advisory` | Yes - security evidence | Yes |

### Security Sources

| Source | URL | Method | Frequency | Risk | Extract | Callback | Frontend Impact | Approval Before Automation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NVD CVE API | `https://services.nvd.nist.gov/rest/json/cves/2.0` | API | Daily manual/internal for approved filters | Medium | CVE ID, severity, CPE/product text, published/modified date, references | `evidenceType=vulnerability` | Yes | Yes |
| CISA KEV | `https://www.cisa.gov/known-exploited-vulnerabilities-catalog` | HTML page / catalog export if approved | Daily manual/internal | Low | CVE ID, vendor, product, date added, due date, known exploited status | `evidenceType=vulnerability` | Yes | Yes |
| GitHub Security Advisories | `https://github.com/advisories` | GitHub read-only / API if approved | Daily manual/internal for approved ecosystems only | Medium | GHSA ID, CVE ID, package/ecosystem, severity, published date | `evidenceType=advisory`, `collectionMethod=GitHub read-only` | Yes | Yes |
| Vendor security advisories | Vendor exact URLs above | HTML page / manual URL | Weekly manual/internal | Medium | advisory ID/title, CVEs, affected product, mitigation, published date | `evidenceType=advisory` | Yes | Yes |

### Source Control and Open Source

| Source | URL | Method | Frequency | Risk | Extract | Callback | Frontend Impact | Approval Before Automation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Selected GitHub repositories - releases only | Exact repository URLs approved by PM | GitHub read-only | Weekly manual/internal | Medium | release tag, title, published date, release note summary, no raw body displayed | `evidenceType=release`, `collectionMethod=GitHub read-only` | Yes - release/readiness panel | Yes |
| Selected GitHub repositories - changelogs | Exact changelog file URLs approved by PM | GitHub read-only | Weekly manual/internal | Medium | file path, commit hash, section title, version/date, sanitized change summary | `evidenceType=repository_signal` | Possible | Yes |
| Selected GitHub issues/PRs | Exact repos and labels approved by PM | GitHub read-only | Manual only until PM approves automation | High | issue/PR number, title, state, labels, updated date, sanitized relevance | `evidenceType=repository_signal`, `collectionStatus=needs_human_review` | Possible | Yes |

## Recommended First Execution Slice

The safest first production-track collection slice should use exactly three sources:

1. NIST Cybersecurity Framework main page.
2. CISA KEV catalog.
3. RFC Editor recent RFC feed/page.

Rationale:

- all are public.
- no login or credentials required.
- high relevance to governance, security, and standards.
- low risk compared with vendor pages and GitHub issue/PR content.
- supports current R&D Radar evidence review without broad crawling.

Execution mode:

- manual/internal only.
- workflow inactive after run.
- no schedule.
- no public trigger.
- no recursive links.
- no AI.
- no database writes from workflow.
- backend callback only.

## Trigger Limits

Until PM approves otherwise:

- trigger type: manual/internal only.
- maximum sources per run: 3.
- maximum exact URLs per source per run: 1.
- maximum response capture: sanitized title, metadata, and summary only.
- no raw HTML retention.
- no raw headers retention.
- no screenshots.
- no file downloads unless separately approved.
- no PDF parsing unless separately approved.
- no GitHub issues/PRs unless separately approved.

## Frontend Impact

Frontend impact is yes for:

- evidence list and evidence review panel.
- candidate initiative rationale.
- PM decision context.
- repository/readiness panel if GitHub read-only sources are later approved.

Frontend must not show:

- internal IPs.
- raw source content.
- raw HTML.
- raw headers.
- workflow vendor labels in customer-facing copy.
- private operational logs.
- production claims.

## Remaining Manual/Internal

The following remain manual/internal until later PM approval:

- source allowlist expansion.
- source URL review.
- robots/terms review.
- workflow execution.
- evidence scoring.
- candidate promotion.
- PM decision.
- initiative creation.
- task creation.
- source-control issue/PR collection.

## PM Review Checklist

PM should decide:

- approve the recommended first three-source execution slice: yes/no.
- approve CISA KEV daily manual/internal review: yes/no.
- approve NVD API filters: yes/no and which products/CPEs.
- approve selected GitHub repositories: yes/no and exact repos.
- approve whether GitHub issues/PRs are in scope: yes/no.
- approve whether vendor advisories are in scope for Stage 2: yes/no.
- approve whether any collection can become scheduled later: yes/no.
- approve whether AI enrichment remains deferred: yes/no.

## Final Recommendation

PASS - allowlist and controlled collection plan ready for PM review.

No source is approved for automated production collection until PM explicitly approves it.

