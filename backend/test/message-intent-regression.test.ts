import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";
import { ConversationService } from "../src/conversation/conversation.service";
import { FileIntelligenceError } from "../src/file-intelligence/file-intelligence.errors";

const claims = { sub: "owner", role: "PM", organizationId: "org" } as any;
const base = { userId: "owner", projectId: "project", conversationId: "conv", userRole: "PM" as const, availableCapabilities: ["attachment_reader", "workspace_reader"], workspaceAvailable: true };
const examples = [
  ["Hi", false], ["How are you?", false], ["Are you an agent?", false], ["What is BGP?", false],
  ["How do I run a service?", false], ["Explain how to create a project", false],
  ["Read index.html", true], ["Read .gitignore", true], ["Inspect authentication in this workspace", true], ["Analyze the project", true]
] as const;

function harness() {
  const messages: any[] = [], chatCalls: any[] = [], runs: any[] = [], reads: string[] = [];
  const attachments = { getAttachment: async (userId: string, id: string) => {
    if (userId !== "owner" || id === "foreign") throw new ForbiddenException();
    return { id, conversationId: "conv" };
  } };
  const collector = new EvidenceCollectorService({ read: async ({ attachmentId }: any) => {
    reads.push(attachmentId);
    if (attachmentId === "image") throw new FileIntelligenceError("IMAGE_INTELLIGENCE_NOT_AVAILABLE");
    return { attachmentId, fileName: "app.js", status: "OK", normalizedContent: { text: "// Attached source evidence", extractorId: "text", detectedMime: "text/plain", truncated: false },
      warnings: [], provenance: { sourceType: "CONVERSATION_ATTACHMENT", conversationId: "conv", attachmentId } };
  } } as never);
  const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector, new AgentContextSerializerService());
  const db: any = {
    conversation: { findUnique: async () => ({ id: "conv", userId: "owner", projectId: "project", project: { organizationId: "org" } }), update: async () => ({}) },
    conversationMessage: { findUnique: async ({ where }: any) => messages.find(item => item.id === where.id) ?? null, create: async ({ data }: any) => { const result = { ...data, createdAt: new Date() }; messages.push(result); return result; }, findMany: async () => [],
      update: async ({ where, data }: any) => Object.assign(messages.find(item => item.id === where.id), data) }
  };
  db.$transaction = async (fn: any) => fn(db);
  db.$queryRawUnsafe = async () => [];
  db.conversationMessage.findFirst = async () => null;
  db.conversationMessage.upsert = async ({ where, create, update }: any) => {
    const existing = messages.find(item => item.id === where.id);
    return existing ? Object.assign(existing, update) : db.conversationMessage.create({ data: create });
  };
  const runtime = { executeChat: async (_claims: any, input: any) => { chatCalls.push(input); return { answer: "Read the supplied evidence.", modelId: "model", providerId: "provider" }; },
    createRunTx: async (_tx: any, _claims: any, input: any) => { runs.push(input); return { id: "run", status: "QUEUED" }; }, scheduleRunExecution: () => {} };
  const service = new ConversationService(db, runtime as never, undefined, undefined, attachments as never, undefined, builder, new ExecutionModeDetectorService());
  return { service, messages, chatCalls, runs, reads, builder, runtime };
}

