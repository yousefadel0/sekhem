# Authentication and RBAC

Owner: Security · Last verified: 2026-09-02

Backend roles are exactly: `Admin`, `PM`, `Technical Reviewer`, `Security Reviewer`, `Viewer`.

The cookie session is HttpOnly, Secure, SameSite=Strict, signed, and expires after eight hours. `AuthzGuard` resolves the session and compares the route's `RequireRoles`. Current credentials describe one configured operational identity, not durable multi-user management.

Human mutations must derive actor name and role from the session. Workflow callbacks use `x-sekhem-callback-timestamp` and `x-sekhem-callback-signature` over `<unix-seconds>.<raw-body>` with HMAC-SHA256, a five-minute skew window, constant-time comparison, and callback idempotency. Never reuse browser, SSH, or provider credentials for this contract.
