import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";
import { describe, it } from "node:test";
import { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";
import {
  AGENT_UNDERSTANDING_LIMITS,
  preferredReadSkillId
} from "../src/agent-runtime/understanding/agent-understanding.types";
import { AGENT_FILE_READER_LIMITS } from "../src/agent-runtime/capabilities/workspace-context";

const base = {
  userId: "user-1",
  projectId: "project-1",
  conversationId: "conv-1",
  userRole: "PM" as const,
  availableCapabilities: ["attachment_reader", "workspace_reader", "repo_snapshot_reader"]
};

describe("Evidence orchestration (Task 2)", () => {
  it("discovers a relevant conversation-scoped attachment without an explicit read command", async () => {
    const collector = new EvidenceCollectorService({
      read: async ({ attachmentId }: { attachmentId: string }) => ({
        sourceType: "CONVERSATION_ATTACHMENT",
        conversationId: "conv-1",
        attachmentId,
        fileName: "requirements.pdf",
        mimeType: "application/pdf",
        size: 20,
        status: "OK",
        normalizedContent: { text: "Must implement login.", extractorId: "pdf", detectedMime: "application/pdf", truncated: false },
        warnings: [],
        provenance: { sourceType: "CONVERSATION_ATTACHMENT", conversationId: "conv-1", attachmentId }
      })
    } as never, undefined, {
      listAttachmentsForConversation: async () => [
        { id: "att-req", fileName: "requirements.pdf", category: "pdf" },
        { id: "att-img", fileName: "photo.png", category: "image" },
        { id: "att-other", fileName: "notes.txt", category: "doc" }
      ]
    } as never);
    const evidence = await collector.collectConversationAttachments({
      userId: "user-1",
      conversationId: "conv-1",
      instruction: "Implement the requirements."
    });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].attachmentId, "att-req");
    assert.equal(evidence[0].status, "COLLECTED");
    assert.equal(evidence[0].provenance, "CONVERSATION_ATTACHMENT:conv-1:att-req");
  });

  it("marks unauthorized attachment reads as DENIED without fabricating text", async () => {
    const collector = new EvidenceCollectorService({
      read: async () => { throw new ForbiddenException("Attachment access denied"); }
    } as never);
    const evidence = await collector.collectAttachments({
      userId: "user-1",
      conversationId: "conv-1",
      attachmentIds: ["secret"]
    });
    assert.equal(evidence[0].status, "DENIED");
    assert.equal(evidence[0].content, undefined);
  });

  it("maps bounded repository snapshot chunks into AgentEvidence", async () => {
    const collector = new EvidenceCollectorService({} as never, undefined, undefined, undefined, {
      snapshot: async () => ({
        repository: "sekhem",
        commitSha: "abc123",
        chunks: [
          { path: "src/auth.ts", content: "export function authenticate() {}", citationId: "c1" },
          { path: "README.md", content: "hello", citationId: "c2" }
        ]
      })
    } as never, {
      repositoryForUse: async (id: string) => ({ id, providerType: "local", defaultBranch: "main" })
    } as never);
    const evidence = await collector.collectRepository({
      userId: "user-1",
      userRole: "PM",
      projectId: "project-1",
      instruction: "Review authentication in this repository",
      repositoryConnectionId: "repo-1"
    });
    assert.equal(evidence[0].sourceType, "repository");
    assert.equal(evidence[0].relativePath, "src/auth.ts");
    assert.ok((evidence[0].content?.text.length ?? 0) <= AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_TEXT_CHARS);
    assert.equal(evidence.length <= AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS, true);
  });

  it("keeps artifact evidence customer-safe, relevant, and bounded", async () => {
    const longContent = "x".repeat(AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_TEXT_CHARS + 50);
    const collector = new EvidenceCollectorService({} as never, undefined, undefined, {
      agentArtifact: {
        findMany: async () => [
          { id: "art-auth", title: "Auth review", artifactType: "VALIDATION_REPORT", content: longContent, summary: "authentication" },
          { id: "art-other", title: "Billing notes", artifactType: "TECHNICAL_MEMO", content: "billing", summary: "billing" }
        ]
      }
    } as never);
    const evidence = await collector.collectArtifacts({
      userId: "user-1",
      userRole: "PM",
      projectId: "project-1",
      instruction: "Investigate the authentication issue"
    });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].sourceType, "artifact");
    assert.equal(evidence[0].metadata.artifactId, "art-auth");
    assert.equal(evidence[0].content?.truncated, true);
    assert.equal(evidence[0].content?.text.length, AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_TEXT_CHARS);
  });

  it("enforces the evidence item cap after merging sources", async () => {
    const collector = {
      collectAttachments: async () => Array.from({ length: 4 }, (_, index) => ({
        sourceType: "attachment" as const,
        sourceId: `att-${index}`,
        attachmentId: `att-${index}`,
        provenance: `CONVERSATION_ATTACHMENT:conv-1:att-${index}`,
        status: "COLLECTED" as const,
        metadata: { fileName: `file-${index}.pdf` },
        content: { text: "doc", extractorId: "pdf", detectedMime: "application/pdf", truncated: false },
        warnings: []
      })),
      collectWorkspace: async () => ["src/auth.ts", "src/navbar.tsx"].map((relativePath) => ({
        sourceType: "workspace" as const,
        sourceId: "project-1",
        relativePath,
        provenance: `project-1:${relativePath}`,
        status: "COLLECTED" as const,
        metadata: {},
        content: { text: relativePath, extractorId: "text", detectedMime: "text/plain", truncated: false },
        warnings: []
      })),
      collectConversationAttachments: async () => []
    };
    const workspace = {
      discover: async () => ({ tree: { truncated: false, root: { type: "directory", path: "", children: [{ type: "file", path: "src/auth.ts" }] } } })
    };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector as never, new AgentContextSerializerService(), workspace as never);
    const context = await builder.build({
      ...base,
      instruction: "Explain these PDFs and find authentication",
      attachmentIds: ["att-0", "att-1", "att-2", "att-3"]
    });
    assert.equal(context.evidence.length, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
    assert.equal(context.truncated, true);
  });

  it("enforces the model evidence character budget in the serializer", () => {
    const oversized = "y".repeat(AGENT_UNDERSTANDING_LIMITS.MAX_MODEL_EVIDENCE_CHARS + 8_000);
    const prompt = new AgentContextSerializerService().forReasoning({
      userId: "user-1",
      objective: "Explain",
      userIntent: ["EXPLAIN"],
      operationClass: "READ",
      constraints: [],
      conversationContext: { hasHistory: false, attachmentIds: [] },
      memoryContext: { available: false, advisory: true },
      workspaceContext: { required: false, available: false },
      attachmentContext: { required: true, attachmentIds: ["att-1"] },
      repositoryContext: { required: false, available: false },
      evidence: [{
        sourceType: "attachment",
        sourceId: "att-1",
        attachmentId: "att-1",
        provenance: "CONVERSATION_ATTACHMENT:conv-1:att-1",
        status: "COLLECTED",
        metadata: { fileName: "big.pdf" },
        content: { text: oversized, extractorId: "pdf", detectedMime: "application/pdf", truncated: true },
        warnings: []
      }],
      availableCapabilities: [],
      selectedCapabilities: ["attachment_reader"],
      plan: [],
      verificationState: { required: true, strategy: "GROUNDED_EVIDENCE", status: "PENDING", evidenceIds: [], failures: [] },
      missingContext: [],
      assumptions: [],
      warnings: [],
      truncated: true
    });
    assert.ok(prompt.length < oversized.length);
    assert.ok(prompt.length <= AGENT_UNDERSTANDING_LIMITS.MAX_MODEL_EVIDENCE_CHARS + 800);
  });

  it("keeps normal chat free of workspace and attachment gathering", async () => {
    let listed = 0;
    let discovered = 0;
    const collector = {
      collectAttachments: async () => { throw new Error("attachments"); },
      collectWorkspace: async () => { throw new Error("workspace"); },
      collectConversationAttachments: async () => { listed++; return []; }
    };
    const workspace = { discover: async () => { discovered++; throw new Error("discover"); } };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector as never, new AgentContextSerializerService(), workspace as never);
    const hello = await builder.build({ ...base, instruction: "Hi" });
    const bgp = await builder.build({ ...base, instruction: "What is BGP?" });
    assert.deepEqual(hello.userIntent, ["CHAT"]);
    assert.equal(hello.evidence.length, 0);
    assert.equal(bgp.evidence.length, 0);
    assert.equal(listed, 0);
    assert.equal(discovered, 0);
  });

  it("gathers current attachments for an agent document request", async () => {
    const collector = {
      collectAttachments: async () => [{
        sourceType: "attachment" as const,
        sourceId: "att-1",
        attachmentId: "att-1",
        provenance: "CONVERSATION_ATTACHMENT:conv-1:att-1",
        status: "COLLECTED" as const,
        metadata: { fileName: "spec.pdf" },
        content: { text: "requirement A", extractorId: "pdf", detectedMime: "application/pdf", truncated: false },
        warnings: []
      }],
      collectWorkspace: async () => [],
      collectConversationAttachments: async () => []
    };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector as never, new AgentContextSerializerService());
    const context = await builder.build({ ...base, instruction: "Explain this PDF", attachmentIds: ["att-1"] });
    assert.equal(context.evidence[0].status, "COLLECTED");
    assert.match(builder.toReasoningPrompt(context), /requirement A/);
  });

  it("aligns the durable read skill with understanding selection", () => {
    const understanding = new AgentUnderstandingService().understand({
      userId: "user-1",
      projectId: "project-1",
      instruction: "Find where authentication is implemented in this project",
      availableCapabilities: ["attachment_reader", "workspace_reader", "memo_generator"],
      workspaceAvailable: true
    });
    assert.equal(preferredReadSkillId(understanding.selectedCapabilities), "workspace_reader");
    assert.notEqual(preferredReadSkillId(understanding.selectedCapabilities), "memo_generator");
  });

  it("omits evidence text from the audit payload", async () => {
    const collector = {
      collectAttachments: async () => [{
        sourceType: "attachment" as const,
        sourceId: "att-1",
        attachmentId: "att-1",
        provenance: "CONVERSATION_ATTACHMENT:conv-1:att-1",
        status: "COLLECTED" as const,
        metadata: { fileName: "secret.pdf" },
        content: { text: "PRIVATE DOCUMENT TEXT", extractorId: "pdf", detectedMime: "application/pdf", truncated: false },
        warnings: []
      }],
      collectWorkspace: async () => [],
      collectConversationAttachments: async () => []
    };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector as never, new AgentContextSerializerService());
    const context = await builder.build({ ...base, instruction: "Explain this PDF", attachmentIds: ["att-1"] });
    const payload = JSON.stringify(builder.evidenceAuditPayload(context));
    assert.doesNotMatch(payload, /PRIVATE DOCUMENT TEXT/);
    assert.match(payload, /CONVERSATION_ATTACHMENT:conv-1:att-1/);
    assert.match(payload, /attachment/);
  });
});
