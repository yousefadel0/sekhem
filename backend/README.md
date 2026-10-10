# Sekhem Backend

NestJS API for product workflows, authentication/RBAC, repository ingestion, AI Gateway configuration, and R&D Radar. Runtime maturity varies by module; see [module truth matrix](../docs/current-state/module-truth-matrix.md).

## Local verification

Use Node 24.21.0 and pnpm 11.1.2.

```bash
corepack enable
corepack prepare pnpm@11.1.2 --activate
cd backend
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm prisma:validate
```

The API uses `PORT` (default `3001`) and prefix `/api`. Local memory mode does not require PostgreSQL. Database-backed paths require a disposable `DATABASE_URL`; never point development or CI at Production.

## Security-relevant configuration

Only variable names are documented here: `SEKHEM_AUTH_ENABLED`, `SEKHEM_AUTH_STAGING_EMAIL`, `SEKHEM_AUTH_STAGING_PASSWORD_HASH`, `SEKHEM_AUTH_STAGING_DISPLAY_NAME`, `SEKHEM_AUTH_STAGING_ROLE`, `SEKHEM_AUTH_SESSION_SECRET`, `SEKHEM_WORKFLOW_CALLBACK_HMAC_SECRET`, `SEKHEM_CONFIG_MASTER_KEY`, `SEKHEM_CONFIG_MASTER_KEY_PREVIOUS`, `SEKHEM_PROVIDER_URL_ALLOWLIST`, `SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS`, `SEKHEM_GITLAB_BASE_URL`, and `SEKHEM_GITLAB_ALLOWED_BASE_URLS`.

Never commit or print values. See [environment variables](../docs/development/environment-variables.md), [API authentication](../docs/api/authentication-and-rbac.md), and [deployment](../docs/operations/backend-deployment.md).
