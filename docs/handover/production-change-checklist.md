# Production change checklist

Owner: Platform + Product Manager · Last verified: 2026-09-02

- Exact reviewed merge SHA and rollback artifact recorded.
- Required secure configuration exists without values entering chat/logs.
- CI green or exception is proven identical and unrelated.
- Production DB migration explicitly approved, or confirmed NONE.
- One build/deployment and one restart maximum; operator identified.
- Loaded SHA, PID, NRestarts, local/private/public health recorded.
- Auth/RBAC/CORS and fail-closed behavior checked safely.
- No Provider Test/R&D unless separately authorized with a bounded call budget.
- Frontend SHA and operational/demo labels verified.
- Final status and rollback decision documented.
