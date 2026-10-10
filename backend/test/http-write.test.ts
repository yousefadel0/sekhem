import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";

const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";
const executionPathId = "path-validation-pack";
const loginEmail = "write-test@example.test";
const loginPass = "write-test-pass";
const sessionKey = "write-test-session-key-with-enough-length";
const expectedAuditActor = "Write Test PM [PM]";

const spoofedActors = ["Program Lead", "Security Officer", "Architecture Review", "QA Lead", "Assistant"];

type WriteBody = {
  data: Record<string, unknown> | null;
  auditEvent?: Record<string, unknown>;
  meta: { timestamp?: string };
  errors: unknown[];
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
    sub: "user-http-write",
    email: loginEmail,
    displayName: "Write Test PM",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  const signature = createHmac("sha256", sessionKey).update(`${header}.${payload}`).digest("base64url");
  return `sekhem_session=${header}.${payload}.${signature}`;
}

function assertNoLeak(body: unknown): void {
  const serialized = JSON.stringify(body).toLowerCase();

  for (const forbidden of ["password", "secret", "token", "sekhem_session=", "sekhem_auth", "stack"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
}

function assertWriteSuccess(result: { status: number; body: WriteBody }, action: string): void {
  assert.equal(result.status >= 200 && result.status < 300, true);
  assert.ok(result.body.data);
  assert.ok(result.body.auditEvent);
  assert.equal(result.body.auditEvent.action, action);
  assert.equal(result.body.auditEvent.actor, expectedAuditActor);
  assert.equal(result.body.auditEvent.actorType, "user");
  for (const spoofedActor of spoofedActors) {
    assert.notEqual(result.body.auditEvent.actor, spoofedActor);
  }
  assert.equal(typeof result.body.meta.timestamp, "string");
  assert.equal(Array.isArray(result.body.errors), true);
  assert.equal(result.body.errors.length, 0);
  assertNoLeak(result.body);
}

function assertNormalizedError(result: { status: number; body: WriteBody }): void {
  assert.equal(result.status >= 400, true);
  assert.equal(result.body.data, null);
  assert.equal(result.body.auditEvent, undefined);
  assert.equal(typeof result.body.meta.timestamp, "string");
  assert.equal(Array.isArray(result.body.errors), true);
  assert.ok(result.body.errors.length > 0);
  assertNoLeak(result.body);
}

describe("Backend Batch 5 HTTP write endpoint tests", () => {
  let app: INestApplication;
  let baseUrl: string;
  let authCookie: string;
  const previousEnv = { ...process.env };

  before(async () => {
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = loginEmail;
    process.env["SEKHEM_AUTH_STAGING_" + "PASSWORD_HASH"] = sha256(loginPass);
    process.env["SEKHEM_AUTH_SESSION_" + "SECRET"] = sessionKey;
    process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = "Write Test PM";
    process.env.SEKHEM_AUTH_STAGING_ROLE = "PM";
    authCookie = signedCookie("PM");

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

  async function jsonPost(route: string, body: Record<string, unknown>): Promise<{ status: number; body: WriteBody }> {
    const response = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: authCookie },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: (await response.json()) as WriteBody };
  }

  async function jsonPatch(route: string, body: Record<string, unknown>): Promise<{ status: number; body: WriteBody }> {
    const response = await fetch(`${baseUrl}${route}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: authCookie },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: (await response.json()) as WriteBody };
  }

  it("creates a draft-only handoff with authenticated audit actor", async () => {
    const result = await jsonPost(`/api/initiatives/${initiativeSlug}/handoff`, {
      actorName: "Program Lead",
      actorRole: "Program Owner",
      reason: "Prepare an HTTP handoff for human review"
    });

    assertWriteSuccess(result, "initiative_handoff_draft_requested");
    assert.equal(result.body.data?.createdAsDraftOnly, true);
    assert.equal(result.body.data?.autoApply, false);
  });

  it("starts initiative with authenticated audit actor", async () => {
    const result = await jsonPost(`/api/initiatives/${initiativeSlug}/start`, {
      actorName: "Program Lead",
      actorRole: "Program Owner",
      reason: "HTTP write endpoint smoke test"
    });

    assertWriteSuccess(result, "initiative_started");
    assert.equal(result.body.data?.slug, initiativeSlug);
  });

  it("creates and decides approval while ignoring spoofed audit actor fields", async () => {
    const create = await jsonPost("/api/approvals", {
      projectId,
      initiativeSlug,
      title: "HTTP decision approval request",
      description: "HTTP decision smoke test approval.",
      module: "Execution Path Selector",
      priority: "high",
      type: "execution_path",
      requestedBy: "Program Lead",
      requestedRole: "Program Owner",
      approverRole: "Security Officer"
    });
    assertWriteSuccess(create, "approval_requested");

    const approvalId = create.body.data?.id;
    assert.equal(typeof approvalId, "string");

    const result = await jsonPost(`/api/approvals/${approvalId}/decision`, {
      actorName: "Security Officer",
      actorRole: "Security Officer",
      decision: "approved",
      note: "HTTP write endpoint smoke test"
    });

    assertWriteSuccess(result, "approval_approved");
    assert.equal(result.body.data?.status, "approved");
  });

  it("selects execution path with matching approval and authenticated audit actor", async () => {
    const create = await jsonPost("/api/approvals", {
      projectId,
      initiativeSlug,
      title: "HTTP matching execution path approval",
      description: "Matching approval for execution path selection.",
      module: "Execution Path Selector",
      priority: "high",
      type: "execution_path",
      requestedBy: "Program Lead",
      requestedRole: "Program Owner",
      approverRole: "Security Officer"
    });
    assertWriteSuccess(create, "approval_requested");

    const approvalId = create.body.data?.id;
    assert.equal(typeof approvalId, "string");

    const decision = await jsonPost(`/api/approvals/${approvalId}/decision`, {
      actorName: "Security Officer",
      actorRole: "Security Officer",
      decision: "approved"
    });
    assertWriteSuccess(decision, "approval_approved");

    const result = await jsonPost(`/api/initiatives/${initiativeSlug}/execution-paths/${executionPathId}/select`, {
      actorName: "Program Lead",
      actorRole: "Program Owner",
      approvalId,
      reason: "HTTP execution path selection smoke test"
    });

    assertWriteSuccess(result, "execution_path_selected");
  });

  it("updates task status with authenticated audit actor", async () => {
    const result = await jsonPatch("/api/tasks/task-technical-memo/status", {
      actorName: "Architecture Review",
      actorRole: "Technical Director",
      status: "review",
      lane: "testing",
      reason: "HTTP write endpoint smoke test"
    });

    assertWriteSuccess(result, "task_status_updated");
    assert.equal(result.body.data?.status, "review");
  });

  it("creates blocker with authenticated audit actor", async () => {
    const result = await jsonPost("/api/blockers", {
      projectId,
      initiativeSlug,
      title: "HTTP blocker",
      description: "HTTP blocker smoke test.",
      type: "approval",
      severity: "high",
      cause: "Pending human review",
      owner: "QA Lead",
      evidence: "HTTP test evidence",
      suggestedAction: "Review and decide",
      nextStep: "Assign reviewer",
      rollbackOption: "No runtime change required"
    });

    assertWriteSuccess(result, "blocker_created");
    assert.equal(result.body.data?.status, "open");
  });

  it("invalid write body returns normalized error response without user-action audit event", async () => {
    assertNormalizedError(await jsonPost("/api/blockers", {}));
  });

  it("assistant client actor fields are ignored for authenticated PM approval decision", async () => {
    const create = await jsonPost("/api/approvals", {
      projectId,
      initiativeSlug,
      title: "HTTP assistant spoof approval",
      description: "Client actor fields should not control audit actor.",
      module: "Execution Path Selector",
      priority: "high",
      type: "execution_path",
      requestedBy: "Program Lead",
      requestedRole: "Program Owner",
      approverRole: "Security Officer"
    });
    assertWriteSuccess(create, "approval_requested");

    const approvalId = create.body.data?.id;
    assert.equal(typeof approvalId, "string");

    const result = await jsonPost(`/api/approvals/${approvalId}/decision`, {
      actorName: "Assistant",
      actorRole: "assistant",
      decision: "approved"
    });

    assertWriteSuccess(result, "approval_approved");
    assert.equal(result.body.data?.status, "approved");
  });

  it("execution path selection without matching approval is rejected without user-action audit event", async () => {
    assertNormalizedError(await jsonPost(`/api/initiatives/${initiativeSlug}/execution-paths/${executionPathId}/select`, {
      actorName: "Program Lead",
      actorRole: "Program Owner",
      reason: "Missing matching approval should fail"
    }));
  });
});
