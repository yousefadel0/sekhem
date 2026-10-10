import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdir, mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ForbiddenException } from "@nestjs/common";
import { PdfParserService } from "../src/attachment/pdf-parser.service";
import { CsvExtractor } from "../src/file-intelligence/extractors/csv.extractor";
import { FileExtractorRegistry } from "../src/file-intelligence/extractors/file-extractor.registry";
import { JsonExtractor } from "../src/file-intelligence/extractors/json.extractor";
import { MarkdownExtractor } from "../src/file-intelligence/extractors/markdown.extractor";
import { PdfExtractor } from "../src/file-intelligence/extractors/pdf.extractor";
import { TextExtractor } from "../src/file-intelligence/extractors/text.extractor";
import { FileDetectorService } from "../src/file-intelligence/file-detector.service";
import { FileIntelligenceService } from "../src/file-intelligence/file-intelligence.service";
import { FileIntelligenceSecurityService } from "../src/file-intelligence/security/file-intelligence-security.service";
import { AGENT_FILE_READER_LIMITS } from "../src/agent-runtime/capabilities/workspace-context";
import { WorkspaceCapabilityService, type CapabilityRequest } from "../src/agent-runtime/capabilities/workspace-capability.service";
import { WorkspaceSourceResolver } from "../src/agent-runtime/capabilities/workspace-source.resolver";
import { ExecutionNotImplementedError } from "../src/agent-runtime/capabilities/execution-plane.types";
import { WorkspaceReaderSkill } from "../src/agent-runtime/skills/workspace-reader.skill";
import { SkillRegistryService } from "../src/agent-runtime/skills/skill-registry.service";
import { WorkspaceDiscoveryService } from "../src/workspace-intelligence/workspace-discovery.service";
import { WorkspaceIntelligenceError } from "../src/workspace-intelligence/workspace-intelligence.errors";
import { WORKSPACE_INTELLIGENCE_LIMITS } from "../src/workspace-intelligence/workspace-intelligence.limits";
import { WorkspaceIntelligenceService } from "../src/workspace-intelligence/workspace-intelligence.service";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import type { ResourceAuthorizationService } from "../src/auth/resource-authz.service";

