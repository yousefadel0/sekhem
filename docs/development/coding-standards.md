# Coding standards

Owner: Engineering Lead · Last verified: 2026-09-02

- Preserve strict TypeScript and existing Nest/Next conventions.
- Validate untrusted input at the boundary; fail closed with sanitized errors.
- Derive actor identity from authenticated context, never request fields.
- Keep provider/repository operations bounded and read-only unless separately approved.
- Do not log credentials, prompts, raw provider content, repository content, or transport bodies.
- Prefer one canonical schema/contract and focused tests for security boundaries.
- Keep commits narrow, reversible, and attributable to one workstream.
