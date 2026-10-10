import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { PrismaService } from "../src/data-access/prisma.service";
import { AuthService } from "../src/auth/auth.service";

// Read-only diagnosis of the original HTTP fixtures. No auth overrides or DB writes.
test("post-runtime audit: original HTTP fixture assumptions", async t => {
  const db = new PrismaService();
  const secret = "audit-only-fixture-signing-key-with-enough-length";
  try {
    console.log(JSON.stringify({ runtimeMode: process.env.SEKHEM_RUNTIME_MODE ?? null, dbAuthMode: process.env.SEKHEM_AUTH_DB_MODE ?? null, nodeEnv: process.env.NODE_ENV ?? null }));
    assert.ok(process.env.SEKHEM_AUTH_DB_MODE === "true" || process.env.SEKHEM_RUNTIME_MODE === "postgres_read");
    for (const sub of ["user-http-smoke", "user-http-write", "user-rd-radar-http"]) {
      await t.test(`${sub}: signed fixture has no durable user and is denied`, async () => {
        assert.equal(await db.user.findUnique({ where: { id: sub }, select: { id: true } }), null);
        const auth = new AuthService(db); auth.setEnvForTest({ ...process.env, SEKHEM_AUTH_SESSION_SECRET: secret });
        const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
        const payload = Buffer.from(JSON.stringify({ sub, email: "audit@example.invalid", displayName: "Audit fixture", role: "PM", exp: Math.floor(Date.now()/1000)+60 })).toString("base64url");
        const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
        const cookie = `sekhem_session=${header}.${payload}.${signature}`;
        assert.equal(auth.sessionClaims(cookie).sub, sub);
        await assert.rejects(auth.validateDurableSession(cookie), (error: any) => error.getStatus() === 401 && error.message === "User not found");
      });
    }
    for (const email of ["authz@example.test", "pm@example.test", "provider-settings@example.test", "ai-patch@example.test", "automation@example.test"]) {
      await t.test(`${email}: env credential fixture is absent from database auth`, async () => {
        assert.equal(await db.user.findUnique({ where: { email }, select: { id: true } }), null);
        const password = "audit-only-password", auth = new AuthService(db);
        auth.setEnvForTest({ ...process.env, SEKHEM_AUTH_ENABLED: "true", SEKHEM_AUTH_SESSION_SECRET: secret, SEKHEM_AUTH_STAGING_EMAIL: email, SEKHEM_AUTH_STAGING_PASSWORD_HASH: createHash("sha256").update(password).digest("hex") });
        await assert.rejects(auth.login({ email, password }), (error: any) => error.getStatus() === 401 && error.message === "Invalid credentials");
      });
    }
    await t.test("no isolated runtime fixture rows remain after cleanup", async () => {
      for (const table of [db.user, db.organization, db.project, db.userSession] as const)
        assert.equal(await (table as any).count({ where: { id: { startsWith: "runtime-test-" } } }), 0);
    });
  } finally { await db.$disconnect(); }
});
