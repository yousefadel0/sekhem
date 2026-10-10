# Sekhem Product Application

Sekhem is a Next.js 16 frontend plus a NestJS 10/PostgreSQL backend. The repository contains a mixture of Production-live capabilities, partial operational workflows, and explicitly labelled demonstrations. Start with [What is real today](docs/current-state/system-status.md); do not infer runtime maturity from a route name.

## Supported toolchain

- Node.js 24.21.0 (`.node-version`, engine `>=24.21.0 <25`)
- pnpm 11.1.2 (declared in both package manifests)

```bash
corepack enable
corepack prepare pnpm@11.1.2 --activate
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Backend setup is in [backend/README.md](backend/README.md).

## Safety boundaries

- Human operational routes use the existing cookie session and Backend RBAC.
- Machine workflow callbacks use a separate HMAC contract.
- AI generation, repository reads, database migrations, deployments, and restarts are never implied by a normal test command.
- Production operational screens fail visibly; they do not substitute demo fixtures.
- GitHub remains canonical until the documented GitLab cutover is explicitly approved.

The canonical documentation index is [docs/README.md](docs/README.md). Files under the legacy documentation folders remain historical evidence unless the index says otherwise.
