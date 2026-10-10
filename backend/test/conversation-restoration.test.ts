import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConversationService } from "../src/conversation/conversation.service";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { ProjectAccessService } from "../src/auth/project-access.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import type { SessionClaims } from "../src/auth/auth.dto";

const claims = { sub: "user", role: "PM", organizationId: "org" } as SessionClaims;
const time = new Date("2026-09-22T00:00:00Z");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const evidence = [{ id: "project:index.html", label: "index.html", sourceType: "workspace", outcome: "READ", discovered: true,
  read: true, selected: true, usedInAnswer: "UNKNOWN", truncated: false, selectionReason: "Requested file" }];
function fixture(status = "COMPLETED", outcome = "PLAN_READY") {
  const planning = { version: 1, understanding: { readiness: outcome === "NEEDS_EVIDENCE" ? "NEEDS_EVIDENCE" : "NEEDS_CLARIFICATION" },
    plan: { readiness: outcome === "PLAN_READY" ? "PLAN_READY" : "PLAN_NOT_READY", steps: outcome === "PLAN_READY" ? [{ id: "step-1" }] : [],
      validation: { valid: outcome === "PLAN_READY", issues: outcome === "PLAN_READY" ? [] : [{ code: "NEEDS_INFORMATION" }] } } };
  const run = { id: "run", conversationId: "conversation", projectId: "project", userId: "user", agentName: "SekhemEngineer", title: "Inspect",
    status, planVersion: 1, failureReason: status === "FAILED" ? outcome : null, progressPercent: status === "RUNNING" ? 30 : 0,
    createdAt: time, updatedAt: time, startedAt: time, completedAt: status === "RUNNING" ? null : time,
    plans: [{ id: "plan", version: 1, steps: [{ planningOnly: true, parameters: { originatingMessageId: "message", planning,
      evidenceReceipt: evidence, contextWarnings: ["Bounded evidence"], workspaceBinding: { id: "workspace", projectId: "project", name: "Workspace" } } }] }],
    events: [{ id: "event", agentRunId: "run", eventType: "PLAN_VALIDATED", timestamp: time, payload: { internal: "never-return-event-payload" } }],
    artifacts: [{ id: "artifact", projectId: "project", title: "Saved memo", artifactType: "memo", summary: "Persisted summary", version: 1, createdAt: time, metadata: { storageKey: "never-return-artifact-path" } }],
    approvals: [] };
  const attachment = { id: "attachment", conversationId: "conversation", userId: "user", fileName: "index.html", mimeType: "text/html", fileSize: 18,
    category: "doc", hasExtractedText: true, isScanned: false, createdAt: time, storageKey: "never-return-storage-key", extractedText: "never-return-file-body" };
  const conversation = { id: "conversation", projectId: "project", userId: "user", title: "Inspect", status: "active", createdAt: time, updatedAt: time, metadata: {},
    messages: [{ id: "message", conversationId: "conversation", senderId: "user", senderType: "user", content: "Inspect", metadata: { attachmentIds: ["attachment", "other-attachment"] }, createdAt: time },
      { id: "memo", conversationId: "conversation", senderType: "assistant", content: "Persisted result memo", metadata: { agentRunId: "run", outcome }, createdAt: time }],
    agentRuns: [run], attachments: [attachment, { ...attachment, id: "other-attachment", userId: "other", fileName: "private-name" }] };
  let include: any;
  // Apply Prisma relation selection, so omitted read fields cannot pass via an over-generous fake.
  const project = (row: any, query: any): any => {
    if (Array.isArray(row)) {
      let rows = row.filter(item => !query.where || Object.entries(query.where).every(([key, value]) => item[key] === value));
      if (query.take) rows = rows.slice(0, query.take);
      return rows.map(item => project(item, query));
    }
    const keys = query.select ?? Object.fromEntries(Object.keys(row).filter(key => !["agentRuns", "messages", "attachments", "plans", "events", "artifacts", "approvals"].includes(key)).map(key => [key, true]));
    return Object.fromEntries(Object.entries({ ...keys, ...query.include }).filter(([, value]) => value).map(([key, value]) =>
      [key, value === true ? row[key] : project(row[key] ?? [], value)]));
  };
  let member = true;
  const db: any = {
    conversation: { findUnique: async (query: any) => { include = query.include; return clone(project(conversation, query)); } },
    agentRun: { findUnique: async (query: any) => clone(project(run, query)) },
    project: { findUnique: async () => ({ id: "project", organizationId: "org" }) },
    user: { findUnique: async () => ({ status: "active", organizationId: "org" }) },
    projectMember: { findUnique: async () => member ? { role: "PM" } : null },
  };
  const resources = new ResourceAuthorizationService(db);
  const access = new ProjectAccessService(db, resources);
  const service = () => new ConversationService(db, undefined, resources, undefined, undefined, undefined, undefined, undefined, access);
  const runtime = new AgentRuntimeService({} as never, resources, {} as never, db);
  (runtime as any).projectAccess = access;
  return { run, conversation, read: () => service().getConversation("conversation", "user", claims), service, runtime,
    denyProject: () => { member = false; }, query: () => include };
}