function createStack(authz?: ResourceAuthorizationService) {
  const fiSecurity = new FileIntelligenceSecurityService();
  const detector = new FileDetectorService(fiSecurity);
  const registry = new FileExtractorRegistry([
    new PdfExtractor(new PdfParserService(), fiSecurity),
    new JsonExtractor(fiSecurity),
    new CsvExtractor(fiSecurity),
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
  const skill = new WorkspaceReaderSkill(capabilities);
  return { capabilities, skill, fileIntelligence };
}

async function write(root: string, relative: string, contents: string | Buffer): Promise<void> {
  const full = path.join(root, ...relative.split("/"));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
}

describe("Agent File Reader (5C)", () => {
  let root: string;
  let previousRoots: string | undefined;
  let capabilities: WorkspaceCapabilityService;
  let skill: WorkspaceReaderSkill;

  function req(): CapabilityRequest {
    return {
      projectId: "project-community-sonic-sovereign",
      workspaceId: "project-community-sonic-sovereign",
      name: "Community SONiC Sovereign Program",
      trustedRoot: root,
      userId: "user-pm-1",
      userRole: "PM",
      agentRunId: "run-1"
    };
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sekhem-5c-"));
    previousRoots = process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
    process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = root;
    ({ capabilities, skill } = createStack());
  });

  afterEach(async () => {
    if (previousRoots === undefined) delete process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
    else process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = previousRoots;
    await rm(root, { recursive: true, force: true });
  });

  it("discovers a workspace through the agent capability", async () => {
    await write(root, "src/auth.ts", "export const auth = true;");
    await write(root, "README.md", "# Project");
    const result = await capabilities.discover(req());
    assert.equal(result.tree.fileCount, 2);
    assert.equal(result.tree.directoryCount, 1);
    assert.equal(result.audit.capability, "workspace.discover");
    assert.equal(result.audit.allowed, true);
    assert.ok(!JSON.stringify(result.tree).includes(root));
  });

  it("lists directories", async () => {
    await write(root, "src/a.ts", "a");
    await write(root, "src/b.ts", "b");
    const listed = await capabilities.list(req(), "src");
    assert.equal(listed.path, "src");
    assert.equal(listed.children.length, 2);
    assert.deepEqual(listed.children.map((c) => c.name).sort(), ["a.ts", "b.ts"]);
  });

  it("searches relevant files deterministically", async () => {
    await write(root, "src/conversation.service.ts", "class ConversationService {}");
    await write(root, "src/auth.service.ts", "class AuthService {}");
    const found = await capabilities.search(req(), "conversation");
    assert.equal(found.matches.length, 1);
    assert.equal(found.matches[0].path, "src/conversation.service.ts");
  });

  it("inspects safe files", async () => {
    await write(root, "notes.md", "# Hello\n\nBody");
    const inspected = await capabilities.inspect(req(), "notes.md");
    assert.match(inspected.document.text, /Body/);
    assert.equal(inspected.document.extractorId, "text");
    assert.equal(inspected.document.text, "# Hello\n\nBody");
  });

  it("delegates file inspection to FileIntelligenceService", async () => {
    await write(root, "config.json", JSON.stringify({ ok: true }));
    const inspected = await capabilities.inspect(req(), "config.json");
    assert.equal(inspected.document.extractorId, "text");
    assert.equal(inspected.document.text, JSON.stringify({ ok: true }));
    assert.equal(inspected.document.category, "structured");
  });

  it("denies sensitive file inspection", async () => {
    await write(root, ".env", "SECRET=1");
    await assert.rejects(
      () => capabilities.inspect(req(), ".env"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_FILE_ACCESS_DENIED");
        return true;
      }
    );
  });

  it("denies forbidden directories", async () => {
    await write(root, "node_modules/pkg/index.js", "hidden");
    await write(root, "src/ok.ts", "ok");
    const listed = await capabilities.discover(req());
    const blob = JSON.stringify(listed.tree);
    assert.equal(blob.includes("node_modules"), false);
    await assert.rejects(() => capabilities.list(req(), "node_modules"), (err: unknown) => {
      assert.ok(err instanceof WorkspaceIntelligenceError);
      assert.equal(err.code, "WORKSPACE_FILE_ACCESS_DENIED");
      return true;
    });
  });

  it("rejects absolute paths", async () => {
    await assert.rejects(() => capabilities.inspect(req(), "C:\\Windows\\System32"), (err: unknown) => {
      assert.ok(err instanceof WorkspaceIntelligenceError);
      assert.equal(err.code, "WORKSPACE_PATH_INVALID");
      return true;
    });
  });

  it("rejects path traversal", async () => {
    await assert.rejects(() => capabilities.inspect(req(), "../../etc/passwd"), (err: unknown) => {
      assert.ok(err instanceof WorkspaceIntelligenceError);
      assert.equal(err.code, "WORKSPACE_PATH_OUTSIDE_ROOT");
      return true;
    });
  });

  it("rejects symlink escapes", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "sekhem-5c-out-"));
    await writeFile(path.join(outside, "secret.txt"), "outside");
    try {
      await symlink(outside, path.join(root, "escape"), "dir");
      await assert.rejects(() => capabilities.inspect(req(), "escape/secret.txt"));
    } catch (err) {
      if (err instanceof WorkspaceIntelligenceError) {
        assert.ok(["WORKSPACE_PATH_OUTSIDE_ROOT", "WORKSPACE_FILE_NOT_FOUND"].includes(err.code));
      }
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("enforces file size limits", async () => {
    const huge = Buffer.alloc(WORKSPACE_INTELLIGENCE_LIMITS.MAX_SINGLE_FILE_BYTES + 8, 0x61);
    await write(root, "huge.txt", huge);
    await assert.rejects(
      () => capabilities.inspect(req(), "huge.txt"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_FILE_TOO_LARGE");
        return true;
      }
    );
  });

  it("enforces search result limits", async () => {
    for (let i = 0; i < AGENT_FILE_READER_LIMITS.MAX_SEARCH_RESULTS + 5; i++) {
      await write(root, `hit${String(i).padStart(2, "0")}.txt`, "hit");
    }
    const found = await capabilities.search(req(), "hit");
    assert.equal(found.matches.length, AGENT_FILE_READER_LIMITS.MAX_SEARCH_RESULTS);
    assert.equal(found.truncated, true);
  });

  it("preserves workspace discovery limits", async () => {
    for (let i = 0; i < WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_FILES + 3; i++) {
      await write(root, `f${i}.txt`, "x");
    }
    const discovered = await capabilities.discover(req());
    assert.equal(discovered.tree.truncated, true);
    assert.equal(discovered.context.truncated, true);
  });

  it("collects evidence with provenance", async () => {
    await write(root, "a.ts", "export const a = 1;");
    await write(root, "b.ts", "export const b = 2;");
    const collected = await capabilities.collectEvidence(req(), ["a.ts", "b.ts"]);
    assert.equal(collected.context.evidence.length, 2);
    assert.deepEqual(collected.context.provenance, [
      "project-community-sonic-sovereign:a.ts",
      "project-community-sonic-sovereign:b.ts"
    ]);
    assert.ok(collected.context.evidence[0].text.includes("export const a"));
    assert.equal(collected.context.evidence.every((item) => item.sourceIdentity.includes(item.relativePath)), true);
  });

  it("keeps agent context bounded", async () => {
    const paths = Array.from({ length: AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_ITEMS + 3 }, (_, i) => `e${i}.txt`);
    for (const relative of paths) {
      await write(root, relative, "content");
    }
    const collected = await capabilities.collectEvidence(req(), paths);
    assert.equal(collected.context.evidence.length, AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_ITEMS);
    assert.ok(collected.context.limitsEncountered.includes("MAX_EVIDENCE_ITEMS"));
    assert.equal(collected.context.truncated, true);
  });

  it("rejects unauthorized project access", async () => {
    const deny = {
      assertAuthorized: async () => {
        throw new ForbiddenException("denied");
      }
    } as unknown as ResourceAuthorizationService;
    const { capabilities: locked } = createStack(deny);
    await write(root, "ok.txt", "ok");
    await assert.rejects(
      () => locked.discover({ ...req() }),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_ACCESS_DENIED");
        return true;
      }
    );
  });

  it("exposes no write operations through 5C capabilities", () => {
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(capabilities));
    assert.equal(proto.some((name) => /write|delete|edit|rename|move|commit|push/i.test(name)), false);
  });

  it("cannot execute shell, PowerShell, or GitLab mutations", () => {
    assert.throws(() => capabilities.powershellExecute(), (err: unknown) => err instanceof ExecutionNotImplementedError);
    assert.throws(() => capabilities.gitlabMutation("gitlab.commit"), (err: unknown) => {
      assert.ok(err instanceof WorkspaceIntelligenceError);
      assert.equal(err.code, "WORKSPACE_SOURCE_UNSUPPORTED");
      return true;
    });
    const source = readFileSync(path.resolve(__dirname, "../src/agent-runtime/capabilities/workspace-capability.service.ts"), "utf8");
    assert.equal(/child_process|execFile|spawn\(/.test(source), false);
  });

  it("workspace_reader skill is read-only and inspects files", async () => {
    await write(root, "src/app.ts", "export const app = 1;");
    const result = await skill.execute({
      agentRunId: "run-1",
      projectId: "project-community-sonic-sovereign",
      userId: "user-pm-1",
      userRole: "PM",
      stepIndex: 0,
      instruction: "inspect file src/app.ts",
      context: { operation: "inspect", relativePath: "src/app.ts", trustedRoot: root }
    });
    assert.equal(skill.isReadOnly, true);
    assert.equal(result.success, true);
    const output = result.output as { document: { extractorId: string; text: string } };
    assert.equal(output.document.extractorId, "text");
    assert.match(output.document.text, /export const app/);
  });

  it("does not change default Agent skill mapping for memos or git snapshots", () => {
    const registry = new SkillRegistryService({} as never, {} as never, {} as never);
    assert.ok(registry.getAvailableSkills("PM").some((s) => s.id === "memo_generator"));
    assert.ok(registry.getAvailableSkills("PM").some((s) => s.id === "repo_snapshot_reader"));
    assert.equal(registry.getAvailableSkills("PM").some((s) => s.id === "workspace_reader"), false);
  });

  it("registers workspace_reader when capabilities are provided", () => {
    const registry = new SkillRegistryService({} as never, {} as never, {} as never, capabilities);
    const skillDef = registry.getSkill("workspace_reader", "PM");
    assert.equal(skillDef.id, "workspace_reader");
    assert.equal(skillDef.isReadOnly, true);
  });
});
