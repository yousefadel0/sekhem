import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import path from "node:path";
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
import { WorkspaceDiscoveryService } from "../src/workspace-intelligence/workspace-discovery.service";
import { WorkspaceIntelligenceError } from "../src/workspace-intelligence/workspace-intelligence.errors";
import { WORKSPACE_INTELLIGENCE_LIMITS } from "../src/workspace-intelligence/workspace-intelligence.limits";
import { WorkspaceIntelligenceService } from "../src/workspace-intelligence/workspace-intelligence.service";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import type { TrustedWorkspaceContext } from "../src/workspace-intelligence/models/workspace.types";

function createServices() {
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
  const intelligence = new WorkspaceIntelligenceService(discovery, fileIntelligence, security, paths);
  return { intelligence, discovery, security, paths };
}

async function write(root: string, relative: string, contents: string | Buffer): Promise<void> {
  const full = join(root, ...relative.split("/"));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, contents);
}

describe("Workspace Intelligence", () => {
  let root: string;
  let previousRoots: string | undefined;
  let intelligence: WorkspaceIntelligenceService;
  let discovery: WorkspaceDiscoveryService;
  let security: WorkspaceSecurityService;
  let paths: WorkspacePathService;

  function ctx(): TrustedWorkspaceContext {
    return { workspaceId: "project-community-sonic-sovereign", projectId: "project-community-sonic-sovereign", name: "Community SONiC Sovereign Program", trustedRoot: root };
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sekhem-ws-"));
    previousRoots = process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
    process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = root;
    ({ intelligence, discovery, security, paths } = createServices());
  });

  afterEach(async () => {
    if (previousRoots === undefined) delete process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
    else process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = previousRoots;
    await rm(root, { recursive: true, force: true });
  });

  it("discovers a read-only file tree", async () => {
    await write(root, "README.md", "# Hello");
    await write(root, "src/app.ts", "export const n = 1;\n");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    assert.equal(tree.workspaceId, "project-community-sonic-sovereign");
    assert.equal(tree.fileCount, 2);
    assert.equal(tree.directoryCount, 1);
    assert.equal(tree.truncated, false);
    assert.ok(tree.root.children?.some((n) => n.path === "src" && n.type === "directory"));
  });

  it("orders directories before files alphabetically", async () => {
    await write(root, "b.txt", "b");
    await write(root, "a.txt", "a");
    await write(root, "zdir/x.txt", "x");
    await write(root, "adir/y.txt", "y");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    const names = (tree.root.children ?? []).map((n) => n.name);
    assert.deepEqual(names, ["adir", "zdir", "a.txt", "b.txt"]);
  });

  it("counts files, directories, and bytes", async () => {
    await write(root, "one.txt", "abcd");
    await write(root, "dir/two.txt", "ef");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    assert.equal(tree.fileCount, 2);
    assert.equal(tree.directoryCount, 1);
    assert.equal(tree.totalBytes, 6);
  });

  it("normalizes relative paths", () => {
    assert.equal(paths.normalizeRelativePath("src\\app.ts"), "src/app.ts");
    assert.equal(paths.normalizeRelativePath("./src/app.ts"), "src/app.ts");
  });

  it("rejects path traversal", () => {
    assert.throws(() => paths.normalizeRelativePath("../../etc/passwd"), (err: unknown) => {
      assert.ok(err instanceof WorkspaceIntelligenceError);
      assert.equal(err.code, "WORKSPACE_PATH_OUTSIDE_ROOT");
      return true;
    });
  });

  it("rejects absolute paths", async () => {
    assert.throws(() => paths.normalizeRelativePath("C:\\Windows\\System32"), (err: unknown) => {
      assert.ok(err instanceof WorkspaceIntelligenceError);
      assert.equal(err.code, "WORKSPACE_PATH_INVALID");
      return true;
    });
    await assert.rejects(
      () => intelligence.inspectFile(ctx(), "D:\\other-project\\secret.txt"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_PATH_INVALID");
        assert.equal(String((err as Error).message).includes("D:"), false);
        return true;
      }
    );
  });

  it("rejects symlink escapes", async () => {
    const outside = await mkdtemp(join(tmpdir(), "sekhem-out-"));
    await writeFile(join(outside, "secret.txt"), "outside-secret");
    let created = false;
    try {
      await symlink(outside, join(root, "escape"), "dir");
      created = true;
    } catch {
      created = false;
    }
    if (created) {
      const { tree } = await intelligence.inspectWorkspace(ctx());
      assert.equal((tree.root.children ?? []).some((n) => n.name === "escape"), false);
      assert.equal(tree.truncated, true);
      await assert.rejects(
        () => intelligence.inspectFile(ctx(), "escape/secret.txt"),
        (err: unknown) => {
          assert.ok(err instanceof WorkspaceIntelligenceError);
          assert.ok(err.code === "WORKSPACE_PATH_OUTSIDE_ROOT" || err.code === "WORKSPACE_FILE_NOT_FOUND");
          return true;
        }
      );
    } else {
      assert.equal(security.isInsideRoot(root, outside), false);
      assert.throws(() => security.assertInsideRoot(root, join(outside, "secret.txt")), (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_PATH_OUTSIDE_ROOT");
        return true;
      });
    }
    await rm(outside, { recursive: true, force: true });
  });

  it("filters forbidden directories", async () => {
    await write(root, "src/ok.ts", "ok");
    await write(root, "node_modules/pkg/index.js", "hidden");
    await write(root, ".git/config", "git");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    const names = collectPaths(tree.root);
    assert.equal(names.includes("src/ok.ts"), true);
    assert.equal(names.some((p) => p.includes("node_modules")), false);
    assert.equal(names.some((p) => p.includes(".git")), false);
  });

  it("enforces maximum depth", async () => {
    let nested = "d";
    for (let i = 0; i < WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_DEPTH + 2; i++) {
      nested += "/d";
    }
    await write(root, `${nested}/leaf.txt`, "x");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    assert.equal(tree.truncated, true);
    assert.ok(tree.warnings.some((w) => /depth/i.test(w)));
  });

  it("enforces maximum file count", async () => {
    for (let i = 0; i < WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_FILES + 5; i++) {
      await write(root, `f${String(i).padStart(3, "0")}.txt`, "x");
    }
    const { tree } = await intelligence.inspectWorkspace(ctx());
    assert.equal(tree.fileCount, WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_FILES);
    assert.equal(tree.truncated, true);
    assert.ok(tree.warnings.some((w) => /file count/i.test(w)));
  });

  it("enforces maximum total bytes", async () => {
    const chunk = Buffer.alloc(WORKSPACE_INTELLIGENCE_LIMITS.MAX_SINGLE_FILE_BYTES, 0x61);
    const copies = Math.ceil(WORKSPACE_INTELLIGENCE_LIMITS.MAX_TOTAL_WORKSPACE_BYTES / chunk.length) + 1;
    for (let i = 0; i < copies; i++) {
      await write(root, `big${i}.txt`, chunk);
    }
    const { tree } = await intelligence.inspectWorkspace(ctx());
    assert.equal(tree.truncated, true);
    assert.ok(tree.warnings.some((w) => /bytes/i.test(w)));
    assert.ok(tree.totalBytes <= WORKSPACE_INTELLIGENCE_LIMITS.MAX_TOTAL_WORKSPACE_BYTES);
  });

  it("enforces single-file size limit on inspection", async () => {
    const huge = Buffer.alloc(WORKSPACE_INTELLIGENCE_LIMITS.MAX_SINGLE_FILE_BYTES + 10, 0x62);
    await write(root, "huge.txt", huge);
    const { tree } = await intelligence.inspectWorkspace(ctx());
    assert.ok(tree.warnings.some((w) => /single-file/i.test(w)));
    await assert.rejects(
      () => intelligence.inspectFile(ctx(), "huge.txt"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_FILE_TOO_LARGE");
        return true;
      }
    );
  });

  it("emits truncation warnings instead of silent omission", async () => {
    for (let i = 0; i < WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_FILES + 1; i++) {
      await write(root, `n${i}.txt`, "n");
    }
    const { tree } = await intelligence.inspectWorkspace(ctx());
    assert.equal(tree.truncated, true);
    assert.ok(tree.warnings.length > 0);
  });

  it("classifies files during discovery", async () => {
    await write(root, "app.ts", "export {};");
    await write(root, "data.json", "{}");
    await write(root, "table.csv", "a,b\n1,2\n");
    await write(root, "notes.md", "# n");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    const byName = Object.fromEntries((tree.root.children ?? []).map((n) => [n.name, n]));
    assert.equal(byName["app.ts"]?.metadata?.kind, "code");
    assert.equal(byName["data.json"]?.metadata?.kind, "structured");
    assert.equal(byName["table.csv"]?.metadata?.kind, "spreadsheet");
    assert.equal(byName["notes.md"]?.metadata?.kind, "text");
  });

  it("discovers code files without executing them", async () => {
    await write(root, "src/main.py", "print('hi')");
    await write(root, "src/lib.go", "package lib");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    const pathsFound = collectPaths(tree.root);
    assert.ok(pathsFound.includes("src/main.py"));
    assert.ok(pathsFound.includes("src/lib.go"));
    const inspected = await intelligence.inspectFile(ctx(), "src/main.py");
    assert.match(inspected.text, /print/);
    assert.equal(inspected.extractorId, "text");
  });

  it("lists sensitive files but blocks content access", async () => {
    await write(root, ".env", "SECRET=1");
    await write(root, "id_rsa", "-----BEGIN PRIVATE KEY-----\nabc\n");
    const { tree } = await intelligence.inspectWorkspace(ctx());
    const envNode = (tree.root.children ?? []).find((n) => n.name === ".env");
    assert.ok(envNode);
    assert.equal(envNode?.metadata?.sensitive, true);
    await assert.rejects(
      () => intelligence.inspectFile(ctx(), ".env"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_FILE_ACCESS_DENIED");
        return true;
      }
    );
  });

  it("inspects selected files through FileIntelligenceService", async () => {
    await write(root, "README.md", "# Title\n\nBody");
    await write(root, "config.json", JSON.stringify({ ok: true }));
    const md = await intelligence.inspectFile(ctx(), "README.md");
    assert.equal(md.extractorId, "text");
    assert.match(md.text, /Body/);
    const json = await intelligence.inspectFile(ctx(), "config.json");
    assert.equal(json.extractorId, "text");
    assert.match(json.text, /ok/);
  });

  it("handles unsupported files without fabricating text", async () => {
    await write(root, "logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]));
    await assert.rejects(
      () => intelligence.inspectFile(ctx(), "logo.png"),
      (err: unknown) => {
        assert.ok(err instanceof WorkspaceIntelligenceError);
        assert.equal(err.code, "WORKSPACE_INSPECTION_FAILED");
        return true;
      }
    );
  });

  it("summarizes workspace metadata deterministically", async () => {
    await write(root, "README.md", "# Readme");
    await write(root, "package.json", "{}");
    await write(root, "src/app.ts", "export {};");
    const summary = await intelligence.summarizeWorkspace(ctx());
    assert.equal(summary.workspaceId, "project-community-sonic-sovereign");
    assert.equal(summary.name, "Community SONiC Sovereign Program");
    assert.equal(summary.fileCount, 3);
    assert.ok((summary.languages?.TypeScript ?? 0) >= 1);
    assert.ok((summary.fileCategories?.code ?? 0) >= 1);
    assert.deepEqual(summary.importantFiles, ["package.json", "README.md"]);
  });

  it("counts languages and file categories", async () => {
    await write(root, "a.ts", "a");
    await write(root, "b.ts", "b");
    await write(root, "c.py", "c");
    const summary = await intelligence.summarizeWorkspace(ctx());
    assert.equal(summary.languages?.TypeScript, 2);
    assert.equal(summary.languages?.Python, 1);
    assert.equal(summary.fileCategories?.code, 3);
  });

  it("detects important files only when they exist", async () => {
    await write(root, "go.mod", "module x");
    const summary = await intelligence.summarizeWorkspace(ctx());
    assert.deepEqual(summary.importantFiles, ["go.mod"]);
    assert.equal(summary.importantFiles?.includes("package.json"), false);
  });

  it("does not spawn subprocesses or import git/shell primitives", () => {
    const dir = path.resolve(__dirname, "../src/workspace-intelligence");
    const files = [
      "workspace-discovery.service.ts",
      "workspace-intelligence.service.ts",
      "workspace-path.service.ts",
      "security/workspace-security.service.ts"
    ];
    const forbidden = /from ["']node:(child_process|net|http|https)["']|execFile|spawn\(/;
    for (const relative of files) {
      const source = readFileSync(path.join(dir, relative), "utf8");
      assert.equal(forbidden.test(source), false, relative);
    }
  });

  it("does not allow arbitrary filesystem access via relative names", async () => {
    await write(root, "safe.txt", "inside-only");
    await assert.rejects(() => intelligence.inspectFile(ctx(), "../../etc/passwd"));
    const result = await intelligence.inspectFile(ctx(), "safe.txt");
    assert.equal(result.text.includes("inside-only"), true);
    assert.equal(result.text.includes("root:"), false);
  });

  it("reuses Project as workspace identity and does not invent a git source", () => {
    const workspace = intelligence.workspaceFromProject({
      id: "project-community-sonic-sovereign",
      name: "Community SONiC Sovereign Program"
    });
    assert.equal(workspace.id, "project-community-sonic-sovereign");
    assert.equal(workspace.projectId, "project-community-sonic-sovereign");
    assert.equal(workspace.source, "unknown");
    assert.throws(() => intelligence.unsupportedSource("github"), (err: unknown) => {
      assert.ok(err instanceof WorkspaceIntelligenceError);
      assert.equal(err.code, "WORKSPACE_SOURCE_UNSUPPORTED");
      return true;
    });
  });
});

function collectPaths(node: { path: string; children?: unknown[] }): string[] {
  const out: string[] = [];
  if (node.path) out.push(node.path);
  for (const child of (node.children ?? []) as Array<{ path: string; children?: unknown[] }>) {
    out.push(...collectPaths(child));
  }
  return out;
}
