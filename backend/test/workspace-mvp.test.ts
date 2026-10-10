import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative } from "node:path";
import { ProjectAccessService } from "../src/auth/project-access.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { WorkspaceBindingService } from "../src/workspace-intelligence/workspace-binding.service";
import { WorkspaceController } from "../src/workspace-intelligence/workspace.controller";
import { WorkspaceDiscoveryService } from "../src/workspace-intelligence/workspace-discovery.service";
import { WorkspaceIntelligenceService } from "../src/workspace-intelligence/workspace-intelligence.service";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import { FileIntelligenceSecurityService } from "../src/file-intelligence/security/file-intelligence-security.service";
import { FileIntelligenceService } from "../src/file-intelligence/file-intelligence.service";
import { FileDetectorService } from "../src/file-intelligence/file-detector.service";
import { FileExtractorRegistry } from "../src/file-intelligence/extractors/file-extractor.registry";
import { TextExtractor } from "../src/file-intelligence/extractors/text.extractor";
import { WorkspaceIntelligenceError } from "../src/workspace-intelligence/workspace-intelligence.errors";
import { evidenceReceipt, presentPlan } from "../src/agent-runtime/understanding/agent-presentation";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { ConversationService } from "../src/conversation/conversation.service";
import { ConversationModule } from "../src/conversation/conversation.module";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { PrismaService } from "../src/data-access/prisma.service";
import { Test } from "@nestjs/testing";
import { ForbiddenException, UnauthorizedException, type INestApplication } from "@nestjs/common";
import { AuthService } from "../src/auth/auth.service";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";

const claims: any = { sub: "member", organizationId: "org-a", role: "PM", email: "", displayName: "" };
function access() {
  const db: any = {
    project: { findUnique: async ({ where }: any) => ({ id: where.id, organizationId: "org-a" }) },
    user: { findUnique: async ({ where }: any) => where.id === "member" ? { organizationId: "org-a", status: "active" } : { organizationId: "org-b", status: "active" } },
    projectMember: { findUnique: async ({ where }: any) => where.projectId_userId.projectId === "project-community-sonic-sovereign" ? { role: "PM" } : null }
  };
  return new ProjectAccessService(db, new ResourceAuthorizationService(db));
}
describe("MVP workspace authorization and immutable binding", () => {
  const bindings = new WorkspaceBindingService(access());
  it("returns an explicit configured identity and never serializes an absolute root", async () => {
    const { binding, context } = await bindings.resolve(claims, "project-community-sonic-sovereign");
    assert.equal(binding.id, "sekhem-source");
    assert.notEqual(binding.id, binding.projectId);
    assert.equal(binding.mode, "READ_ONLY");
    assert.ok(context.trustedRoot);
    assert.equal(JSON.stringify(binding).includes(context.trustedRoot), false);
    assert.equal((await bindings.resolve(claims, binding.projectId, binding.version)).binding.version, binding.version);
  });
  it("rejects cross-organization Admin, revoked organization membership and nonmember project", async () => {
    await assert.rejects(bindings.resolve({ ...claims, role: "Admin", organizationId: "org-b" }, "project-community-sonic-sovereign"), /organization access denied/);
    await assert.rejects(bindings.resolve({ ...claims, sub: "revoked" }, "project-community-sonic-sovereign"), /membership/);
    await assert.rejects(bindings.resolve(claims, "other-project"), /permission/);
  });
  it("rejects changed snapshots instead of silently using the new target", async () => {
    await assert.rejects(bindings.resolve(claims, "project-community-sonic-sovereign", "old-binding"), /binding changed/);
  });
});

