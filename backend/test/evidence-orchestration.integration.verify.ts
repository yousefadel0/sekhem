import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { ForbiddenException } from "@nestjs/common";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";
import { preferredReadSkillId, AGENT_UNDERSTANDING_LIMITS } from "../src/agent-runtime/understanding/agent-understanding.types";
import { PdfParserService } from "../src/attachment/pdf-parser.service";
import { FileExtractorRegistry } from "../src/file-intelligence/extractors/file-extractor.registry";
import { JsonExtractor } from "../src/file-intelligence/extractors/json.extractor";
import { MarkdownExtractor } from "../src/file-intelligence/extractors/markdown.extractor";
import { PdfExtractor } from "../src/file-intelligence/extractors/pdf.extractor";
import { TextExtractor } from "../src/file-intelligence/extractors/text.extractor";
import { FileDetectorService } from "../src/file-intelligence/file-detector.service";
import { FileIntelligenceService } from "../src/file-intelligence/file-intelligence.service";
import { FileIntelligenceSecurityService } from "../src/file-intelligence/security/file-intelligence-security.service";
import { WorkspaceCapabilityService, type CapabilityRequest } from "../src/agent-runtime/capabilities/workspace-capability.service";
import { WorkspaceSourceResolver } from "../src/agent-runtime/capabilities/workspace-source.resolver";
import { WorkspaceDiscoveryService } from "../src/workspace-intelligence/workspace-discovery.service";
import { WorkspaceIntelligenceService } from "../src/workspace-intelligence/workspace-intelligence.service";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import type { ResourceAuthorizationService } from "../src/auth/resource-authz.service";

async function write(root: string, relative: string, contents: string): Promise<void> {
  const full = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
}

function createWorkspaceStack(authz?: ResourceAuthorizationService) {
  const fiSecurity = new FileIntelligenceSecurityService();
  const detector = new FileDetectorService(fiSecurity);
  const registry = new FileExtractorRegistry([
    new PdfExtractor(new PdfParserService(), fiSecurity),
    new JsonExtractor(fiSecurity),
    new MarkdownExtractor(fiSecurity),
    new TextExtractor(fiSecurity)
  ]);
  const fileIntelligence = new FileIntelligenceService(undefined, detector, registry, fiSecurity);
  const paths = new WorkspacePathService();
  const security = new WorkspaceSecurityService(paths);
  const discovery = new WorkspaceDiscoveryService(security, paths);
  const workspaceIntelligence = new WorkspaceIntelligenceService(discovery, fileIntelligence, security, paths);
  const resolver = new WorkspaceSourceResolver();
  const capabilities = new WorkspaceCapabilityService(workspaceIntelligence, resolver, paths, security, authz);
  return capabilities;
}

describe("Evidence orchestration final integration", () => {
  const detector = new ExecutionModeDetectorService();
  const understanding = new AgentUnderstandingService();
  let root: string;
  let previousRoots: string | undefined;

  it("keeps ordinary conversation on the chat side of execution-mode routing", async () => {
    assert.equal(await detector.isExecutionIntent("Hi"), false);
    assert.equal(await detector.isExecutionIntent("What is BGP?"), false);
    assert.equal(await detector.isExecutionIntent("Explain TCP."), false);
  });

  it("routes a workspace investigation to execution intent without a manual read command", async () => {
    assert.equal(await detector.isExecutionIntent("Inspect this workspace and explain what is currently blocking development."), true);
    assert.equal(await detector.isExecutionIntent("Analyze the files in this workspace and fix the issue"), true);
  });

  it("aligns understanding selection with the durable read skill", () => {
    const context = understanding.understand({
      userId: "user-1",
      projectId: "project-1",
      instruction: "Inspect this workspace and explain what is currently blocking development.",
      availableCapabilities: ["attachment_reader", "workspace_reader", "memo_generator", "repo_snapshot_reader"],
      workspaceAvailable: true
    });
    assert.ok(context.workspaceContext.required);
    assert.ok(context.selectedCapabilities.includes("workspace_reader"));
    assert.equal(preferredReadSkillId(context.selectedCapabilities), "workspace_reader");
    assert.notEqual(preferredReadSkillId(context.selectedCapabilities), "memo_generator");
  });

  it("collects query-aware workspace evidence through the real File Intelligence pipeline", async () => {
    root = await mkdtemp(path.join(tmpdir(), "sekhem-task3-"));
    previousRoots = process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
    process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = root;
    await write(root, "package.json", "{\"name\":\"demo\"}");
    await write(root, "src/auth.ts", "export function authenticate() { return true; }");
    await write(root, "src/navbar.tsx", "export function Navbar() { return null; }");
    await write(root, "README.md", "# Demo");

    const capabilities = createWorkspaceStack();
    const collector = new EvidenceCollectorService({} as never, capabilities);
    const builder = new AgentContextBuilderService(understanding, collector, new AgentContextSerializerService(), capabilities);
    const request: CapabilityRequest = {
      projectId: "project-1",
      workspaceId: "project-1",
      name: "demo",
      trustedRoot: root,
      userId: "user-1",
      userRole: "PM",
      agentRunId: "run-1"
    };
    const context = await builder.build({
      userId: "user-1",
      projectId: "project-1",
      conversationId: "conv-1",
      agentRunId: "run-1",
      instruction: "Where is the authentication problem?",
      availableCapabilities: ["workspace_reader"],
      userRole: "PM",
      trustedRoot: root
    });

    assert.ok(context.evidence.some((item) => item.status === "COLLECTED"));
    assert.ok(context.evidence.some((item) => item.relativePath === "src/auth.ts"));
    assert.equal(context.evidence.some((item) => item.relativePath === "src/navbar.tsx"), false);
    assert.ok(context.evidence.length <= AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS);
    const prompt = builder.toReasoningPrompt(context);
    assert.match(prompt, /authenticate/);
    const audit = JSON.stringify(builder.evidenceAuditPayload(context));
    assert.doesNotMatch(audit, /authenticate/);
    assert.match(audit, /src\/auth\.ts/);
    void request;
  });

  it("represents unauthorized workspace access as DENIED", async () => {
    const authz = {
      assertAuthorized: async () => { throw new ForbiddenException("denied"); }
    } as unknown as ResourceAuthorizationService;
    const capabilities = createWorkspaceStack(authz);
    const collector = new EvidenceCollectorService({} as never, capabilities);
    const builder = new AgentContextBuilderService(understanding, collector, new AgentContextSerializerService(), capabilities);
    const context = await builder.build({
      userId: "outsider",
      projectId: "project-1",
      instruction: "Inspect this workspace",
      availableCapabilities: ["workspace_reader"],
      userRole: "PM",
      trustedRoot: root
    });
    assert.ok(context.evidence.some((item) => item.status === "DENIED" || item.status === "UNAVAILABLE"));
    assert.equal(context.evidence.some((item) => item.status === "COLLECTED" && item.sourceType === "workspace"), false);
  });

  after(async () => {
    if (previousRoots === undefined) delete process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
    else process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = previousRoots;
    if (root) await rm(root, { recursive: true, force: true });
  });
});
