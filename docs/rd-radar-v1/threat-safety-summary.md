# R&D Radar V1 threat and safety summary

- Credentials enter through Admin-authorized backend APIs, are AES-256-GCM encrypted, and are represented to clients only by configured/not-configured flags. Audit records contain no secret values.
- Provider URLs must be HTTP(S), may target private or Tailscale addresses, and may not contain embedded credentials, query strings, or fragments. Provider calls have input/output bounds and abort timeouts; transport details are sanitized.
- Repository operations are read-only. Branches are allowlisted, runs resolve to a full commit SHA, paths are normalized, symlinks are rejected, common secrets/binaries/archives/dependencies/build output are excluded, and file/count/byte/time bounds are enforced.
- Likely secret-bearing content is excluded before model submission. Repository credentials are not stored in evidence. Accepted citations must exactly match collected chunks and line ranges.
- Repository text is treated as untrusted data. Model output is never executed, applied, committed, pushed, or sent to a workflow. Invalid schemas or citations fail the run; live failures never fall back silently to mock.
- Successful runs persist sanitized evidence and a Candidate Draft with `PM_REVIEW_REQUIRED`. No migration is destructive, no public trigger or schedule is added, and workflows remain inactive.