describe("MVP read-only workspace API", () => {
  let temp: string, root: string, controller: WorkspaceController, app: INestApplication, url: string;
  before(async () => {
    temp = await mkdtemp(join(tmpdir(), "sekhem-mvp-")); root = join(temp, "workspace");
    await mkdir(join(root, "src"), { recursive: true }); await mkdir(join(root, "credentials"));
    await writeFile(join(root, "src", "auth.ts"), "export const readOnly = true;\n");
    await writeFile(join(root, ".env"), "PRIVATE_DATA=never-return");
    await writeFile(join(root, "credentials", "secret.txt"), "never-return");
    await writeFile(join(root, "unsupported.zip"), Buffer.from([80, 75, 3, 4, 0, 0]));
    await writeFile(join(temp, "outside.txt"), "outside-workspace");
    await symlink(temp, join(root, "escape"), "junction");
    await symlink(join(root, "credentials"), join(root, "alias"), "junction");
    const paths = new WorkspacePathService(), security = new WorkspaceSecurityService(paths);
    const fileSecurity = new FileIntelligenceSecurityService();
    const intelligence = new WorkspaceIntelligenceService(new WorkspaceDiscoveryService(security, paths),
      new FileIntelligenceService(undefined, new FileDetectorService(fileSecurity), new FileExtractorRegistry([new TextExtractor(fileSecurity)]), fileSecurity), security, paths);
    const binding = { id: "test-workspace", projectId: "project-1", name: "Test workspace", version: "one", mode: "READ_ONLY", location: "BACKEND_HOST" };
    const auth = { validateDurableSession: async (cookie: string) => { if (cookie !== "session") throw new UnauthorizedException("Authentication required"); return claims; } };
    const bindings = { resolve: async (_claims: unknown, projectId: string) => { if (projectId !== "project-1") throw new ForbiddenException("Project access denied"); return { binding, context: { workspaceId: binding.id, projectId, name: binding.name, trustedRoot: root, authorizedRoots: root } }; } };
    const discovery = new WorkspaceDiscoveryService(security, paths);
    controller = new WorkspaceController(auth as any, bindings as any, discovery, intelligence);
    const module = await Test.createTestingModule({ controllers: [WorkspaceController], providers: [
      { provide: AuthService, useValue: auth }, { provide: WorkspaceBindingService, useValue: bindings },
      { provide: WorkspaceDiscoveryService, useValue: discovery }, { provide: WorkspaceIntelligenceService, useValue: intelligence }
    ] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix("api"); app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, "127.0.0.1"); url = await app.getUrl();
  });
  after(async () => {
    await app?.close();
    const safe = resolve(temp), rel = relative(resolve(tmpdir()), safe);
    assert.ok(rel.startsWith("sekhem-mvp-") && !rel.includes(".."));
    await rm(safe, { recursive: true, force: true });
  });
  it("authenticates and authorizes before directory reads", async () => {
    await assert.rejects(controller.tree(undefined, "project-1"), /Authentication/);
    await assert.rejects(controller.tree("session", "other-project"), /access denied/);
  });
  it("lists only the requested directory, hides secrets and does not recursively return descendants", async () => {
    const result = await controller.tree("session", "project-1");
    const children = result.data.root.children!;
    assert.ok(children.some(node => node.name === "src"));
    assert.equal(children.some(node => [".env", "credentials", "escape", "alias"].includes(node.name)), false);
    assert.equal(children.find(node => node.name === "src")?.children, undefined);
    const expanded = await controller.tree("session", "project-1", "src");
    assert.deepEqual(expanded.data.root.children?.map(node => node.path), ["src/auth.ts"]);
  });
  it("reads actual source content without execution", async () => {
    const result = await controller.file("session", "project-1", "src/auth.ts");
    assert.equal(result.data.text, "export const readOnly = true;\n");
    assert.equal(result.data.status, "READ");
    assert.equal(result.data.binding.mode, "READ_ONLY");
  });
  for (const path of ["../outside.txt", "C:/", ".env", "credentials/secret.txt", "escape/outside.txt", "alias/secret.txt"]) {
    it(`rejects traversal, forbidden or aliased target: ${path}`, async () => {
      await assert.rejects(controller.file("session", "project-1", path));
    });
  }
  it("reports unsupported content without inventing extracted text", async () => {
    await assert.rejects(controller.file("session", "project-1", "unsupported.zip"), (error: unknown) => error instanceof WorkspaceIntelligenceError);
  });
  it("HTTP endpoints preserve envelopes and reject unauthorized/traversal requests before returning content", async () => {
    const base = `${url}/api/projects/project-1/workspace`;
    assert.equal((await fetch(base)).status, 401);
    const descriptor = await fetch(base, { headers: { cookie: "session" } });
    assert.equal(descriptor.status, 200); const body = await descriptor.json();
    assert.equal(body.data.executionAvailable, false); assert.equal(JSON.stringify(body).includes(root), false);
    const file = await fetch(`${base}/file?path=src%2Fauth.ts`, { headers: { cookie: "session" } });
    assert.equal(file.status, 200); assert.equal((await file.json()).data.text, "export const readOnly = true;\n");
    const denied = await fetch(`${base}/file?path=credentials%2Fsecret.txt`, { headers: { cookie: "session" } });
    assert.equal(denied.status, 403); assert.equal((await denied.json()).data, null);
    assert.equal((await fetch(`${url}/api/projects/other-project/workspace/tree`, { headers: { cookie: "session" } })).status, 403);
  });
});

it("evidence receipt distinguishes read/selected from influence and persists only bounded display data", () => {
  const context = new AgentUnderstandingService().understand({ userId: "u", instruction: "Inspect this workspace", availableCapabilities: [], projectId: "p" });
  context.evidence = [{ sourceType: "workspace", sourceId: "w", relativePath: "auth.ts", status: "COLLECTED", provenance: "workspace:w:auth.ts", metadata: {}, warnings: [], content: { text: "private-source-body", truncated: false, extractorId: "text", detectedMime: "text/plain" } }];
  new AgentContextSerializerService().forReasoning(context);
  const receipt = evidenceReceipt(context);
  assert.equal(receipt[0].read, true); assert.equal(receipt[0].selected, true); assert.equal(receipt[0].usedInAnswer, "UNKNOWN");
  const restored = presentPlan(JSON.parse(JSON.stringify([{ parameters: { evidenceReceipt: receipt, originatingMessageId: "msg-1" } }])));
  assert.equal(restored.evidence[0].relativePath, "auth.ts"); assert.equal(restored.originatingMessageId, "msg-1");
  assert.equal(restored.executionPerformed, false); assert.equal(JSON.stringify(restored).includes("private-source-body"), false);
});

it("production module wires authoritative automatic routing and workspace authorization", async () => {
  const module = await Test.createTestingModule({ imports: [ConversationModule] }).overrideProvider(PrismaService).useValue({}).compile();
  try {
    const detector = module.get(ExecutionModeDetectorService);
    assert.equal(await detector.isExecutionIntent("Hello"), false);
    assert.equal(await detector.isExecutionIntent("Analyze this project and inspect the authentication implementation."), true);
    assert.ok(module.get(ProjectAccessService)); assert.ok(module.get(WorkspaceBindingService));
  } finally { await module.close(); }
});

it("conversation writes cannot authorize a foreign project or replace a server workspace snapshot", async () => {
  let saved: any, writes = 0;
  const db: any = { conversation: {
    create: async ({ data }: any) => { writes++; saved = { ...data, createdAt: new Date(), updatedAt: new Date() }; return saved; },
    findUnique: async () => saved,
    update: async ({ data }: any) => { saved = { ...saved, ...data }; return saved; }
  } };
  const gate = access(), bindings = new WorkspaceBindingService(gate);
  const service = new ConversationService(db, undefined, undefined, undefined, undefined, undefined, undefined, undefined, gate, bindings);
  await assert.rejects(service.createConversation("member", { projectId: "other-project", title: "Denied" }, claims));
  assert.equal(writes, 0);
  await service.createConversation("member", { projectId: "project-community-sonic-sovereign", title: "Bound", metadata: { workspaceBinding: { root: "C:/" } } }, claims);
  const originalBinding = saved.metadata.workspaceBinding;
  assert.equal(originalBinding.id, "sekhem-source"); assert.equal(originalBinding.root, undefined);
  await service.updateConversation(saved.id, "member", { metadata: { workspaceBinding: { version: "attacker" }, group: "Review" } });
  assert.deepEqual(saved.metadata.workspaceBinding, originalBinding);
  assert.equal(saved.metadata.group, "Review");
});
