# System architecture

Owner: Architecture · Last verified: 2026-09-02

```text
Browser (app.sekhem-ai.com)
  -> cookie session + CORS
NestJS API (127.0.0.1:3001; private ingress :8080)
  -> PostgreSQL (selected persisted modules)
  -> read-only GitHub/GitLab/local repository adapters
  -> allowlisted OpenAI-compatible provider (R&D only, explicit action)
  -> in-memory/partial product workflow services
Vercel hosts the Next.js frontend; systemd hosts sekhem-backend.service.
```

Git hosting and runtime deployment are separate planes. GitHub is canonical until explicit cutover. GitLab assets in this repository are preparation, not proof of a running GitLab control plane.
