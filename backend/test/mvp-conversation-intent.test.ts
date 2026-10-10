import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { ConversationService } from "../src/conversation/conversation.service";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { requestsConversationExecution } from "../src/conversation/conversation-intent";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";

async function fixture() {
  const h = await inspectionHarness(), calls: unknown[][] = [];
  const agents: any = { createRunTx: async (_tx: any, _claims: any, input: any) => { calls.push(["inspection", input]); return { id: h.run.id, status: "QUEUED" }; }, scheduleRunExecution: () => {}, planFromConversation: async (...args: unknown[]) => { calls.push(args); return { runId: h.run.id }; },
    executePlan: async () => assert.fail("Generic engineering intent must not execute"),
    executeChat: async () => assert.fail("Pending approval acknowledgment must not call the model") };
  const conversations = new ConversationService(h.db, agents, undefined, undefined, undefined, undefined, undefined, new ExecutionModeDetectorService(), undefined, undefined, h.store, h.runtime);
  const created = await conversations.createConversation(h.claims.sub, { projectId: "project-a", title: "Engineering conversation", mode: "CHAT" }, h.claims);
  h.tables.conversation.get("conversation-a").metadata = { modeContext: created.modeContext };
  return { ...h, conversations, agents, calls };
}

for (const instruction of ["Modify index.html to change the Hero title", "غير عنوان الـHero من simple إلى intelligent"]) test(`engineering intent prepares a plan in the same conversation: ${instruction}`, async () => {
  const h = await fixture(), ledger = JSON.stringify([...h.tables.auditEvent]), count = h.tables.conversation.size;
  const response: any = await h.conversations.postMessage("conversation-a", h.claims, { content: instruction, metadata: { clientMessageId: "plan-intent" } });
  assert.equal(requestsConversationExecution(instruction), true);
  assert.equal(response.conversationId, "conversation-a"); assert.equal(response.agentRunId, h.run.id);
  if (instruction.startsWith("غير")) {
    assert.equal(h.calls[0][0], "inspection");
    assert.match((h.calls[0][1] as any).instruction, /Do not modify any file or execute any write/);
  } else assert.deepEqual(h.calls[0], ["conversation-a", h.claims, instruction, "plan-intent", undefined]);
  assert.equal(h.tables.conversation.size, count); assert.equal(JSON.stringify([...h.tables.auditEvent]), ledger);
  assert.equal((await h.request("poll")).execution, null);
});

for (const content of ["ماشي", "تمام", "أوكي", "آه", "كمل", "continue"]) test(`pending approval acknowledgment is not authorization: ${content}`, async () => {
  const h = await fixture(); h.tables.agentRun.get(h.run.id).status = "AWAITING_APPROVAL";
  const before = JSON.stringify([...h.tables.auditEvent]);
  const reply: any = await h.conversations.postMessage("conversation-a", h.claims, { content });
  assert.match(reply.content, /approval controls/); assert.equal(reply.metadata.executionStarted, false);
  assert.equal(JSON.stringify([...h.tables.auditEvent]), before); assert.equal(h.calls.length, 0);
  assert.equal((await h.request("poll")).execution, null);
});

test("missing certified understanding schedules inspection, while stale evidence fails closed", async () => {
  const h = await fixture();
  h.agents.planFromConversation = async () => { throw new ConflictException("CERTIFIED_UNDERSTANDING_REQUIRED:missing"); };
  const response: any = await h.conversations.postMessage("conversation-a", h.claims, { content: "Modify index.html" });
  assert.equal(response.agentRunId, h.run.id); assert.equal(h.calls[0][0], "inspection");
  assert.match((h.calls[0][1] as any).instruction, /Read and analyze index.html/);
  assert.equal((await h.request("poll")).execution, null);
  h.agents.planFromConversation = async () => { throw new ConflictException("WORKSPACE_EVIDENCE_STALE"); };
  await assert.rejects(h.conversations.postMessage("conversation-a", h.claims, { content: "Modify index.html" }), /WORKSPACE_EVIDENCE_STALE/);
  assert.equal(requestsConversationExecution("اقرأ المشروع ولا تغير الملف"), false);
});

for (const code of ["WORKSPACE_STORE_CORRUPT", "RUNTIME_LEDGER_CORRUPT"]) test(`${code} retains its 503 and content-free recoverable code`, () => {
  let status: number | undefined, result: any;
  const response: any = { status: (n: number) => { status = n; return response; }, json: (r: any) => { result = r; } };
  new ApiExceptionFilter().catch(new ServiceUnavailableException(code), { switchToHttp: () => ({ getResponse: () => response }) } as any);
  assert.equal(status, 503); assert.equal(result.data, null); assert.equal(result.errors[0].code, code);
  assert.match(result.errors[0].message, /Access is blocked/);
});
