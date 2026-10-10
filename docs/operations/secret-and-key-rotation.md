# Secret and key rotation

Owner: Security · Last verified: 2026-09-02

Use individual owners, least scope, expiry, masked/protected stores, and dual-control for Production. Rotate auth session signing, workflow callback HMAC, config master keys, repository/provider credentials, SSH profiles, and Vercel/GitLab tokens independently. `SEKHEM_CONFIG_MASTER_KEY_PREVIOUS` supports a bounded re-encryption window; remove it after verified rotation. Never transmit values in chat, Git, tickets, logs, or screenshots.
