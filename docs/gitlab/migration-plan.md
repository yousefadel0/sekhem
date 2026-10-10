# GitHub to self-managed GitLab migration plan

Owner: Platform + Repository Owner · Last verified: 2026-09-02

GitHub remains canonical. Target expectation is private `gitlab.local`, but DNS/TLS/application access was unavailable during preparation; project, version/edition, runners, backup status, and restore evidence are therefore unverified.

When access is available: verify authorized DNS/VPN without hosts-file changes; authenticate with an individual account; create a private project; mirror all refs; run `git fsck`; compare commits/branches/tags; import or archive issues/PRs/comments/reviews/check summaries with original URLs; verify CI/runners; protect `main`; require MR, pipeline, and CODEOWNERS; verify backups/restore; then request cutover.

The pre-change all-refs Git bundle is the rollback authority. Do not delete 88 unmerged branches, close 15 open PRs, disconnect GitHub/Vercel, or permit two writable upstreams.
