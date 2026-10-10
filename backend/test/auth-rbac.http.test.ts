import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import type { AuthRoleDto } from "../src/auth/auth.dto";

const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";
const testPassword = "test-only-authz-password";
const testEmail = "authz@example.test";

type HttpBody<T = unknown> = {
  data: T;
  meta: { timestamp?: string };
  errors: { code: string; message: string }[];
  auditEvent?: Record<string, unknown>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertNoLeak(body: unknown): void {
  const serialized = JSON.stringify(body).toLowerCase();

  for (const forbidden of ["password", "secret", "token", "sekhem_session=", "sekhem_auth", "stack"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
}

describe("Backend RBAC authorization boundary", () => {
  let app: INestApplication;
  let baseUrl: string;
  const previousEnv = { ...process.env };

  before(async () => {
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = testEmail;
    process.env.SEKHEM_AUTH_STAGING_PASSWORD_HASH = sha256(testPassword);
    process.env.SEKHEM_AUTH_SESSION_SECRET = "test-only-authz-session-secret-with-enough-length";
    process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = "Authz Test User";
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

  async function sessionCookie(role: AuthRoleDto): Promise<string> {
    process.env.SEKHEM_AUTH_STAGING_ROLE = role;
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    assert.equal(response.status, 201);

    return response.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  async function request(method: string, route: string, cookie?: string, body?: Record<string, unknown>): Promise<{ status: number; body: HttpBody }> {
    const response = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    return {
      status: response.status,
      body: (await response.json()) as HttpBody
    };
  }

  function assertUnauthorized(result: { status: number; body: HttpBody }): void {
    assert.equal(result.status, 401);
    assert.equal(result.body.data, null);
    assert.equal(result.body.auditEvent, undefined);
    assert.deepEqual(result.body.errors[0], { code: "UNAUTHORIZED", message: "Authentication required" });
    assertNoLeak(result.body);
  }

  function assertForbidden(result: { status: number; body: HttpBody }): void {
    assert.equal(result.status, 403);
    assert.equal(result.body.data, null);
    assert.equal(result.body.auditEvent, undefined);
    assert.deepEqual(result.body.errors[0], { code: "FORBIDDEN", message: "You do not have permission to perform this action." });
    assertNoLeak(result.body);
  }

  it("keeps health and auth session routes available", async () => {
    const health = await request("GET", "/api/health");
    assert.equal(health.status, 200);
    assertNoLeak(health.body);

    const session = await request("GET", "/api/auth/session");
    assertUnauthorized(session);
  });

  it("rejects protected product read route without a session", async () => {
    const result = await request("GET", "/api/projects");

    assertUnauthorized(result);
  });

  it("allows Viewer to access product and R&D read routes", async () => {
    const viewer = await sessionCookie("Viewer");
    const projects = await request("GET", "/api/projects", viewer);
    const radar = await request("GET", "/api/rd-radar/status", viewer);

    assert.equal(projects.status, 200);
    assert.equal(Array.isArray(projects.body.errors), true);
    assert.equal(projects.body.errors.length, 0);
    assert.equal(radar.status, 200);
    assert.equal(radar.body.errors.length, 0);
    assertNoLeak(projects.body);
    assertNoLeak(radar.body);
  });

  for (const role of ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"] as const) {
    it(`${role}: project tools are available and global administration remains Admin-only`, async () => {
      const cookie = await sessionCookie(role);
      for (const route of ["/api/projects", "/api/rd-radar/status", "/api/workflows/runs", "/api/audit-events"]) {
        assert.equal((await request("GET", route, cookie)).status, 200, `${role} ${route}`);
      }
      const draft = await request("POST", "/api/ai-patch/drafts", cookie, {
        title: `${role} test draft`, requestedBy: "spoofed", targetArea: "review", intent: "Review-only fixture.", constraints: [], safetyNotes: []
      });
      assert.equal(draft.status, 201);
      assert.equal((draft.body.data as { requestedBy: string }).requestedBy, `Authz Test User [${role}]`);
      const workflow = await request("POST", "/api/workflows/events", cookie, { eventType: "initiative.started", projectId, requestedBy: "spoofed", requestedRole: "Admin" });
      assert.equal(workflow.status, 201);
      assert.equal((workflow.body.data as { requestedRole: string }).requestedRole, role);
      const settings = await request("GET", "/api/ai-gateway/provider-settings", cookie);
      if (role === "Admin") assert.equal(settings.status, 200); else assertForbidden(settings);
      const admin = await request("GET", "/api/admin/users", cookie);
      if (role !== "Admin") assertForbidden(admin);
      else {
        // A staging Admin without an organization cannot administer tenant data.
        // Durable organization-backed Admin success is tested separately.
        assert.equal(admin.status, 403);
        assert.equal(admin.body.errors[0]?.message, "ADMIN_ORGANIZATION_ACCESS_DENIED");
        assertNoLeak(admin.body);
      }
    });
  }
  it("uses the authenticated actor for workflow and AI Patch audit fields", async () => {
    const technicalReviewer = await sessionCookie("Technical Reviewer");
    const draft = await request("POST", "/api/ai-patch/drafts", technicalReviewer, {
      title: "Controlled review draft",
      requestedBy: "Spoofed Admin",
      targetArea: "review",
      intent: "Create a review-only draft record.",
      constraints: [],
      safetyNotes: []
    });

    assert.equal(draft.status, 201);
    assert.equal((draft.body.data as { requestedBy?: string }).requestedBy, "Authz Test User [Technical Reviewer]");
    const draftId = (draft.body.data as { draftId?: string }).draftId;
    assert.ok(draftId);

    for (const status of ["DRAFT_PREPARED", "REVIEW_REQUIRED"]) {
      const prepared = await request("POST", `/api/ai-patch/drafts/${draftId}/status`, technicalReviewer, {
        status, reason: "Fixture review progression.", reviewNotes: "Reviewed test draft."
      });
      assert.equal(prepared.status, 201);
    }

    const approval = await request("POST", `/api/ai-patch/drafts/${draftId}/approve`, technicalReviewer, {
      changedBy: "Spoofed PM",
      reason: "Project operator approval.",
      reviewNotes: "No action."
    });
    assert.equal(approval.status, 201);

    const pm = await sessionCookie("PM");
    const workflow = await request("POST", "/api/workflows/events", pm, {
      eventType: "initiative.started",
      projectId,
      requestedBy: "Spoofed Admin",
      requestedRole: "Admin"
    });
    assert.equal(workflow.status, 201);
    assert.equal((workflow.body.data as { requestedBy?: string }).requestedBy, "Authz Test User");
    assert.equal((workflow.body.data as { requestedRole?: string }).requestedRole, "PM");
  });

  it("allows Technical Reviewer to create R&D technical review records", async () => {
    const technicalReviewer = await sessionCookie("Technical Reviewer");
    const result = await request("POST", "/api/rd-radar/reviews", technicalReviewer, {
      evidenceItemId: "evidence-terraform-modules",
      relevance: 4,
      reliability: 4,
      freshness: 4,
      businessApplicability: 4,
      reviewerDecision: "needs_review",
      notes: "Technical review authorization smoke test."
    });

    assert.equal(result.status >= 200 && result.status < 300, true);
    assertNoLeak(result.body);
  });

  it("allows PM to create and decide approvals with authenticated audit actor", async () => {
    const pm = await sessionCookie("PM");
    const create = await request("POST", "/api/approvals", pm, {
      projectId,
      initiativeSlug,
      title: "RBAC approval request",
      description: "RBAC approval decision test.",
      module: "Execution Path Selector",
      priority: "high",
      type: "execution_path",
      requestedBy: "Spoofed PM",
      requestedRole: "Spoofed Role",
      approverRole: "PM"
    });

    assert.equal(create.status >= 200 && create.status < 300, true);
    assert.equal(create.body.auditEvent?.actor, "Authz Test User [PM]");
    assert.equal(create.body.auditEvent?.actorType, "user");
    assert.notEqual(create.body.auditEvent?.actor, "Spoofed PM");
    const approvalId = (create.body.data as { id?: unknown } | null)?.id;
    assert.equal(typeof approvalId, "string");

    const decision = await request("POST", `/api/approvals/${approvalId}/decision`, pm, {
      actorName: "Spoofed Approver",
      actorRole: "assistant",
      decision: "approved",
      note: "RBAC authorization test."
    });

    assert.equal(decision.status >= 200 && decision.status < 300, true);
    assert.equal(decision.body.auditEvent?.actor, "Authz Test User [PM]");
    assert.equal(decision.body.auditEvent?.actorType, "user");
    assert.notEqual(decision.body.auditEvent?.actor, "Spoofed Approver");
    assertNoLeak(create.body);
    assertNoLeak(decision.body);
  });
});
