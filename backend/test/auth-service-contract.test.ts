import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { AuthService } from "../src/auth/auth.service";

describe("Authentication cookie contract", () => {
  it("keeps the session cookie HttpOnly, Secure and Strict while logout clears it", async () => {
    const password = "test-only-password";
    const service = new AuthService();
    service.setEnvForTest({
      SEKHEM_AUTH_ENABLED: "true",
      SEKHEM_AUTH_STAGING_EMAIL: "admin@example.test",
      SEKHEM_AUTH_STAGING_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
      SEKHEM_AUTH_SESSION_SECRET: "test-only-session-secret-with-enough-length",
      SEKHEM_AUTH_STAGING_ROLE: "Admin"
    });

    const login = await service.login({ email: "admin@example.test", password });
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
    const cookie = service.authCookie(login.token, login.maxAgeSeconds);
    const session = await service.session(cookie);
    const cleared = service.clearCookie();

    assert.equal(session.authenticated, true);
    assert.equal(session.user.role, "Admin");
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /; SameSite=Strict/);
    assert.match(cleared, /; Max-Age=0/);
    } finally {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  });
});

describe("Durable session revocation precision", () => {
  const secret = "fixture-only-session-secret-at-least-32-characters";
  const revokedAt = new Date("2026-10-09T20:00:00.400Z");
  const claims = { sub: "user-a", sessionId: "session-a", email: "a@example.test", displayName: "A", role: "Viewer",
    iat: Math.floor(revokedAt.getTime() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const cookie = `sekhem_session=${header}.${payload}.${createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")}`;
  function service(createdAt?: Date, revoked = false) {
    const auth = new AuthService({ user: { findUnique: async () => ({ id: "user-a", status: "active", sessionRevokedAt: revokedAt }) },
      userSession: { findUnique: async () => ({ userId: "user-a", createdAt, revokedAt: revoked ? revokedAt : null, expiresAt: new Date(Date.now() + 3600000) }) } } as never);
    auth.setEnvForTest({ SEKHEM_AUTH_DB_MODE: "true", SEKHEM_AUTH_SESSION_SECRET: secret }); return auth;
  }
  it("accepts a fresh durable session after revocation within the same JWT second", async () => {
    assert.equal((await service(new Date("2026-10-09T20:00:00.500Z")).validateDurableSession(cookie)).sub, "user-a");
  });
  for (const createdAt of [new Date("2026-10-09T20:00:00.300Z"), revokedAt, undefined]) it(`rejects old, equal or missing creation time: ${createdAt?.toISOString() ?? "missing"}`, async () => {
    await assert.rejects(service(createdAt).validateDurableSession(cookie), /revoked/);
  });
  it("explicit session revocation remains authoritative even for a later creation timestamp", async () => {
    await assert.rejects(service(new Date("2026-10-09T20:00:00.500Z"), true).validateDurableSession(cookie), /revoked/);
  });
});
