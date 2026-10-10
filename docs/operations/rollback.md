# Rollback

Owner: Platform · Last verified: 2026-09-02

Use the recorded pre-deployment SHA and verified Git bundle. Backend rollback is safe only when no DB migration occurred: stage the previous exact SHA, use one controlled restart, then verify PID/restarts/health. Vercel rollback must select the previous known-good Production deployment and record its SHA.

Never use `git reset --hard` against an unknown dirty server checkout, overwrite server-local configuration, or roll back schema independently of data. If a migration occurred, stop for the DBA recovery plan.