describe("B: routing and workspace requirement alignment", () => {
  for (const [instruction, agent] of examples) {
    it(`${instruction} => ${agent ? "AGENT" : "CHAT"}`, async () => {
      const detector = new ExecutionModeDetectorService();
      assert.equal(await detector.isExecutionIntent(instruction), agent);
      assert.equal(new AgentUnderstandingService().understand({ ...base, instruction }).workspaceContext.required, agent);
      const h = harness();
      const response = await h.service.postMessage("conv", claims, { content: instruction });
      // Project-wide content review requires a persisted Runtime binding.
      // This fixture deliberately has none; routing must fail closed.
      assert.equal("agentRunId" in response, agent && instruction !== "Analyze the project");
      if (instruction === "Analyze the project") assert.equal(h.runs.length, 0);
    });
  }

  it("workspace intent does not require a manual mode switch; legacy triggering remains compatible", async () => {
    const h = harness();
    assert.equal("agentRunId" in await h.service.postMessage("conv", claims, { content: "Read index.html", chat: true }), true);
    assert.equal("agentRunId" in await h.service.postMessage("conv", claims, { content: "Hi", triggerAgent: true }), true);
  });

  it("reads supplied attachments on a message otherwise classified as Chat", async () => {
    const h = harness();
    await h.service.postMessage("conv", claims, { content: "Hi", attachmentIds: ["source"] });
    assert.deepEqual(h.reads, ["source"]);
    assert.match(h.chatCalls[0].instruction, /Attached source evidence/);
    assert.equal(h.messages[1].metadata.evidenceReceipt[0].outcome, "READ");
  });

  it("accepts attachment-only messages, keeps ownership checks, and persists a meaningful instruction", async () => {
    const h = harness();
    await h.service.postMessage("conv", claims, { content: "", attachmentIds: ["source"] });
    assert.equal(h.messages[0].content, "Inspect the attached files.");
    assert.match(h.chatCalls[0].instruction, /Attached source evidence/);
    const denied = harness();
    await assert.rejects(denied.service.postMessage("conv", claims, { content: "", attachmentIds: ["foreign"] }));
    assert.equal(denied.messages.length, 2);
    assert.equal(denied.messages[1].metadata.submissionFailure, true);
    assert.equal(denied.reads.length, 0);
    assert.equal(denied.runs.length, 0);
    assert.equal(denied.chatCalls.length, 0);
    await assert.rejects(denied.service.postMessage("conv", claims, { content: "", attachmentIds: [] }));
  });

  it("does not pretend image attachments were read", async () => {
    const h = harness();
    await h.service.postMessage("conv", claims, { content: "", attachmentIds: ["image"] });
    const receipt = h.messages[1].metadata.evidenceReceipt[0];
    assert.equal(receipt.outcome, "IMAGE_UNAVAILABLE");
    assert.equal(receipt.read, false);
    assert.match(h.chatCalls[0].instruction, /IMAGE_UNAVAILABLE/);
  });

  it("does not silently omit supplied attachments when context building fails", async () => {
    const h = harness();
    h.builder.build = async () => { throw new Error("context unavailable"); };
    await assert.rejects(h.service.postMessage("conv", claims, { content: "Hi", attachmentIds: ["source"] }), /Attachment context could not be collected/);
    assert.equal(h.chatCalls.length, 0);
    assert.equal(h.messages.length, 2);
    assert.equal(h.messages[1].metadata.submissionFailure, true);
    assert.equal(h.runs.length, 0);
    const absent = harness();
    (absent.service as any).contextBuilder = undefined;
    await assert.rejects(absent.service.postMessage("conv", claims, { content: "Hi", attachmentIds: ["source"] }), /Attachment context is unavailable/);
    assert.equal(absent.chatCalls.length, 0);
  });

  it("selects explicitly named files even when a bounded discovery omitted them", async () => {
    let requested: string[] = [];
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), {
      collectWorkspace: async (_request: any, paths: string[]) => { requested = paths; return []; }
    } as never, new AgentContextSerializerService(), { discover: async () => ({ tree: { truncated: true, root: { type: "directory", path: "", children: [] } } }) } as never);
    await builder.build({ ...base, instruction: "Read .gitignore" });
    assert.deepEqual(requested, [".gitignore"]);
  });

  it("retains diagnostic metadata on successful and failed Chat messages", async () => {
    const diagnostic = { correlationId: "test-correlation", refusalAttribution: "UNKNOWN", httpStatus: 200 };
    const h = harness();
    h.runtime.executeChat = async () => ({ answer: "Answer", modelId: "model", providerId: "provider", diagnostic });
    await h.service.postMessage("conv", claims, { content: "Hi" });
    assert.deepEqual(h.messages[1].metadata.diagnostic, diagnostic);
    const failed = harness();
    failed.runtime.executeChat = async () => { throw Object.assign(new Error("provider unavailable"), { providerDiagnostic: diagnostic }); };
    await assert.rejects(failed.service.postMessage("conv", claims, { content: "Hi" }));
    assert.deepEqual(failed.messages[0].metadata.diagnostic, diagnostic);
  });
});
