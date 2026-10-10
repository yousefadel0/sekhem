# FP-03 — SONiC Official Repository Source Allowlist

Package ID: FP-03  
Owner: PM  
Execution support: Tasker 5  
Status: PM-approved source family / manual controlled fetch only

## 1. Purpose

This document adds official SONiC repositories as an approved source family for SEKHEM R&D source collection.

This is not approval for broad crawling, code execution, scheduled ingestion, live device commands, or automatic R&D Radar import.

## 2. Approved Source Family

Approved organization:

```text
sonic-net
```

Allowed source type:

```text
Public GitHub repositories under sonic-net organization
```

Allowed collection mode in this phase:

```text
Manual controlled metadata/docs fetch only
```

## 3. Tier 1 — Core SONiC Repositories

These repositories are approved for initial manual controlled source collection.

| Repository | Purpose | Initial risk |
|---|---|---|
| sonic-net/SONiC | Main SONiC project/wiki/docs entry point | Needs Review |
| sonic-net/sonic-buildimage | Build system and image structure | Needs Review |
| sonic-net/sonic-mgmt | Management/test framework and testbed docs | Needs Review |
| sonic-net/sonic-utilities | CLI/utilities | Needs Review |
| sonic-net/sonic-swss | Switch State Service | Needs Review |
| sonic-net/sonic-sairedis | SAI Redis/syncd path | Needs Review |
| sonic-net/sonic-swss-common | Common SWSS libraries | Needs Review |
| sonic-net/sonic-linux-kernel | SONiC Linux kernel packaging | Needs Review |
| sonic-net/sonic-frr | FRR integration/fork | Needs Review |
| sonic-net/sonic-platform-common | Platform abstraction/common layer | Needs Review |
| sonic-net/sonic-platform-daemons | Platform daemons | Needs Review |
| sonic-net/sonic-gnmi | gNMI/telemetry interface | Needs Review |
| sonic-net/sonic-telemetry | Telemetry components | Needs Review |
| sonic-net/sonic-mgmt-framework | Management framework | Needs Review |

## 4. Tier 2 — Extended / PM Approval Required

These may be proposed later, but must not be collected until PM explicitly approves them:

- vendor-specific platform module repositories
- archived repositories
- experimental repositories
- forked or mirrored repositories outside `sonic-net`
- repositories requiring secrets, tokens, private submodules, vendor SDKs, or special access
- issue/PR collection beyond metadata summaries

## 5. Allowed Paths / Content

Initial allowed content:

- README files
- docs folders
- wiki/documentation references
- architecture/design markdown
- build or test documentation
- non-secret metadata such as repository name, default branch, public visibility, and purpose

## 6. Blocked Paths / Content

Always blocked:

- secrets
- tokens
- cookies
- credentials
- private keys
- environment files
- raw logs containing sensitive data
- private vendor SDK payloads
- binary artifacts
- release images
- generated packages
- node_modules or dependency cache folders
- full raw HTML pages
- full HTTP headers
- live device outputs
- config dumps

## 7. Collection Safety Gates

The connector must enforce:

- no broad GitHub organization crawling without a repo list approved by PM;
- no scheduled fetch;
- no public trigger;
- no automatic import into R&D Radar;
- no code execution;
- no clone/build/test against SONiC repositories;
- no write action to external repositories;
- no credentialed/private access;
- no live lab or hardware interaction.

## 8. Source Status Lifecycle

Each repository source must move through:

```text
proposed -> risk_review -> approved -> active -> blocked/rejected
```

In this phase, Tier 1 repositories are `approved` for manual controlled metadata/docs fetch only.

Any expansion beyond Tier 1 must return to `risk_review` and require PM approval.

## 9. Evidence Requirements

Each fetch must record:

- package ID;
- repository full name;
- branch/ref if used;
- fetched paths or metadata fields;
- source classification;
- timestamp;
- operator/system identity;
- sanitization status;
- blocked content count if any;
- PASS / FIX / BLOCKED result.

## 10. PM Decision

Approved:

```text
Add SONiC official sonic-net Tier 1 repositories to FP-03 source allowlist.
```

Not approved:

```text
No broad crawl.
No schedule.
No public trigger.
No automatic R&D Radar import.
No code execution.
No live device or lab execution.
No private/vendor SDK access.
```
