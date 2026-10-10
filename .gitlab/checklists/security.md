# Security review checklist

- Confirm least-privilege RBAC and server-derived audit actor.
- Confirm machine callbacks use the dedicated authenticated contract.
- Confirm outbound URLs and local paths fail closed against configured allowlists.
- Confirm redirects cannot bypass egress policy.
- Confirm no secrets, tokens, cookies, private keys, raw model output, or repository content enter logs/artifacts.
- Confirm Production variables are masked, protected, and unavailable to unprotected branches.
- Confirm dependency, schema, parser, and citation behavior is not weakened.
