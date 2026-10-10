# Module truth matrix

Owner: Product + Engineering · Last verified: 2026-09-02

| Module | Classification | Authoritative evidence |
|---|---|---|
| Auth/session/RBAC | PRODUCTION_LIVE | Backend guards and HTTP tests; single configured identity only |
| AI Gateway configuration | PRODUCTION_LIVE | Encrypted persisted config, fail-closed provider dialect verification |
| R&D Radar analysis | PRODUCTION_LIVE | Accepted Production cycle; strict schema and citation validation |
| Repository snapshot | PRODUCTION_LIVE | Bounded read-only GitHub/GitLab/local adapters; allowlists |
| Knowledge Base | PARTIAL | Live reads exist; no fixture substitution on operational route |
| Workflow callbacks | PARTIAL | Persistence/memory support plus HMAC; external caller activation requires secret configuration |
| AI Patch | PARTIAL | Draft/review state only; no apply, Git write, or deploy |
| Product approvals/tasks/blockers | PARTIAL | Mostly in-memory write layer with audit records |
| RAG preview | MOCK_OR_FALLBACK | Deterministic fixture preview; no embeddings/vector DB/LLM |
| AI preview endpoint | MOCK_OR_FALLBACK | Explicit no-provider-call contract |
| Remaining public `/demo/*` routes | UI_ONLY or MOCK_OR_FALLBACK | Visible `DEMO DATA` banner |
| Advanced modules | PLANNED | Locked UI only |
| GitLab canonical hosting | PLANNED | Connectivity/project/cutover not yet verified |
| Production backup/restore monitoring | PLANNED | Policy and runbooks only; no operational evidence |
