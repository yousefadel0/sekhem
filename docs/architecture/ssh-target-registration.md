# SSH target registration and connection validation

This slice adds configuration and handshake evidence only. It exposes no Agent tool, shell, command, file operation, operational grant, or execution authority. The local Trusted Runtime and its grants remain independent.

## Authenticated API

- `POST /projects/:projectId/ssh-targets`: exact fields `targetId`, `expectedVersion`, `requestId`, `configuration`, `acknowledgement: "PIN_HOST_IDENTITY"`. New targets require `targetId: null`, `expectedVersion: 0`; the server derives an identity from project/org/actor/request identity. Updates require the returned identity and current version.
- Configuration: `host`, `port`, `username`, `hostFingerprint` (canonical OpenSSH SHA256), `credentialRef`, `status` (`REGISTERED` or terminal `REVOKED`). A pin must be independently verified by the configuring user; there is no trust-on-first-use or automatic repinning.
- `GET /projects/:projectId/ssh-targets/:id?version=N`: authenticated owner/project-scoped configuration history and bounded latest connection result. Always `executionAuthority: NONE`.
- `POST /projects/:projectId/ssh-targets/:id/connection-validations`: exact fields `expectedVersion`, `requestId`, `acknowledgement: "VALIDATE_CONNECTION_ONLY"`.

Every operation validates the durable session, organization and existing project authorization. Configuration and connection validation require existing project UPDATE permission and ownership. Read requires READ permission and ownership. A local runtime grant never authorizes SSH validation.

## Credentials

Server-only `SEKHEM_SSH_CREDENTIAL_REFERENCES` maps opaque references to `{ projectId, organizationId, privateKeyEnv, passphraseEnv? }`. Key variable names must start with `SEKHEM_SSH_KEY_`; optional passphrase variables with `SEKHEM_SSH_PASSPHRASE_`. Provision these through the deployment secret mechanism. Clients cannot supply keys, paths, environment names or commands. No private keys are stored in PostgreSQL. Ephemeral key buffers are cleared after transport completion; environment secrets remain under server deployment control.

The SSH adapter supplies a mandatory host verifier, authenticates with the scoped key, then destroys the connection. It opens no channels. A mismatch terminates before authentication. Validation has a 10-second total bound and persists only safe classifications/timestamps and configuration digest, never raw SSH errors or banners. Connection success is not command/write authorization.

## Persistence and recovery

`SshTarget` owns a current revision pointer. `SshTargetRevision` is immutable, audited with actor/session/request identity and digests. `SshConnectionValidation` reserves a unique request before transport and permits one terminal transition. PostgreSQL transaction advisory locks serialize per-target configuration and reservations. Stale versions/conflicting replay fail closed. Same-request replay returns its existing reservation/result without reconnecting. Configuration changes invalidate in-flight certification.

An interrupted reservation stays `PENDING` (uncertain), blocks new connection checks and cannot become successful on reload. Explicit administrative recovery of such reservations is outside this slice. No SSH metadata is appended to AgentRun history or model context; existing sequence/projection/recovery remain unchanged.

Migration `20261005090000_ssh_target_registration` must be deployed through the existing migration process before these endpoints are used. Implementation validation applies it only to a disposable test schema, never application data.
