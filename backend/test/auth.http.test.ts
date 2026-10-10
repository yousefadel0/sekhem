import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";

type HttpBody<T = unknown> = {
  data: T;
  meta: { timestamp?: string };
  errors: { code: string; message: string }[];
};

type AuthSessionBody = HttpBody<{
  authenticated: boolean;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
  expiresAt: string;
}>;

const testPassword = "test-only-auth-password";
const testEmail = "pm@example.test";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoSecretLeak(body: unknown): void {
  const serialized = JSON.stringify(body).toLowerCase();

  assert.equal(serialized.includes(testPassword.toLowerCase()), false);
  assert.equal(serialized.includes(sha256(testPassword)), false);
  assert.equal(serialized.includes("test-only-session-secret"), false);
  assert.equal(serialized.includes("sekhem_auth_session_secret"), false);
  assert.equal(serialized.includes("sekhem_auth_staging_password_hash"), false);
  assert.equal(serialized.includes("sekhem_session="), false);
  assert.equal(serialized.includes("stack"), false);
}

describe("Auth HTTP boundary", () => {
  let app: INestApplication;
  let baseUrl: string;
  const previousEnv = { ...process.env };

  before(async () => {
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = testEmail;
    process.env.SEKHEM_AUTH_STAGING_PASSWORD_HASH = sha256(testPassword);
    process.env.SEKHEM_AUTH_SESSION_SECRET = "test-only-session-secret-with-enough-length";
    process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = "PM Test User";
    process.env.SEKHEM_AUTH_STAGING_ROLE = "PM";

    app = await createContractTestApp();
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0);

    const server = app.getHttpServer() as { address: () => string | { port: number } | null };
    const address = server.address();

    if (typeof address !== "object" || address === null) {
      throw new Error("Expected HTTP server to listen on a local port.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
    process.env = previousEnv;
  });

  it("sets an HTTP-only development cookie on valid login without token in response body", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const body = (await response.json()) as AuthSessionBody;
    const setCookie = response.headers.get("set-cookie") ?? "";

    assert.equal(response.status, 201);
    assert.equal(body.data.authenticated, true);
    assert.equal(body.data.user.email, testEmail);
    assert.equal(body.data.user.displayName, "PM Test User");
    assert.equal(body.data.user.role, "PM");
    assert.ok(Date.parse(body.data.expiresAt));
    assert.match(setCookie, /^sekhem_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.doesNotMatch(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /Max-Age=/);
    assertNoSecretLeak(body);
  });

  it("returns safe unauthorized error for invalid login", async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "wrong-password" })
    });
    const body = (await response.json()) as HttpBody<null>;

    assert.equal(response.status, 401);
    assert.equal(body.data, null);
    assert.deepEqual(body.errors[0], { code: "UNAUTHORIZED", message: "Invalid credentials" });
    assertNoSecretLeak(body);
  });

  it("returns active session from a valid cookie", async () => {
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const cookie = loginResponse.headers.get("set-cookie") ?? "";
    const sessionCookie = cookie.split(";")[0] ?? "";

    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { cookie: sessionCookie }
    });
    const body = (await response.json()) as AuthSessionBody;

    assert.equal(response.status, 200);
    assert.equal(body.data.authenticated, true);
    assert.equal(body.data.user.email, testEmail);
    assert.equal(body.data.user.role, "PM");
    assertNoSecretLeak(body);
  });

  it("fails safely without or with invalid cookie", async () => {
    const missing = await fetch(`${baseUrl}/api/auth/session`);
    const missingBody = (await missing.json()) as HttpBody<null>;

    assert.equal(missing.status, 401);
    assert.deepEqual(missingBody.errors[0], { code: "UNAUTHORIZED", message: "Authentication required" });
    assertNoSecretLeak(missingBody);

    const invalid = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { cookie: "sekhem_session=invalid" }
    });
    const invalidBody = (await invalid.json()) as HttpBody<null>;

    assert.equal(invalid.status, 401);
    assert.deepEqual(invalidBody.errors[0], { code: "UNAUTHORIZED", message: "Authentication required" });
    assertNoSecretLeak(invalidBody);
  });

  it("clears session cookie on logout", async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    const body = (await response.json()) as HttpBody<{ authenticated: false; loggedOut: true }>;
    const setCookie = response.headers.get("set-cookie") ?? "";

    assert.equal(response.status, 201);
    assert.deepEqual(body.data, { authenticated: false, loggedOut: true });
    assert.match(setCookie, /^sekhem_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.doesNotMatch(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Max-Age=0/);
    assertNoSecretLeak(body);
  });
});
