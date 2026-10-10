# Handover limitations

Owner: Engineering Manager · Last verified: 2026-09-02

- Authentication is a configured single-identity bridge, not durable user/tenant management.
- Product workflow persistence is mixed; several modules are partial, demo, or UI-only.
- Production DB migration history needs approved introspection/adoption.
- GitLab connectivity/project/runners/backups are unverified; GitHub remains canonical.
- Provider/local-repository/callback runtime activation requires secure allowlist/secret configuration.
- Monitoring, centralized logs, alerts, and backup/restore drills lack Production evidence.
- Git access cannot prevent an authorized developer from copying source; controls reduce and attribute risk, not eliminate it.
