# GitLab cutover and rollback

Owner: Repository Owner · Last verified: 2026-09-02

Cutover requires explicit approval after exact ref/object parity, metadata archive, protected `main`, required CI, CODEOWNERS, individual MFA accounts, runner validation, backup/restore evidence, and one verified non-Production Vercel dry run.

Approved sequence: freeze GitHub writes; perform final mirror; verify parity; declare GitLab canonical; change developer remotes; enable GitLab-driven deployment; make GitHub read-only archive/downstream mirror. Roll back by restoring GitHub as the sole writable canonical source from verified refs/bundle and disabling GitLab writes. Never leave both writable.
