# Testing

Owner: Quality Engineering · Last verified: 2026-09-02

Root: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

Backend: `pnpm prisma:generate`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm prisma:validate`.

Tests must never point at Production or call Provider Test/R&D. Run changed-area tests during implementation and one integrated gate before merge.
