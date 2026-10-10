# Definition of done

Owner: Engineering Lead · Last verified: 2026-09-02

- Scope and maturity classification are accurate.
- Auth/RBAC/audit and egress boundaries are tested.
- No secret/raw-output/repository-content leakage.
- Targeted and canonical verification passes on Node 22/pnpm 11.1.2.
- Migration is additive, disposable-tested, and separately gated for Production.
- Documentation, rollback, exact SHA, and deployment effects are recorded.
- CODEOWNER review and protected pipeline pass; no direct push to canonical `main`.
