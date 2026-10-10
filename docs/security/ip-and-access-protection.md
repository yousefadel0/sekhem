# IP and access protection

Owner: Security + Legal · Last verified: 2026-09-02

- Private GitLab reachable only through approved internal/VPN/Tailscale access where practical.
- Individual accounts, MFA, minimum roles, protected `main`, MR/pipeline/CODEOWNER approvals, signed commits where supported, and retained audit logs.
- No shared GitLab accounts, SSH keys, tokens, or Production secrets; protected/masked variables and short expiry/rotation.
- No direct developer Production access by default. High-risk contractors may use approved remote development/VDI and legally approved DLP/egress controls.
- All changes use merge requests; direct `main` pushes and copying source to personal repositories are prohibited.
- Joiner/mover/leaver workflow must cover approval, periodic review, immediate revocation, token/key rotation, and device return.
- NDA, IP assignment, acceptable use, and a prohibition on uploading code to unauthorized external AI services are mandatory organizational controls.

Git access cannot technically prevent an authorized developer from copying code. Protection comes from least privilege, individual accountability, controlled environments, contractual IP ownership, logging, and rapid revocation.
