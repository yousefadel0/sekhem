# Endpoint and caller matrix

Owner: Backend + Security · Last verified: 2026-09-02

| Method/path | Class | Caller/role |
|---|---|---|
| `GET /health`, `GET /health/db-readiness` | read | public |
| `/auth/login`, `/auth/logout`, `/auth/session` | session | public endpoint; valid credentials/cookie as applicable |
| Product/project/module/initiative/task/approval/security/release/blocker reads | read | all authenticated Backend roles |
| Product initiative/task/approval/blocker writes | write | route-specific Admin/PM/reviewer roles in `ProductController`; actor from session |
| `POST /workflows/events` | write | Admin, PM; requested actor overwritten from session |
| `POST /workflows/callbacks` | machine write | valid workflow callback HMAC; no browser session |
| `GET /workflows/runs*`, `GET /ai/memos/:id` | read | all authenticated roles |
| `POST /ai/memos/request`, `POST /system/events` | write | Admin, PM; actor from session |
| `POST /ai-patch/drafts`, status, artifacts | draft write | Admin, PM, Technical Reviewer |
| AI Patch approve/reject/stop | approval write | Admin, PM |
| AI Patch reads/audit | read | all authenticated roles |
| R&D analysis create/cancel | generation write | Admin, PM; explicit action only |
| R&D status/evidence/run/candidate/review reads | read | all authenticated roles |
| R&D review/evidence-review writes | review write | route-specific Admin/PM/reviewer roles |
| AI Gateway/provider/model/repository configuration writes | admin write | Admin |
| Knowledge and repository status reads | read | authenticated role where declared |
| RAG/AI preview routes | preview | guarded as declared; deterministic/no provider generation |

Controller decorators are authoritative if this inventory and code diverge. CI security tests cover unauthenticated, unauthorized, authorized, callback, and read-only cases.