describe("P1-B persisted conversation restoration", () => {
  it("restores the saved planning revision selected by Prisma for the next explicit revision", async () => {
    const h = fixture("FAILED", "PROVIDER_FAILED");
    h.run.id = "planning_run_saved";
    const restored = await h.read();
    assert.equal(h.query().agentRuns.select.planVersion, true);
    assert.equal(restored.agentRuns[0].planVersion, 1);
  });
  for (const [status, outcome] of [["RUNNING", null], ["QUEUED", null], ["COMPLETED", "PLAN_READY"], ["COMPLETED", "NEEDS_USER_INPUT"],
    ["COMPLETED", "NEEDS_EVIDENCE"], ["FAILED", "PROVIDER_FAILED"], ["FAILED", "OUTPUT_TRUNCATED"], ["FAILED", "INVALID_STRUCTURED_OUTPUT"],
    ["FAILED", "FAILED"], ["FAILED", "BLOCKED"], ["PAUSED", "PAUSED"], ["CANCELLED", "CANCELLED"]] as const) {
    it(`restores ${status}/${outcome} without writes, scheduling or provider calls`, async () => {
      const h = fixture(status, outcome ?? "PLAN_READY");
      const first = await h.read(), restored = await h.read();
      assert.deepEqual(first, restored);
      const run = restored.agentRuns[0] as any;
      assert.equal(run.status, status); assert.equal(run.outcome, outcome);
      assert.equal(run.conversationId, "conversation"); assert.equal(run.projectId, "project");
      assert.equal(run.updatedAt, time.toISOString());
      assert.deepEqual(run.presentation.evidence, evidence);
      assert.equal(run.presentation.originatingMessageId, "message");
      assert.deepEqual(run.presentation.planning, h.run.plans[0].steps[0].parameters.planning);
    });
  }
  it("returns persisted activity, artifact summaries, memo and safe attachment metadata", async () => {
    const h = fixture(); const restored = await h.read(); const run = restored.agentRuns[0] as any;
    // Activity entries keep their identity fields; raw payloads never cross the snapshot boundary.
    assert.deepEqual(run.activity, [{ id: "event", agentRunId: "run", eventType: "PLAN_VALIDATED", timestamp: time.toISOString() }]);
    assert.equal(run.artifacts[0].summary, "Persisted summary");
    assert.equal(restored.messages[1].content, "Persisted result memo");
    assert.equal((restored.messages[0] as any).attachments[0].id, "attachment");
    assert.equal((restored.messages[0] as any).attachments.length, 1);
    assert.doesNotMatch(JSON.stringify(restored), /never-return|private-name|storageKey|extractedText/);
    assert.equal(h.query().agentRuns.select.events.select.payload, true);
    assert.deepEqual(h.query().agentRuns.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  });
  it("projects only bounded safe details from an event payload", async () => {
    const h = fixture();
    h.run.events.push({ id: "event-2", agentRunId: "run", eventType: "ERROR",
      timestamp: new Date(time.getTime() + 1000),
      payload: { failureReason: "PROVIDER_FAILED", outcome: "PROVIDER_FAILED", diagnostic: { finishReason: "length" },
        receiptId: "receipt_1", approvalId: "appr_1", intentId: "intent_1", stdout: "secret-value", token: "never-return-token" } });
    const run = (await h.read()).agentRuns[0] as any;
    const entry = run.activity.find((item: any) => item.id === "event-2");
    assert.deepEqual(entry.details, { reason: "PROVIDER_FAILED", diagnostic: "PROVIDER_FAILED",
      receipt: "receipt_1", approval: "appr_1", reference: "intent_1" });
    assert.doesNotMatch(JSON.stringify(run.activity), /secret-value|never-return-token|finishReason/);
  });
  it("does not expose attachments linked from a different conversation or owner", async () => {
    const h = fixture(); h.conversation.attachments[0].conversationId = "elsewhere";
    assert.deepEqual((await h.read()).messages[0].attachments, []);
  });
  it("does not restore a run or artifact with inconsistent project linkage", async () => {
    const h = fixture(); h.run.artifacts[0].projectId = "elsewhere";
    assert.deepEqual((await h.read()).agentRuns[0].artifacts, []);
    h.run.projectId = "elsewhere";
    assert.deepEqual((await h.read()).agentRuns, []);
  });
  it("denies another user's conversation restoration", async () => {
    await assert.rejects(fixture().service().getConversation("conversation", "other", { ...claims, sub: "other" }), NotFoundException);
  });
  it("denies conversation and run restoration after project membership removal", async () => {
    const h = fixture(); h.denyProject();
    await assert.rejects(h.read(), ForbiddenException);
    await assert.rejects(h.runtime.getRun("run", claims), ForbiddenException);
  });
  it("denies cross-organization conversation and run IDs", async () => {
    const h = fixture(); const outsider = { ...claims, organizationId: "other-org" };
    await assert.rejects(h.service().getConversation("conversation", "user", outsider), ForbiddenException);
    await assert.rejects(h.runtime.getRun("run", outsider), ForbiddenException);
  });
});
