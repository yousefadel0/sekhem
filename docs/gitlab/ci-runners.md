# GitLab CI and runners

Owner: Platform · Last verified: 2026-09-02

`.gitlab-ci.yml` pins Node 22, pnpm 11.1.2, and Vercel CLI 59.11.2. Verification covers frontend/backend tests, lint, typecheck, build, and Prisma schema validation. Database reconstruction is intentionally outside this handover pipeline until the separate database proposal is approved. Vercel preview and Production are manual; Production runs only from the protected default branch with a resource lock.

Required protected/masked variables: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Runner existence, isolation, egress, cache policy, and protected-runner assignment are not yet verified. No developer should read Production variables.
