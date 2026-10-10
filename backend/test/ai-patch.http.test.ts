import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { aiPatchDrafts } from "../src/ai-patch-memory";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";

type HttpBody = {
  data: Record<string, unknown> | null;
  meta: { timestamp?: string };
  errors: unknown[];
};

const testEmail = "ai-patch@example.test";
const testPassword = "ai-patch-test-password";
let sessionCookie = "";

const validPayload = {
  title: "Draft validation helper for SONiC reboot logs",
  requestedBy: "pm",
  targetArea: "validation_tools",
  intent: "Create a draft-only helper proposal for reviewing cold reboot log patterns.",
  constraints: ["No file apply", "No GitHub write", "No deployment"],
  safetyNotes: ["Human review required before any code change.", "Draft must not touch production runtime."]
};

const validArtifact = {
  artifactType: "CODE_DIFF_PREVIEW",
  filePath: "backend/src/validation/reboot-log-helper.ts",
  title: "Draft reboot log validation helper",
  summary: "Review-only helper preview for cold reboot log patterns.",
  contentPreview: "export function summarizeRebootLog(): string { return \"review-only\"; }",
  diffPreview: "+ export function summarizeRebootLog(): string { return \"review-only\"; }",
  riskLevel: "low",
  reviewNotes: "Review the proposal only. Do not apply files."
};

async function jsonPost(baseUrl: string, route: string, body: Record<string, unknown>): Promise<{ status: number; body: HttpBody }> {
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
    body: (await response.json()) as HttpBody
  };
}

async function jsonGet(baseUrl: string, route: string): Promise<{ status: number; body: HttpBody }> {
  const response = await fetch(`${baseUrl}${route}`, { headers: { cookie: sessionCookie } });
  return {
    status: response.status,
    body: (await response.json()) as HttpBody
  };
}

function assertBadRequest(result: { status: number; body: HttpBody }): void {
  assert.equal(result.status, 400);
  assert.equal(result.body.data, null);
  assert.equal(typeof result.body.meta.timestamp, "string");
  assert.ok(result.body.errors.length > 0);
}

