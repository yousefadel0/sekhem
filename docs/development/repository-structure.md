# Repository structure

Owner: Developer Experience · Last verified: 2026-09-02

- `app/`, `components/`, `lib/`: Next.js UI and client helpers.
- `backend/src`: NestJS controllers, services, policies, providers.
- `backend/prisma`: canonical Prisma schema and ordered migrations.
- `backend/test`, `test`: Backend and frontend Node test suites.
- `docs`: canonical docs plus retained historical evidence.
- `.github/workflows`: current GitHub verification while GitHub is canonical.
- `.gitlab-ci.yml`, `.gitlab`: prepared GitLab verification, ownership, and review controls.

Never commit dependencies, build output, `.env`, logs, dumps, raw API exports, or secret-bearing artifacts.
