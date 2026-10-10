# Trust boundaries

Owner: Security · Last verified: 2026-09-02

| Boundary | Control | Remaining limit |
|---|---|---|
| Browser -> API | Exact CORS, HttpOnly cookie, RBAC | Current auth is a configured single identity |
| Machine -> callback | Timestamped HMAC, constant-time compare, idempotency | Secure secret distribution is operationally gated |
| API -> provider | Exact URL allowlist, HTTPS default policy, redirect rejection, encrypted credential | Internal HTTP route requires explicit exception |
| API -> repository | Provider validation, allowed branches/paths, size/file caps, secret filtering, read-only GET/git | Git access can still expose permitted source to authorized operators |
| App -> database | Prisma and additive migrations | Production schema adoption requires introspection |
| CI -> Production | Protected masked variables and manual promotion plan | GitLab/runners not yet verified |

Git access cannot technically prevent an authorized developer from copying code. Protection comes from least privilege, individual accountability, controlled environments, contractual IP ownership, logging, and rapid revocation.
