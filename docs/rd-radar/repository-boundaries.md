# Repository boundaries

Owner: AI Platform + Security · Last verified: 2026-09-02

Repository connections are read-only. Branches, include/exclude paths, file count, per-file bytes, total bytes, binary extensions, unsafe segments, symlinks, and likely secrets are bounded before provider transmission. GitHub truncated recursive trees fail closed. GitLab tree reads paginate up to 100 pages and fail beyond that bound. Local repositories must resolve under canonical configured roots; symlink escapes are rejected. No branch, commit, MR/PR, issue, workflow, file-apply, or deployment write capability exists.
