# Access matrix

Owner: Security + Engineering Manager · Last verified: 2026-09-02

| Persona | Repository | CI variables | Production app | Backend/DB/host |
|---|---|---|---|---|
| Developer | private read/write via MR branch | none | demo/non-Production | none |
| Reviewer | private read + MR review | none | role-scoped | none |
| Platform operator | protected deployment paths | scoped protected use | operational | host via individual secure profile |
| DBA | schema/MR review | DB-specific protected use | as needed | time-bound DB access |
| Security owner | audit/review | metadata, not values | Admin where justified | emergency time-bound |

No shared accounts or SSH keys. MFA, token expiry, rapid revocation, and joiner/mover/leaver records are mandatory.

Lifecycle checklist: a joiner receives approved individual non-Production access only after identity, MFA, NDA/IP, and acceptable-use controls; a mover is re-approved and loses obsolete roles; a leaver is disabled immediately, active tokens/keys are revoked or rotated, managed devices are returned, and the audit record is retained.
