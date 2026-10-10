import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { promises as fs } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { FileIntelligenceService } from "../src/file-intelligence/file-intelligence.service";
import { FileDetectorService } from "../src/file-intelligence/file-detector.service";
import { FileExtractorRegistry } from "../src/file-intelligence/extractors/file-extractor.registry";
import { TextExtractor } from "../src/file-intelligence/extractors/text.extractor";
import { JsonExtractor } from "../src/file-intelligence/extractors/json.extractor";
import { MarkdownExtractor } from "../src/file-intelligence/extractors/markdown.extractor";
import { FileIntelligenceSecurityService } from "../src/file-intelligence/security/file-intelligence-security.service";
import { WorkspaceDiscoveryService } from "../src/workspace-intelligence/workspace-discovery.service";
import { WorkspaceIntelligenceService } from "../src/workspace-intelligence/workspace-intelligence.service";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import { WORKSPACE_INTELLIGENCE_LIMITS } from "../src/workspace-intelligence/workspace-intelligence.limits";
import { WorkspaceCapabilityService } from "../src/agent-runtime/capabilities/workspace-capability.service";
import { WorkspaceSourceResolver } from "../src/agent-runtime/capabilities/workspace-source.resolver";
import { ProjectAccessService } from "../src/auth/project-access.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { AgentContextBuilderService } from "../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";

