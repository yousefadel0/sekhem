# Known gaps and roadmap

Owner: Product Manager · Last verified: 2026-09-02

1. Replace the configured single-user authentication bridge with DB-backed users, tenant isolation, lifecycle management, MFA/SSO, and durable role assignments.
2. Configure provider/local-root/workflow HMAC allowlists through the secure environment UI before activating the fail-closed runtime changes.
3. Verify GitLab DNS/TLS/version, private project, runners, backups, and restore tests; then request final source-of-truth cutover.
4. Establish evidenced Production monitoring, alerting, backup retention, restore drills, and incident ownership.
5. Convert partial/memory workflows only through separately reviewed persistence designs.
