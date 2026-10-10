import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";

const base = { userId: "user-1", projectId: "project-1", conversationId: "conv-1", userRole: "PM" as const, availableCapabilities: ["attachment_reader", "workspace_reader"] };

describe("5D-0.1 Evidence to Agent Context", () => {
  it("passes attachment evidence, provenance, warnings, and truncation to serialized reasoning context", async () => {
    const collector = {
      collectAttachments: async () => [{ sourceType: "attachment" as const, sourceId: "att-1", attachmentId: "att-1", provenance: "CONVERSATION_ATTACHMENT:conv-1:att-1", status: "COLLECTED" as const, metadata: { fileName: "report.pdf" }, content: { text: "Important grounded finding", extractorId: "pdf", detectedMime: "application/pdf", truncated: true }, warnings: ["Extraction capped."] }],
      collectWorkspace: async () => []
    };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector as never, new AgentContextSerializerService());
    const context = await builder.build({ ...base, instruction: "Explain this PDF", attachmentIds: ["att-1"] });
    const prompt = builder.toReasoningPrompt(context);
    assert.equal(context.evidence[0].provenance, "CONVERSATION_ATTACHMENT:conv-1:att-1");
    assert.equal(context.truncated, true);
    assert.match(prompt, /Important grounded finding/);
    assert.match(prompt, /CONVERSATION_ATTACHMENT:conv-1:att-1/);
    assert.match(prompt, /truncated=true/);
  });

  it("collects bounded workspace evidence and keeps workspace provenance", async () => {
    let discovered = 0;
    const workspace = {
      discover: async () => {
        discovered++;
        return { tree: { truncated: false, root: { type: "directory", path: "", children: [{ type: "file", path: "package.json" }, { type: "file", path: "src/auth.ts" }] } } };
      }
    };
    const collector = {
      collectAttachments: async () => [],
      collectWorkspace: async (_request: unknown, paths: string[]) => paths.map((relativePath) => ({ sourceType: "workspace" as const, sourceId: "project-1", relativePath, provenance: `project-1:${relativePath}`, status: "COLLECTED" as const, metadata: {}, content: { text: `grounded ${relativePath}`, extractorId: "text", detectedMime: "text/plain", truncated: false }, warnings: [] }))
    };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector as never, new AgentContextSerializerService(), workspace as never);
    const context = await builder.build({ ...base, instruction: "Analyze this project" });
    assert.equal(discovered, 1);
    assert.equal(context.evidence.length, 2);
    assert.equal(context.evidence[0].provenance, "project-1:package.json");
    assert.match(builder.toReasoningPrompt(context), /grounded package\.json/);
  });

  it("keeps CHAT lightweight and does not discover a workspace", async () => {
    let discovered = 0;
    const workspace = { discover: async () => { discovered++; throw new Error("must not be called"); } };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), { collectAttachments: async () => [], collectWorkspace: async () => [] } as never, new AgentContextSerializerService(), workspace as never);
    const context = await builder.build({ ...base, instruction: "صباح الخير" });
    assert.deepEqual(context.userIntent, ["CHAT"]);
    assert.equal(discovered, 0);
    assert.equal(context.evidence.length, 0);
  });

  it("makes unavailable workspace evidence explicit without exposing protected paths", async () => {
    const workspace = { discover: async () => { throw Object.assign(new Error("denied"), { code: "WORKSPACE_FILE_ACCESS_DENIED" }); } };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), { collectAttachments: async () => [], collectWorkspace: async () => [] } as never, new AgentContextSerializerService(), workspace as never);
    const context = await builder.build({ ...base, instruction: "Analyze this project" });
    assert.ok(context.missingContext.includes("WORKSPACE_SCOPE"));
    assert.ok(context.missingContext.includes("INSUFFICIENT_EVIDENCE"));
    assert.equal(context.evidence.length, 1);
    assert.equal(context.evidence[0].status, "DENIED");
    assert.doesNotMatch(builder.toReasoningPrompt(context), /[A-Z]:\\|node_modules|\.git/);
  });

  it("selects query-relevant workspace files instead of unrelated important files", async () => {
    const workspace = {
      discover: async () => ({
        tree: {
          truncated: false,
          root: {
            type: "directory",
            path: "",
            children: [
              { type: "file", path: "package.json" },
              { type: "file", path: "src/auth.ts" },
              { type: "file", path: "src/navbar.tsx" }
            ]
          }
        }
      }),
      search: async (_request: unknown, query: string) => ({
        matches: query.includes("auth") ? [{ path: "src/auth.ts", type: "file" }] : []
      })
    };
    const collected: string[] = [];
    const collector = {
      collectAttachments: async () => [],
      collectWorkspace: async (_request: unknown, paths: string[]) => {
        collected.push(...paths);
        return paths.map((relativePath) => ({
          sourceType: "workspace" as const,
          sourceId: "project-1",
          relativePath,
          provenance: `project-1:${relativePath}`,
          status: "COLLECTED" as const,
          metadata: {},
          content: { text: `grounded ${relativePath}`, extractorId: "text", detectedMime: "text/plain", truncated: false },
          warnings: []
        }));
      }
    };
    const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector as never, new AgentContextSerializerService(), workspace as never);
    const context = await builder.build({ ...base, instruction: "Where is the authentication bug?" });
    assert.deepEqual(collected, ["src/auth.ts"]);
    assert.equal(context.evidence.length, 1);
    assert.equal(context.evidence[0].relativePath, "src/auth.ts");
  });
});