describe("P0-C bounded workspace discovery and relevant evidence", () => {
  let root: string, outside: string;
  let discovery: WorkspaceDiscoveryService, workspace: WorkspaceCapabilityService;
  let builder: AgentContextBuilderService, collector: EvidenceCollectorService;
  let membership: string | null, organization: string;
  const directoryReads: string[] = [];
  const request = () => ({ projectId: "project", workspaceId: "workspace", name: "Fixture", trustedRoot: root,
    authorizedRoots: root, userId: "owner", userRole: "PM" as const, organizationId: "org" });
  const context = () => ({ ...request(), workspaceId: "workspace" });
  const build = (instruction: string) => builder.build({ ...request(), instruction, availableCapabilities: ["workspace_reader"] });
  const write = async (path: string, text = "// safe source\nexport const value = 1;\n") => {
    const target = join(root, path);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  };
  const pathsIn = (node: any): string[] => [node.path, ...(node.children ?? []).flatMap(pathsIn)].filter(Boolean);

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), "sekhem-p0c-"));
    outside = await fs.mkdtemp(join(tmpdir(), "sekhem-p0c-outside-"));
    membership = "PM"; organization = "org"; directoryReads.length = 0;
    const fileSecurity = new FileIntelligenceSecurityService();
    const files = new FileIntelligenceService(undefined, new FileDetectorService(fileSecurity),
      new FileExtractorRegistry([new JsonExtractor(), new MarkdownExtractor(), new TextExtractor()]), fileSecurity);
    const paths = new WorkspacePathService(), security = new WorkspaceSecurityService(paths);
    discovery = new WorkspaceDiscoveryService(security, paths);
    const intelligence = new WorkspaceIntelligenceService(discovery, files, security, paths);
    const db = { project: { findUnique: async () => ({ id: "project", organizationId: "org" }) },
      user: { findUnique: async () => ({ status: "active", organizationId: organization }) },
      projectMember: { findUnique: async () => membership ? { role: membership } : null } };
    const resources = new ResourceAuthorizationService(db as never);
    const access = new ProjectAccessService(db as never, resources);
    workspace = new WorkspaceCapabilityService(intelligence, new WorkspaceSourceResolver(), paths, security, resources, {
      resolve: async (claims: any, projectId: string) => {
        await access.assert(claims, projectId);
        return { binding: { id: "workspace", version: "fixture" }, context: context() };
      }
    } as never);
    collector = new EvidenceCollectorService({} as never, workspace);
    builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector, new AgentContextSerializerService(), workspace);
    const original = fs.readdir.bind(fs);
    mock.method(fs, "readdir", ((path: any, options: any) => { directoryReads.push(String(path)); return original(path, options); }) as typeof fs.readdir);
    await write("package.json", '{"name":"fixture"}');
    await write("README.md", "# Fixture");
    await write("src/auth.ts");
    await write("src/navbar.tsx");
    await write("tests/auth.test.ts");
    await write("config/auth.yaml", "authentication: enabled");
  });

  afterEach(async () => {
    mock.restoreAll();
    for (const target of [root, outside]) {
      assert.equal(dirname(resolve(target)), resolve(tmpdir()));
      assert.ok(basename(target).startsWith("sekhem-p0c-"));
      await fs.rm(target, { recursive: true, force: true });
    }
  });

  for (const cache of [".pnpm-store", "node_modules", ".next", "dist", "build", "coverage", ".turbo", ".cache", "tmp", "temp"]) {
    it(`excludes ${cache} before charging discovery limits and reads the exact source`, async () => {
      await write(`${cache}/dependencies/auth.ts`);
      await write("app.js", "// requested source");
      const tree = await discovery.discoverTree(context());
      assert.equal(pathsIn(tree.root).some(path => path === cache || path.startsWith(`${cache}/`)), false);
      assert.equal(directoryReads.some(path => path.startsWith(join(root, cache))), false);
      assert.equal(tree.directoryCount, 3);
      assert.equal(tree.fileCount, 7);
      const result = await build("Read app.js");
      assert.deepEqual(result.evidence.map(item => [item.relativePath, item.outcome]), [["app.js", "READ"]]);
      assert.equal(result.evidence[0].content?.text, "// requested source");
    });
  }

  it("does not let a large .pnpm-store consume the 100-directory budget", async () => {
    for (let i = 0; i < 110; i++) await write(`.pnpm-store/pkg-${i}/index.js`);
    const tree = await discovery.discoverTree(context());
    assert.equal(tree.directoryCount, 3);
    assert.equal(tree.truncated, false);
    assert.ok(pathsIn(tree.root).includes("src/auth.ts"));
  });

  it("reads explicit paths directly without any discovery or search dependency", async () => {
    await write("z-source/app.js");
    mock.method(workspace, "discover", async () => { throw new Error("Discovery must not run for an exact path"); });
    mock.method(workspace, "search", async () => { throw new Error("Search must not run for an exact path"); });
    const result = await build("Read z-source/app.js");
    assert.deepEqual(result.evidence.map(item => [item.relativePath, item.outcome]), [["z-source/app.js", "READ"]]);
    assert.equal(directoryReads.length, 0);
  });

  it("reports a missing exact file instead of substituting a nested basename", async () => {
    await write("src/app.js");
    const result = await build("Read app.js");
    assert.deepEqual(result.evidence.map(item => [item.relativePath, item.outcome]), [["app.js", "NOT_FOUND"]]);
    assert.equal(result.evidence[0].content, undefined);
    assert.ok(result.missingContext.includes("INSUFFICIENT_EVIDENCE"));
  });

  it("supports an explicitly requested extensionless source", async () => {
    await write("extensionless", "ordinary text");
    const result = await build("Read extensionless");
    assert.deepEqual(result.evidence.map(item => [item.relativePath, item.outcome]), [["extensionless", "READ"]]);
  });

  it("prefers authentication source/config/tests and discovers only once", async () => {
    await write("workspace-inspect.ts");
    const result = await build("Inspect authentication in this workspace");
    assert.deepEqual(new Set(result.evidence.map(item => item.relativePath)), new Set(["src/auth.ts", "tests/auth.test.ts", "config/auth.yaml"]));
    assert.equal(directoryReads.filter(path => path === root).length, 1);
  });

  it("prioritizes relevant source directories before unrelated directory exhaustion", async () => {
    for (let i = 0; i < 110; i++) await write(`backend/src/aaa-${String(i).padStart(3, "0")}/file.txt`, "miscellaneous");
    await write("backend/src/auth/session.ts");
    const result = await build("Inspect authentication in this workspace");
    assert.ok(result.evidence.some(item => item.relativePath === "backend/src/auth/session.ts" && item.outcome === "READ"));
    assert.equal(result.truncated, true);
    assert.ok(result.evidence.every(item => /auth/.test(item.relativePath ?? "")));
  });

  it("reports a semantic evidence gap instead of selecting unrelated files", async () => {
    const result = await build("Inspect billing in this workspace");
    assert.equal(result.evidence.some(item => item.status === "COLLECTED"), false);
    assert.ok(result.missingContext.includes("INSUFFICIENT_EVIDENCE"));
    assert.ok(result.warnings.some(warning => /relevant workspace evidence/i.test(warning)));
  });

  it("does not let unrelated collected artifacts hide a workspace evidence gap", async () => {
    mock.method(collector, "collectArtifacts", async () => [{ sourceType: "artifact", sourceId: "other", provenance: "artifact:other", status: "COLLECTED",
      content: { text: "unrelated", extractorId: "text", detectedMime: "text/plain", truncated: false }, metadata: {}, warnings: [] }] as any);
    const result = await build("Inspect billing in this workspace");
    assert.ok(result.missingContext.includes("INSUFFICIENT_EVIDENCE"));
  });

  it("retains exact NOT_FOUND outcomes when other sources fill the evidence budget", async () => {
    mock.method(collector, "collectArtifacts", async () => Array.from({ length: 5 }, (_, i) => ({ sourceType: "artifact", sourceId: `artifact-${i}`,
      provenance: `artifact:${i}`, status: "COLLECTED", content: { text: "unrelated", extractorId: "text", detectedMime: "text/plain", truncated: false }, metadata: {}, warnings: [] })) as any);
    const result = await build("Read missing.js");
    assert.ok(result.evidence.some(item => item.relativePath === "missing.js" && item.outcome === "NOT_FOUND"));
    assert.ok(result.missingContext.includes("INSUFFICIENT_EVIDENCE"));
  });

  it("selects source, manifest, configuration, tests and docs for broad analysis", async () => {
    await write(".cache/auth.ts");
    await write(".pnpm-store/auth.ts");
    const result = await build("Analyze this project");
    assert.deepEqual(new Set(result.evidence.map(item => item.relativePath)), new Set(["package.json", "README.md", "src/auth.ts", "tests/auth.test.ts", "config/auth.yaml"]));
  });

  it("does not mistake CI configuration or generated declarations for the source-code sample", async () => {
    await write(".gitlab-ci.yml", "stages: [test]");
    await write("next-env.d.ts", "// generated type references");
    const result = await build("Analyze this project");
    assert.ok(result.evidence.some(item => item.relativePath === "src/auth.ts"));
    assert.ok(result.evidence.some(item => item.relativePath === "tests/auth.test.ts"));
    assert.equal(result.evidence.some(item => item.relativePath === "next-env.d.ts"), false);
  });

  it("keeps useful dot-directories and yields deterministic discovery", async () => {
    await write(".github/workflows/ci.yml", "name: checks");
    await write(".custom/source.ts");
    const first = await discovery.discoverTree(context());
    const second = await discovery.discoverTree(context());
    assert.deepEqual(first, second);
    assert.ok(pathsIn(first.root).includes(".github/workflows/ci.yml"));
    assert.ok(pathsIn(first.root).includes(".custom/source.ts"));
  });

  it("keeps discovery exclusion separate from explicit-read authorization", async () => {
    await write(".cache/safe.js");
    assert.equal((await build("Read .cache/safe.js")).evidence[0].outcome, "READ");
    membership = null;
    assert.equal((await build("Read .cache/safe.js")).evidence[0].status, "DENIED");
  });

  it("preserves safe canonical aliases for explicit reads without traversing aliases", async () => {
    await fs.symlink(join(root, "src"), join(root, "source-alias"), process.platform === "win32" ? "junction" : "dir");
    assert.equal((await build("Read source-alias/auth.ts")).evidence[0].outcome, "READ");
    const tree = await discovery.discoverTree(context());
    assert.equal(pathsIn(tree.root).some(path => path.startsWith("source-alias")), false);
    assert.ok(pathsIn(tree.root).includes("src/auth.ts"));
  });

  it("propagates discovery truncation even when search results fit their cap", async () => {
    for (let i = 0; i < 105; i++) await fs.mkdir(join(root, `ordinary-${i}`));
    const found = await workspace.search(request(), "auth");
    assert.ok(found.matches.length > 0 && found.matches.length < 50);
    assert.equal(found.truncated, true);
    assert.equal(found.audit.truncated, true);
  });

  for (const path of [".env", "secrets/private.txt", "../outside.txt", "node_modules/safe.js", "dist/safe.js"]) {
    it(`preserves denial for ${path}`, async () => {
      if (!path.startsWith("..")) await write(path, "protected fixture");
      const result = await build(`Read ${path}`);
      assert.equal(result.evidence[0].outcome, "DENIED");
      assert.equal(result.evidence[0].content, undefined);
    });
  }

  it("keeps secret-content and file-size restrictions on direct reads", async () => {
    await write("safe.js", "-----BEGIN PRIVATE KEY-----\nprotected fixture\n-----END PRIVATE KEY-----");
    assert.equal((await build("Read safe.js")).evidence[0].outcome, "DENIED");
    await write("large.txt", "x".repeat(WORKSPACE_INTELLIGENCE_LIMITS.MAX_SINGLE_FILE_BYTES + 1));
    assert.notEqual((await build("Read large.txt")).evidence[0].status, "COLLECTED");
  });

  it("preserves canonical containment and sensitive-target checks for junctions", async () => {
    await fs.writeFile(join(outside, "outside.txt"), "outside");
    await fs.symlink(outside, join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
    await write("secrets/private.txt", "protected");
    await fs.symlink(join(root, "secrets"), join(root, "alias"), process.platform === "win32" ? "junction" : "dir");
    for (const path of ["escape/outside.txt", "alias/private.txt"]) assert.equal((await build(`Read ${path}`)).evidence[0].outcome, "DENIED");
    const tree = await discovery.discoverTree(context());
    assert.ok(pathsIn(tree.root).includes("src/auth.ts"), "A skipped unsafe alias must not end discovery of safe siblings");
    assert.equal(pathsIn(tree.root).some(path => path.startsWith("alias/") || path.startsWith("escape/")), false);
  });

  for (const denied of ["project", "organization"]) it(`preserves current ${denied} authorization for exact paths`, async () => {
    if (denied === "project") membership = null; else organization = "other-org";
    const result = await build("Read src/auth.ts");
    assert.equal(result.evidence[0].status, "DENIED");
    assert.equal(result.evidence[0].content, undefined);
    assert.equal(directoryReads.length, 0);
  });

  it("keeps file, directory and node limits unchanged under wide source trees", async () => {
    for (let i = 0; i < 220; i++) await write(`src/branch-${Math.floor(i / 2)}/file-${i}.ts`);
    const tree = await discovery.discoverTree(context());
    assert.ok(tree.fileCount <= 200);
    assert.ok(tree.directoryCount <= 100);
    assert.ok(pathsIn(tree.root).length + 1 <= 300);
    assert.equal(tree.truncated, true);
  });
});
