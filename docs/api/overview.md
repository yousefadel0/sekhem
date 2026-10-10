# API overview

Owner: Backend · Last verified: 2026-09-02

All routes are under `/api`. Successful responses normally contain `data`, `meta.timestamp`, and `errors: []`; normalized failures contain `data: null` and safe code/message objects. Health and login/logout are public. Operational resources use role guards. Machine callbacks use HMAC instead of browser sessions.

Controller groups: auth, product/approvals/tasks/blockers, workflows/memos/system events, R&D Radar, AI Patch, AI Gateway/provider/model configuration, Knowledge Base, repository configuration/status, and RAG previews. See [endpoints](endpoints.md).
