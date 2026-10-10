# Environment variables

Owner: Platform + Security · Last verified: 2026-09-02

| Name | Purpose | Required when |
|---|---|---|
| `PORT` | Backend listener | Optional; default 3001 |
| `DATABASE_URL` | PostgreSQL connection | DB-backed mode/disposable migration only |
| `SEKHEM_DATA_SOURCE` | memory or postgres selection | Optional |
| `SEKHEM_AUTH_ENABLED`, `SEKHEM_AUTH_STAGING_EMAIL`, `SEKHEM_AUTH_STAGING_PASSWORD_HASH`, `SEKHEM_AUTH_STAGING_DISPLAY_NAME`, `SEKHEM_AUTH_STAGING_ROLE`, `SEKHEM_AUTH_SESSION_SECRET` | configured identity and signed session | Operational authentication |
| `SEKHEM_WORKFLOW_CALLBACK_HMAC_SECRET` | machine callback signing | Callback activation; minimum 32 chars |
| `SEKHEM_CONFIG_MASTER_KEY`, `SEKHEM_CONFIG_MASTER_KEY_PREVIOUS` | config encryption and controlled rotation | Persisted credentials |
| `SEKHEM_PROVIDER_URL_ALLOWLIST` | exact approved provider base URLs | Non-mock provider use |
| `SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS` | canonical local Git roots | Local repository provider |
| `SEKHEM_LOCAL_REPOSITORY_SOURCE_PATH` | selected local repository | Local status adapter |
| `SEKHEM_GITLAB_BASE_URL`, `SEKHEM_GITLAB_ALLOWED_BASE_URLS` | selected/approved HTTPS GitLab origins | Self-managed GitLab reads |
| `SEKHEM_GITLAB_REPOSITORY_SOURCE_PROJECT` | status project path | GitLab status adapter |
| `NEXT_PUBLIC_SEKHEM_API_BASE_URL` | browser API base | Frontend deployment |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | GitLab CI Vercel promotion | Protected/masked CI only |

Values belong only in approved secret stores. Safe examples must use non-routable placeholders, never real values.
