# Network and deployment

Owner: Platform · Source topology reviewed: 2026-10-10 · Remote deployment NOT VERIFIED

The 2026-09-02 deployment record names `app.sekhem-ai.com`, `api.sekhem-ai.com`, and private ingress port 8080. These are historical deployment references, not verified current destinations or authorization to deploy.

Current source binds the ordinary API to `0.0.0.0` on `PORT` (default 3001) in `backend/src/main.ts`. The optional trusted Runtime TLS listener binds to `127.0.0.1` in `backend/src/trusted-runtime/runtime-tls.ts`; the observed local configuration uses port 7443. These listeners have different transport boundaries. CORS permits configured exact origins with credentials; wildcard origin is forbidden. CORS does not restrict which hosts can reach a listener.

For an approved server, place the API behind HTTPS ingress and restrict direct API/database access at the infrastructure boundary. Runtime ingress must preserve a real TLS hop to the trusted listener and its certificate identity; forwarded headers do not establish trusted transport. Host, DNS, certificates, ingress configuration, and remote Runtime enrollment still require target-specific validation. See `../handover/safe-mvp-completion-2026-10-10.md` for the bounded candidate and current release blockers.

The AI provider and its proxy/GPU are separate infrastructure and are outside ordinary deployment access. Provider URLs must match `SEKHEM_PROVIDER_URL_ALLOWLIST`; redirects are rejected. GitLab self-managed origins must use HTTPS and be explicitly listed.

Never document addresses as credentials, read `/etc/sekhem/backend.env`, or copy Production environment files. Deployment procedures are in `docs/operations`.
