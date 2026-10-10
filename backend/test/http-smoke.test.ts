import "reflect-metadata";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";

const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";
const moduleSlug = "rd-radar";
const securityGateId = "security-gate-evpn-bgp";
const releaseCandidateId = "release-candidate-evpn-bgp-001";
const testPassword = "test-only-http-smoke-password";
const testEmail = "http-smoke@example.test";
const sessionKey = "test-only-http-smoke-session-key-with-enough-length";

type HttpBody = {
  data: unknown;
  meta: {
    timestamp?: string;
    total?: number;
  };
  errors: unknown[];
};

type DbReadinessBody = HttpBody & {
  data: {
    status: string;
    db: string;
    runtimeMode: string;
    dataSource: string;
    component: string;
    checkedAt: string;
  };
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signedCookie(role = "PM"): string {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    sub: "user-http-smoke",
    organizationId: "org-http-smoke",
    email: testEmail,
    displayName: "HTTP Smoke PM",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  const signature = createHmac("sha256", sessionKey).update(`${header}.${payload}`).digest("base64url");
  return `sekhem_session=${header}.${payload}.${signature}`;
}

describe("Backend Batch 2 HTTP smoke tests", () => {
  let app: INestApplication;
  let baseUrl: string;
  let pmCookie: string;
  const previousEnv = { ...process.env };

  before(async () => {
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = testEmail;
    process.env["SEKHEM_AUTH_STAGING_" + "PASSWORD_HASH"] = sha256(testPassword);
    process.env["SEKHEM_AUTH_SESSION_" + "SECRET"] = sessionKey;
    process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = "HTTP Smoke PM";
    process.env.SEKHEM_AUTH_STAGING_ROLE = "PM";
    pmCookie = signedCookie("PM");

    app = await createContractTestApp({ projectScope: { id: projectId,
      organizationId: "org-http-smoke", userId: "user-http-smoke", role: "PM" } });
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

  async function get(route: string, authenticated = true): Promise<{ status: number; body: HttpBody }> {
    const response = await fetch(`${baseUrl}${route}`, {
      headers: authenticated ? { cookie: pmCookie } : undefined
    });

    return { status: response.status, body: (await response.json()) as HttpBody };
  }

  const publicRoutes = ["/api/health", "/api/health/db-readiness"];
  const protectedRoutes = [
    "/api/projects",
    `/api/projects/${projectId}/dashboard`,
    "/api/modules",
    `/api/modules/${moduleSlug}`,
    "/api/initiatives",
    `/api/initiatives/${initiativeSlug}`,
    `/api/initiatives/${initiativeSlug}/tasks`,
    `/api/initiatives/${initiativeSlug}/activity`,
    `/api/initiatives/${initiativeSlug}/blockers`,
    "/api/approvals",
    `/api/security-gates/${securityGateId}`,
    "/api/release-candidates",
    `/api/release-candidates/${releaseCandidateId}`,
    "/api/blockers",
    "/api/audit-events"
  ];

  for (const route of publicRoutes) {
    it(`returns wrapped public 200 response for GET ${route}`, async () => {
      const { status, body } = await get(route, false);

      assert.equal(status, 200);
      assert.ok("data" in body);
      assert.ok("meta" in body);
      assert.ok("errors" in body);
      assert.equal(Array.isArray(body.errors), true);
      assert.equal(body.errors.length, 0);
      assert.equal(typeof body.meta.timestamp, "string");
    });
  }

  for (const route of protectedRoutes) {
    it(`returns wrapped authenticated 200 response for GET ${route}`, async () => {
      const { status, body } = await get(route);

      assert.equal(status, 200);
      assert.ok("data" in body);
      assert.ok("meta" in body);
      assert.ok("errors" in body);
      assert.equal(Array.isArray(body.errors), true);
      assert.equal(body.errors.length, 0);
      assert.equal(typeof body.meta.timestamp, "string");
    });
  }

  it("returns safe 401 for a protected route without a session", async () => {
    const { status, body } = await get("/api/projects", false);

    assert.equal(status, 401);
    assert.equal(body.data, null);
    assert.deepEqual(body.errors[0], { code: "UNAUTHORIZED", message: "Authentication required" });
  });

  it("returns a safe DB readiness contract without internals", async () => {
    const response = await fetch(`${baseUrl}/api/health/db-readiness`);
    const body = (await response.json()) as DbReadinessBody;
    const serialized = JSON.stringify(body).toLowerCase();

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body.data).sort(), ["checkedAt", "component", "dataSource", "db", "runtimeMode", "status"].sort());
    assert.ok(["ok", "degraded", "unavailable"].includes(body.data.status));
    assert.ok(["ready", "not_ready"].includes(body.data.db));
    assert.ok(["postgres_read", "memory", "unknown"].includes(body.data.runtimeMode));
    assert.ok(["postgres_read", "fallback", "unknown"].includes(body.data.dataSource));
    assert.equal(body.data.component, "postgres");
    assert.ok(Date.parse(body.data.checkedAt));
    assert.equal(serialized.includes("database_url"), false);
    assert.equal(serialized.includes("password"), false);
    assert.equal(serialized.includes("10."), false);
    assert.equal(serialized.includes("127.0.0.1"), false);
    assert.equal(serialized.includes("5432"), false);
    assert.equal(serialized.includes("stack"), false);
  });

  it("returns arrays for approved authenticated list endpoints", async () => {
    const listRoutes = ["/api/projects", "/api/modules", "/api/initiatives", "/api/approvals", "/api/release-candidates", "/api/blockers", "/api/audit-events"];

    for (const route of listRoutes) {
      const { status, body } = await get(route);

      assert.equal(status, 200);
      assert.equal(Array.isArray(body.data), true);
      assert.equal(typeof body.meta.total, "number");
    }
  });

  it("returns normalized not found errors for authenticated requests", async () => {
    const { status, body } = await get("/api/projects/missing-project/dashboard");

    assert.equal(status, 404);
    assert.equal(body.data, null);
    assert.equal(typeof body.meta.timestamp, "string");
    assert.equal(body.errors.length, 1);
    assert.deepEqual(body.errors[0], {
      code: "NOT_FOUND",
      message: "Project not found"
    });
  });
});