describe("AI Patch draft-only HTTP contract", () => {
  let app: INestApplication;
  let baseUrl: string;
  const previousEnv = { ...process.env };

  before(async () => {
    aiPatchDrafts.length = 0;
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = testEmail;
    process.env.SEKHEM_AUTH_STAGING_PASSWORD_HASH = createHash("sha256").update(testPassword).digest("hex");
    process.env.SEKHEM_AUTH_SESSION_SECRET = "test-only-ai-patch-session-secret-32-bytes";
    process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = "AI Patch Test PM";
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

  it("rejects unauthenticated AI Patch reads and writes", async () => {
    const read = await fetch(`${baseUrl}/api/ai-patch/drafts/missing-draft`);
    const write = await fetch(`${baseUrl}/api/ai-patch/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPayload)
    });

    assert.equal(read.status, 401);
    assert.equal(write.status, 401);
  });

  it("creates and reads a draft-only AI Patch request", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);

    assert.equal(created.status, 201);
    assert.match(String(created.body.data?.draftId), /^ai-patch-draft-/);
    assert.equal(created.body.data?.status, "DRAFT_REQUESTED");
    assert.equal(created.body.data?.createdAsDraftOnly, true);
    assert.equal(created.body.data?.autoApply, false);
    assert.equal(created.body.data?.githubWrite, false);
    assert.equal(created.body.data?.deployment, false);
    assert.equal(created.body.data?.nextGate, "HUMAN_REVIEW_REQUIRED");
    assert.equal(created.body.data?.requestedBy, "AI Patch Test PM [PM]");
    assert.deepEqual(
      (created.body.data?.statusHistory as { status: string }[]).map((item) => item.status),
      ["DRAFT_REQUESTED"]
    );
    assert.equal(typeof created.body.data?.createdAt, "string");
    assert.equal(typeof created.body.data?.updatedAt, "string");

    const read = await jsonGet(baseUrl, `/api/ai-patch/drafts/${created.body.data?.draftId}`);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body.data, created.body.data);

    const serialized = JSON.stringify(created.body.data).toLowerCase();
    for (const forbidden of ["secrets", "token", "authorization", "rawhtml", "rawcontent", "fullheaders"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("moves a draft through review states and returns status history", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);

    for (const [status, changedBy, reason] of [
      ["DRAFT_PREPARED", "backend-reviewer", "Draft outline prepared for review."],
      ["REVIEW_REQUIRED", "backend-reviewer", "Draft outline ready for human review."],
      ["REJECTED", "pm", "Draft request rejected after human review."]
    ]) {
      const result = await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/status`, {
        status,
        changedBy,
        reason,
        reviewNotes: "Draft-only review note. No code was applied."
      });
      assert.equal(result.status, 201);
    }

    const read = await jsonGet(baseUrl, `/api/ai-patch/drafts/${draftId}`);
    assert.equal(read.body.data?.status, "REJECTED");
    assert.equal(((read.body.data?.statusHistory as { changedBy: string }[]).at(-1)?.changedBy), "AI Patch Test PM [PM]");
    assert.equal(read.body.data?.nextGate, null);
    assert.deepEqual(
      (read.body.data?.statusHistory as { status: string }[]).map((item) => item.status),
      ["DRAFT_REQUESTED", "DRAFT_PREPARED", "REVIEW_REQUIRED", "REJECTED"]
    );
    assert.equal(read.body.data?.createdAsDraftOnly, true);
    assert.equal(read.body.data?.autoApply, false);
    assert.equal(read.body.data?.githubWrite, false);
    assert.equal(read.body.data?.deployment, false);
  });

  it("approves a reviewed draft through the explicit gate without applying artifacts", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);
    await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts`, validArtifact);
    for (const status of ["DRAFT_PREPARED", "REVIEW_REQUIRED"]) {
      await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/status`, {
        status,
        changedBy: "backend-reviewer",
        reason: `Move draft to ${status}.`,
        reviewNotes: "Draft-only review note."
      });
    }

    const approved = await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/approve`, {
      changedBy: "pm",
      reason: "Approve reviewed draft record only.",
      reviewNotes: "Approval does not apply artifacts."
    });

    assert.equal(approved.status, 201);
    assert.equal(approved.body.data?.status, "APPROVED");
    assert.equal(approved.body.data?.nextGate, null);
    assert.equal(approved.body.data?.createdAsDraftOnly, true);
    assert.equal(approved.body.data?.autoApply, false);
    assert.equal(approved.body.data?.githubWrite, false);
    assert.equal(approved.body.data?.deployment, false);
    assert.equal(((approved.body.data?.artifacts as Record<string, unknown>[])[0]?.applyAllowed), false);
    assert.equal(((approved.body.data?.statusHistory as { status: string }[]).at(-1)?.status), "APPROVED");
  });

  it("rejects only reviewed drafts through the explicit gate", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);
    const action = (route: string): Promise<{ status: number; body: HttpBody }> =>
      jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/${route}`, {
        changedBy: "pm",
        reason: "Human decision.",
        reviewNotes: "Draft-only review note."
      });

    assertBadRequest(await action("reject"));
    assertBadRequest(await action("approve"));
    for (const status of ["DRAFT_PREPARED", "REVIEW_REQUIRED"]) {
      await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/status`, {
        status,
        changedBy: "backend-reviewer",
        reason: `Move draft to ${status}.`,
        reviewNotes: "Draft-only review note."
      });
    }

    const rejected = await action("reject");
    assert.equal(rejected.status, 201);
    assert.equal(rejected.body.data?.status, "REJECTED");
    assert.equal(rejected.body.data?.nextGate, null);
    assert.equal(((rejected.body.data?.statusHistory as { status: string }[]).at(-1)?.status), "REJECTED");
  });

  it("stops non-terminal drafts through the explicit gate and locks terminal gate actions", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);
    const action = (route: string): Promise<{ status: number; body: HttpBody }> =>
      jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/${route}`, {
        changedBy: "pm",
        reason: "Stop or test terminal draft.",
        reviewNotes: "Draft-only review note."
      });

    const stopped = await action("stop");
    assert.equal(stopped.status, 201);
    assert.equal(stopped.body.data?.status, "STOPPED");
    assert.equal(stopped.body.data?.nextGate, null);
    assert.equal(((stopped.body.data?.statusHistory as { status: string }[]).at(-1)?.status), "STOPPED");
    assertBadRequest(await action("approve"));
    assertBadRequest(await action("reject"));
    assertBadRequest(await action("stop"));
  });

  it("rejects missing and sensitive explicit gate action fields", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);

    for (const body of [
      { changedBy: "pm", reason: "", reviewNotes: "Rejected." },
      { changedBy: "pm", reason: "Stop.", reviewNotes: "" },
      { changedBy: "pm", reason: "Stop.", reviewNotes: "Rejected.", secrets: "not-accepted" }
    ]) {
      assertBadRequest(await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/stop`, body));
    }
  });

  it("creates, lists, and reads review-only artifacts", async () => {
    const createdDraft = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(createdDraft.body.data?.draftId);
    const created = await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts`, validArtifact);

    assert.equal(created.status, 201);
    assert.match(String(created.body.data?.artifactId), /^ai-patch-artifact-/);
    assert.equal(created.body.data?.applyAllowed, false);
    assert.equal(created.body.data?.githubWrite, false);
    assert.equal(created.body.data?.deployment, false);
    assert.equal(created.body.data?.createdAsDraftOnly, true);
    assert.equal(created.body.data?.createdBy, "AI Patch Test PM [PM]");

    const listed = await jsonGet(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts`);
    assert.equal(listed.status, 200);
    assert.equal(Array.isArray(listed.body.data), true);
    assert.equal((listed.body.data as unknown[]).length, 1);

    const read = await jsonGet(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts/${created.body.data?.artifactId}`);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body.data, created.body.data);

    const draft = await jsonGet(baseUrl, `/api/ai-patch/drafts/${draftId}`);
    assert.equal(draft.body.data?.status, "DRAFT_REQUESTED");
  });

  it("returns a safe consolidated audit timeline", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);
    const artifact = await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts`, validArtifact);
    for (const status of ["DRAFT_PREPARED", "REVIEW_REQUIRED"]) {
      await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/status`, {
        status,
        changedBy: "backend-reviewer",
        reason: `Move draft to ${status}.`,
        reviewNotes: "Draft-only review note."
      });
    }
    await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/approve`, {
      changedBy: "pm",
      reason: "Approve reviewed draft record only.",
      reviewNotes: "Approval does not apply artifacts."
    });

    const audit = await jsonGet(baseUrl, `/api/ai-patch/drafts/${draftId}/audit`);
    assert.equal(audit.status, 200);
    assert.equal(audit.body.data?.draftId, draftId);
    assert.equal(audit.body.data?.currentStatus, "APPROVED");
    assert.equal(audit.body.data?.createdAsDraftOnly, true);
    assert.equal(audit.body.data?.autoApply, false);
    assert.equal(audit.body.data?.githubWrite, false);
    assert.equal(audit.body.data?.deployment, false);
    const auditEvents = audit.body.data?.auditEvents as Record<string, unknown>[];
    assert.deepEqual(
      auditEvents.map((event) => event.eventType),
      ["DRAFT_REQUESTED", "ARTIFACT_CREATED", "STATUS_CHANGED", "STATUS_CHANGED", "APPROVED"]
    );
    assert.equal(auditEvents[1]?.artifactId, artifact.body.data?.artifactId);
    assert.equal(auditEvents[1]?.actor, "AI Patch Test PM [PM]");
    assert.equal(auditEvents[2]?.statusBefore, "DRAFT_REQUESTED");
    assert.equal(auditEvents[2]?.statusAfter, "DRAFT_PREPARED");
    for (const event of auditEvents) {
      assert.equal(typeof event.auditEventId, "string");
      assert.equal(event.draftId, draftId);
      assert.equal(typeof event.actor, "string");
      assert.equal(typeof event.reason, "string");
      assert.equal(typeof event.reviewNotes, "string");
      assert.equal(typeof event.createdAt, "string");
      assert.deepEqual(event.safetyFlags, {
        createdAsDraftOnly: true,
        autoApply: false,
        applyAllowed: false,
        githubWrite: false,
        deployment: false
      });
    }
    assert.deepEqual(
      auditEvents.map((event) => event.createdAt),
      auditEvents.map((event) => event.createdAt).sort()
    );
    const serialized = JSON.stringify(audit.body.data).toLowerCase();
    for (const forbidden of ["rawhtml", "rawcontent", "fullheaders", "secrets", "token", "authorization", "contentpreview", "diffpreview"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("returns a safe 404 for an unknown audit draft", async () => {
    const audit = await jsonGet(baseUrl, "/api/ai-patch/drafts/missing-draft/audit");

    assert.equal(audit.status, 404);
    assert.equal(audit.body.data, null);
    assert.equal(typeof audit.body.meta.timestamp, "string");
    assert.ok(audit.body.errors.length > 0);
  });

  it("rejects unsafe artifact paths and forbidden fields", async () => {
    const createdDraft = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(createdDraft.body.data?.draftId);

    for (const filePath of ["/etc/passwd", "../outside.ts", ".env", "config/secrets.json", "node_modules/package/index.js", "storage/private/file.ts"]) {
      assertBadRequest(await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts`, { ...validArtifact, filePath }));
    }
    for (const field of ["rawHtml", "rawContent", "fullHeaders", "secrets", "tokens", "privateKey", "password"]) {
      assertBadRequest(await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts`, { ...validArtifact, [field]: "not-accepted" }));
    }
  });

  it("rejects artifact creation for terminal drafts", async () => {
    const createdDraft = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(createdDraft.body.data?.draftId);
    await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/status`, {
      status: "STOPPED",
      changedBy: "pm",
      reason: "Stop draft before artifact creation.",
      reviewNotes: "No further action."
    });

    assertBadRequest(await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/artifacts`, validArtifact));
  });

  it("rejects invalid transitions and locks terminal states", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);
    const transition = (status: string): Promise<{ status: number; body: HttpBody }> =>
      jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/status`, {
        status,
        changedBy: "pm",
        reason: "Review state decision.",
        reviewNotes: "Draft-only review note."
      });

    assertBadRequest(await transition("APPROVED"));
    assert.equal((await transition("STOPPED")).status, 201);
    assertBadRequest(await transition("DRAFT_PREPARED"));
  });

  it("rejects missing or invalid transition request fields", async () => {
    const created = await jsonPost(baseUrl, "/api/ai-patch/drafts", validPayload);
    const draftId = String(created.body.data?.draftId);

    for (const body of [
      { status: "NOT_SUPPORTED", changedBy: "pm", reason: "Invalid status.", reviewNotes: "Rejected." },
      { status: "STOPPED", changedBy: "pm", reason: "", reviewNotes: "Rejected." },
      { status: "STOPPED", changedBy: "pm", reason: "Stop.", reviewNotes: "" }
    ]) {
      assertBadRequest(await jsonPost(baseUrl, `/api/ai-patch/drafts/${draftId}/status`, body));
    }
  });

  it("rejects missing required string fields", async () => {
    for (const field of ["title", "targetArea", "intent"]) {
      const result = await jsonPost(baseUrl, "/api/ai-patch/drafts", { ...validPayload, [field]: "" });
      assertBadRequest(result);
    }
  });

  it("rejects non-string-array constraints and safety notes", async () => {
    for (const [field, value] of [
      ["constraints", "No file apply"],
      ["constraints", ["valid", 123]],
      ["safetyNotes", "Human review required"],
      ["safetyNotes", ["valid", false]]
    ] as const) {
      const result = await jsonPost(baseUrl, "/api/ai-patch/drafts", { ...validPayload, [field]: value });
      assertBadRequest(result);
    }
  });

  it("rejects forbidden execution-shaped or sensitive fields", async () => {
    for (const field of [
      "rawHtml",
      "rawContent",
      "fullHeaders",
      "secrets",
      "token",
      "authorization",
      "autoApply",
      "githubWrite",
      "deployment",
      "branchName",
      "commitMessage",
      "filePatch",
      "diff",
      "patch",
      "apply",
      "execute"
    ]) {
      const result = await jsonPost(baseUrl, "/api/ai-patch/drafts", { ...validPayload, [field]: "not-accepted" });
      assertBadRequest(result);
    }
  });
});
