# Errors and idempotency

Owner: Backend · Last verified: 2026-09-02

Public responses use normalized status/code/message and must not expose stack traces, database details, credentials, transport bodies, raw provider content, prompts, or repository content.

Workflow callbacks require `idempotencyKey`: same run/key/payload is a no-op; changed payload is rejected. R&D analysis requires an 8–200 character key using letters, digits, `.`, `_`, `:`, or `-`. The Backend stores a hash-derived run prefix, not the raw key. Same key and exact request returns the existing run without a second provider call; a different request conflicts.
