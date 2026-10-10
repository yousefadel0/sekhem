import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";

const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";
const testEmail = "automation@example.test";
const testPassword = "automation-test-password";
const callbackSecret = "test-only-machine-callback-secret-32-bytes-minimum";
let sessionCookie = "";

type ContractBody = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  auditEvent?: Record<string, unknown>;
  activityEvent?: Record<string, unknown>;
  meta: {
    timestamp?: string;
    total?: number;
  };
  errors: unknown[];
};

type WorkflowCallbackBody = {
  accepted: boolean;
  workflowRunId?: string;
  status?: string;
  duplicate?: boolean;
  code?: string;
  message?: string;
};

async function jsonPost(baseUrl: string, route: string, body: Record<string, unknown>): Promise<{ status: number; body: ContractBody }> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: (await response.json()) as ContractBody
  };
}

async function workflowCallbackPost(baseUrl: string, body: Record<string, unknown>): Promise<{ status: number; body: WorkflowCallbackBody; raw: string }> {
  const serializedBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", callbackSecret).update(`${timestamp}.`).update(serializedBody).digest("hex");
  const response = await fetch(`${baseUrl}/api/workflows/callbacks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sekhem-callback-timestamp": timestamp,
      "x-sekhem-callback-signature": `sha256=${signature}`
    },
    body: serializedBody
  });
  const raw = await response.text();

  return {
    status: response.status,
    body: JSON.parse(raw) as WorkflowCallbackBody,
    raw
  };
}

async function jsonGet(baseUrl: string, route: string): Promise<{ status: number; body: ContractBody }> {
  const response = await fetch(`${baseUrl}${route}`, { headers: { cookie: sessionCookie } });

  return {
    status: response.status,
    body: (await response.json()) as ContractBody
  };
}

function assertContractAction(result: { status: number; body: ContractBody }): void {
  assert.equal(result.status >= 200 && result.status < 300, true);
  assert.ok(result.body.data);
  assert.ok(result.body.auditEvent);
  assert.ok(result.body.activityEvent);
  assert.equal(typeof result.body.meta.timestamp, "string");
  assert.deepEqual(result.body.errors, []);
}

function assertNormalizedError(result: { status: number; body: ContractBody }): void {
  assert.equal(result.status >= 400, true);
  assert.equal(result.body.data, null);
  assert.equal(typeof result.body.meta.timestamp, "string");
  assert.equal(Array.isArray(result.body.errors), true);
  assert.ok(result.body.errors.length > 0);
}

function validWorkflowCallback(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const suffix = String(Date.now()) + String(Math.random()).replace(".", "");
  return {
    workflowRunId: `manual-run-${suffix}`,
    issueId: "PROD-03.002",
    taskId: "PROD-03.002",
    step: "manual_callback_validation",
    status: "running",
    resultSummary: "Manual internal callback accepted for validation.",
    evidence: [
      {
        type: "test",
        label: "Focused callback test",
        value: "backend/test/automation-contract.test.ts"
      }
    ],
    idempotencyKey: `PROD-03.002:${suffix}:manual_callback_validation:1`,
    occurredAt: new Date().toISOString(),
    ...overrides
  };
}

function assertCustomerSafeCallback(result: { body: WorkflowCallbackBody; raw: string }): void {
  assert.doesNotMatch(result.raw, /stack/i);
  assert.doesNotMatch(result.raw, /DATABASE_URL/i);
  assert.doesNotMatch(result.raw, /api[_ -]?key/i);
  assert.doesNotMatch(result.raw, /token\s*[:=]/i);
  assert.doesNotMatch(result.raw, /cookie\s*[:=]/i);
  assert.doesNotMatch(result.raw, /password\s*[:=]/i);
  assert.doesNotMatch(result.raw, /secret\s*[:=]/i);
  assert.equal(typeof result.body.accepted, "boolean");
}

describe("Backend Batch 6 automation and AI contract endpoints", () => {
  let app: INestApplication;
  let baseUrl: string;
  let workflowRunId: string;
  let memoId: string;
  const previousEnv = { ...process.env };

  before(async () => {
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = testEmail;
    process.env.SEKHEM_AUTH_STAGING_PASSWORD_HASH = createHash("sha256").update(testPassword).digest("hex");
    process.env.SEKHEM_AUTH_SESSION_SECRET = "test-only-automation-session-secret-32-bytes";
    process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = "Automation Test PM";
    process.env.SEKHEM_AUTH_STAGING_ROLE = "PM";
    process.env.SEKHEM_WORKFLOW_CALLBACK_HMAC_SECRET = callbackSecret;

    app = await createContractTestApp({ rawBody: true });
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0);

    const server = app.getHttpServer() as { address: () => string | { port: number } | null };
    const address = server.address();

    if (typeof address !== "object" || address === null) {
      throw new Error("Expected HTTP server to listen on a local port.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    sessionCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    assert.equal(login.status, 201);
    assert.ok(sessionCookie);
  });

  after(async () => {
    await app.close();
    process.env = previousEnv;
  });

  it("rejects unauthenticated human workflow routes and unsigned machine callbacks", async () => {
    const workflow = await fetch(`${baseUrl}/api/workflows/runs`);
    assert.equal(workflow.status, 401);

    const callback = await fetch(`${baseUrl}/api/workflows/callbacks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validWorkflowCallback())
    });
    const raw = await callback.text();
    assert.equal(callback.status, 401);
    assert.doesNotMatch(raw, /secret|stack|authorization/i);
  });

  it("POST /api/workflows/events creates a local workflow run placeholder", async () => {
    const result = await jsonPost(baseUrl, "/api/workflows/events", {
      eventType: "initiative.started",
      projectId,
      initiativeSlug,
      requestedBy: "Program Lead",
      requestedRole: "Program Owner",
      reason: "Batch 6 contract test"
    });

    assertContractAction(result);
    assert.equal((result.body.data as Record<string, unknown>).status, "queued");
    assert.equal((result.body.data as Record<string, unknown>).eventType, "initiative.started");
    assert.equal((result.body.data as Record<string, unknown>).requestedBy, "Automation Test PM");
    assert.equal((result.body.data as Record<string, unknown>).requestedRole, "PM");
    assert.match(String((result.body.data as Record<string, unknown>).note), /No workflow runtime executed/);
    workflowRunId = String((result.body.data as Record<string, unknown>).id);
  });

  it("GET /api/workflows/runs lists local workflow placeholders", async () => {
    const result = await jsonGet(baseUrl, "/api/workflows/runs");

    assert.equal(result.status, 200);
    assert.equal(Array.isArray(result.body.data), true);
    assert.equal(typeof result.body.meta.timestamp, "string");
    assert.equal(typeof result.body.meta.total, "number");
    assert.deepEqual(result.body.errors, []);
  });

  it("GET /api/workflows/runs/:id returns local workflow placeholder", async () => {
    const result = await jsonGet(baseUrl, `/api/workflows/runs/${workflowRunId}`);

    assert.equal(result.status, 200);
    assert.equal((result.body.data as Record<string, unknown>).id, workflowRunId);
    assert.deepEqual(result.body.errors, []);
  });

  it("POST /api/workflows/callbacks accepts a valid manual internal callback", async () => {
    const result = await workflowCallbackPost(baseUrl, validWorkflowCallback());

    assert.equal(result.status, 202);
    assert.equal(result.body.accepted, true);
    assert.equal(result.body.status, "running");
    assert.equal(result.body.duplicate, false);
    assertCustomerSafeCallback(result);
  });

  it("POST /api/workflows/callbacks rejects a missing required field", async () => {
    const body = validWorkflowCallback();
    delete body.workflowRunId;
    const result = await workflowCallbackPost(baseUrl, body);

    assert.equal(result.status, 202);
    assert.equal(result.body.accepted, false);
    assert.equal(result.body.code, "VALIDATION_ERROR");
    assert.equal(result.body.message, "Callback payload is invalid.");
    assertCustomerSafeCallback(result);
  });

  it("POST /api/workflows/callbacks rejects an invalid status", async () => {
    const result = await workflowCallbackPost(baseUrl, validWorkflowCallback({ status: "production_ready" }));

    assert.equal(result.status, 202);
    assert.equal(result.body.accepted, false);
    assert.equal(result.body.code, "VALIDATION_ERROR");
    assertCustomerSafeCallback(result);
  });

  it("POST /api/workflows/callbacks rejects unsafe raw content", async () => {
    const result = await workflowCallbackPost(baseUrl, validWorkflowCallback({ error: { message: "DATABASE_URL=postgres://unsafe" } }));

    assert.equal(result.status, 202);
    assert.equal(result.body.accepted, false);
    assert.equal(result.body.code, "VALIDATION_ERROR");
    assertCustomerSafeCallback(result);
  });

  it("POST /api/workflows/callbacks rejects invalid transitions", async () => {
    const result = await workflowCallbackPost(baseUrl, validWorkflowCallback({ status: "succeeded", resultSummary: "Cannot complete before running." }));

    assert.equal(result.status, 202);
    assert.equal(result.body.accepted, false);
    assert.equal(result.body.code, "INVALID_TRANSITION");
    assert.equal(result.body.message, "Workflow state transition is not allowed.");
    assertCustomerSafeCallback(result);
  });

  it("POST /api/workflows/callbacks enforces duplicate idempotency no-op", async () => {
    const body = validWorkflowCallback();
    const first = await workflowCallbackPost(baseUrl, body);
    const duplicate = await workflowCallbackPost(baseUrl, body);

    assert.equal(first.status, 202);
    assert.equal(first.body.accepted, true);
    assert.equal(duplicate.status, 202);
    assert.equal(duplicate.body.accepted, true);
    assert.equal(duplicate.body.duplicate, true);
    assertCustomerSafeCallback(duplicate);
  });

  it("POST /api/workflows/callbacks rejects idempotency key reuse with different payload", async () => {
    const body = validWorkflowCallback();
    const first = await workflowCallbackPost(baseUrl, body);
    const conflict = await workflowCallbackPost(baseUrl, {
      ...body,
      step: "different_step"
    });

    assert.equal(first.status, 202);
    assert.equal(first.body.accepted, true);
    assert.equal(conflict.status, 202);
    assert.equal(conflict.body.accepted, false);
    assert.equal(conflict.body.code, "IDEMPOTENCY_CONFLICT");
    assertCustomerSafeCallback(conflict);
  });

  it("POST /api/workflows/callbacks requires safe error fields for failed callbacks", async () => {
    const runId = `manual-failed-${Date.now()}`;
    await workflowCallbackPost(baseUrl, validWorkflowCallback({ workflowRunId: runId, idempotencyKey: `${runId}:running` }));
    const rejected = await workflowCallbackPost(baseUrl, validWorkflowCallback({
      workflowRunId: runId,
      status: "failed",
      idempotencyKey: `${runId}:failed`,
      error: undefined
    }));
    const accepted = await workflowCallbackPost(baseUrl, validWorkflowCallback({
      workflowRunId: runId,
      status: "failed",
      idempotencyKey: `${runId}:failed-safe`,
      error: {
        code: "MANUAL_CALLBACK_FAILED",
        message: "Manual callback failed validation safely."
      }
    }));

    assert.equal(rejected.body.accepted, false);
    assert.equal(rejected.body.code, "VALIDATION_ERROR");
    assert.equal(accepted.body.accepted, true);
    assert.equal(accepted.body.status, "failed");
    assertCustomerSafeCallback(accepted);
  });

  it("POST /api/workflows/callbacks requires blocker fields for blocked callbacks", async () => {
    const runId = `manual-blocked-${Date.now()}`;
    await workflowCallbackPost(baseUrl, validWorkflowCallback({ workflowRunId: runId, idempotencyKey: `${runId}:running` }));
    const rejected = await workflowCallbackPost(baseUrl, validWorkflowCallback({
      workflowRunId: runId,
      status: "blocked",
      idempotencyKey: `${runId}:blocked`
    }));
    const accepted = await workflowCallbackPost(baseUrl, validWorkflowCallback({
      workflowRunId: runId,
      status: "blocked",
      idempotencyKey: `${runId}:blocked-safe`,
      blocker: {
        reason: "Manual callback requires PM decision.",
        owner: "Tasker 5 + Tasker 4",
        severity: "high",
        pmDecisionNeeded: "Review manual callback blocker."
      }
    }));

    assert.equal(rejected.body.accepted, false);
    assert.equal(rejected.body.code, "VALIDATION_ERROR");
    assert.equal(accepted.body.accepted, true);
    assert.equal(accepted.body.status, "blocked");
    assertCustomerSafeCallback(accepted);
  });

  it("POST /api/ai/memos/request queues a local memo placeholder", async () => {
    const result = await jsonPost(baseUrl, "/api/ai/memos/request", {
      projectId,
      initiativeSlug,
      memoType: "technical_memo",
      requestedBy: "Program Lead",
      requestedRole: "Program Owner",
      promptSummary: "Prepare a local placeholder memo for human review.",
      sourceRefs: ["rd-signal-evpn-bgp"]
    });

    assertContractAction(result);
    assert.equal((result.body.data as Record<string, unknown>).status, "queued");
    assert.equal((result.body.data as Record<string, unknown>).requestedBy, "Automation Test PM");
    assert.equal((result.body.data as Record<string, unknown>).requestedRole, "PM");
    assert.match(String((result.body.data as Record<string, unknown>).note), /No AI provider executed/);
    memoId = String((result.body.data as Record<string, unknown>).id);
  });

  it("GET /api/ai/memos/:id returns a local memo placeholder", async () => {
    const result = await jsonGet(baseUrl, `/api/ai/memos/${memoId}`);

    assert.equal(result.status, 200);
    assert.equal((result.body.data as Record<string, unknown>).id, memoId);
    assert.deepEqual(result.body.errors, []);
  });

  it("POST /api/system/events records a local system event", async () => {
    const result = await jsonPost(baseUrl, "/api/system/events", {
      eventType: "blocker.created",
      projectId,
      initiativeSlug,
      severity: "medium",
      actor: "Backend Contract Test",
      source: "backend",
      summary: "Record local system event only."
    });

    assertContractAction(result);
    assert.equal((result.body.data as Record<string, unknown>).eventType, "blocker.created");
    assert.equal((result.body.data as Record<string, unknown>).actor, "Automation Test PM [PM]");
    assert.match(String((result.body.data as Record<string, unknown>).note), /recorded locally only/);
  });

  it("invalid workflow event returns normalized error", async () => {
    const result = await jsonPost(baseUrl, "/api/workflows/events", {});

    assertNormalizedError(result);
  });

  it("invalid AI memo request returns normalized error", async () => {
    const result = await jsonPost(baseUrl, "/api/ai/memos/request", {});

    assertNormalizedError(result);
  });

  it("invalid system event returns normalized error", async () => {
    const result = await jsonPost(baseUrl, "/api/system/events", {});

    assertNormalizedError(result);
  });
});
