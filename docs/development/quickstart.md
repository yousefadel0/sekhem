# Developer quickstart

Owner: Developer Experience · Last verified: 2026-09-02

1. Obtain an individual private-repository account; never use shared credentials.
2. Install Node 22 and enable pnpm 11.1.2 with Corepack.
3. Clone, then run `pnpm install --frozen-lockfile` at root and in `backend`.
4. Copy only an approved local environment template; never use Production secrets.
5. Run frontend `pnpm dev`. Run Backend `pnpm prisma:generate` then `pnpm start:dev`.
6. Use memory mode unless database work requires the disposable flow.
7. Before an MR, run targeted tests, then the canonical test/lint/typecheck/build commands once.

No local command should call a Provider Test, R&D analysis, deploy, restart, or Production database.
