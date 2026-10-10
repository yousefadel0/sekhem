# Data flows

Owner: Architecture · Last verified: 2026-09-02

1. Human browser requests carry an HttpOnly session cookie; Backend guards resolve role before controller work.
2. Workflow machines sign timestamp plus raw body with HMAC; browser cookies are not accepted as machine authentication.
3. R&D resolves an enabled repository/provider/model, pins a commit, filters files/secrets, builds bounded chunks, and sends only approved matching content.
4. Provider JSON is parsed strictly, validated against the canonical schema, then citations are checked against exact snapshot lines.
5. Only safe runtime metadata, validation paths/codes, evidence, and candidate records are persisted. Raw prompts/model output and credentials are not persisted.
6. R&D submission idempotency hashes the client key and request envelope; raw keys are not stored.
