import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { ForbiddenException } from "@nestjs/common";
import { AttachmentService } from "../src/attachment/attachment.service";
import { AttachmentController } from "../src/attachment/attachment.controller";
import { ProjectAccessService } from "../src/auth/project-access.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { PdfParserService } from "../src/attachment/pdf-parser.service";
import { FileIntelligenceService } from "../src/file-intelligence/file-intelligence.service";
import { FileDetectorService } from "../src/file-intelligence/file-detector.service";
import { FileExtractorRegistry } from "../src/file-intelligence/extractors/file-extractor.registry";
import { FileIntelligenceSecurityService } from "../src/file-intelligence/security/file-intelligence-security.service";
import { TextExtractor } from "../src/file-intelligence/extractors/text.extractor";
import { HtmlExtractor } from "../src/file-intelligence/extractors/html.extractor";
import { JsonExtractor } from "../src/file-intelligence/extractors/json.extractor";
import { MarkdownExtractor } from "../src/file-intelligence/extractors/markdown.extractor";
import { CsvExtractor } from "../src/file-intelligence/extractors/csv.extractor";
import { PdfExtractor } from "../src/file-intelligence/extractors/pdf.extractor";
import { FileIntelligenceError } from "../src/file-intelligence/file-intelligence.errors";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import { WorkspaceDiscoveryService } from "../src/workspace-intelligence/workspace-discovery.service";
import { WorkspaceIntelligenceService } from "../src/workspace-intelligence/workspace-intelligence.service";
import { WorkspaceCapabilityService } from "../src/agent-runtime/capabilities/workspace-capability.service";
import { WorkspaceSourceResolver } from "../src/agent-runtime/capabilities/workspace-source.resolver";
import { EvidenceCollectorService } from "../src/agent-runtime/understanding/evidence-collector.service";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { evidenceReceipt } from "../src/agent-runtime/understanding/agent-presentation";

const sourceNames = ["index.html", "package.json", "README.md", "app.js", "app.ts", "app.tsx", ".gitignore", "Dockerfile", "Makefile", "LICENSE", "unknown.extension", "extensionless", "style.css", "config.yaml", "file.xml"];
const sourceFor = (name: string) => name === "package.json" ? '{"name":"fixture"}' : name === "index.html"
  ? '<!doctype html>\n<script>globalThis.sourceMustNotExecute = true;</script><h1>A &amp; B</h1>' : "// ordinary source comment\nconst example = 'مرحبا';\n";
const pdf = (text = "") => Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nstream\nBT (${text}) Tj ET\nendstream\n%%EOF`);

describe("A: bounded content reading and evidence outcomes", () => {
  let root: string;
  let files: FileIntelligenceService;
  let workspace: WorkspaceCapabilityService;
  let uploads: AttachmentService;
  let saved: any[];
  let writes: number;
  const request = () => ({ projectId: "project", workspaceId: "workspace", name: "Fixture", trustedRoot: root, authorizedRoots: root, userId: "owner", userRole: "PM" as const, organizationId: "org" });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "sekhem-content-repair-"));
    const security = new FileIntelligenceSecurityService();
    files = new FileIntelligenceService(undefined, new FileDetectorService(security), new FileExtractorRegistry([
      new PdfExtractor(), new JsonExtractor(), new CsvExtractor(), new HtmlExtractor(), new MarkdownExtractor(), new TextExtractor()
    ]), security);
    const paths = new WorkspacePathService(), policy = new WorkspaceSecurityService(paths);
    const intelligence = new WorkspaceIntelligenceService(new WorkspaceDiscoveryService(policy, paths), files, policy, paths);
    workspace = new WorkspaceCapabilityService(intelligence, new WorkspaceSourceResolver(), paths, policy, {
      assertAuthorized: async (subject: any) => { if (subject.userId !== "owner") throw new ForbiddenException(); }
    } as never);
    for (const name of sourceNames) await writeFile(join(root, name), sourceFor(name));
    saved = []; writes = 0;
    uploads = new AttachmentService({
      conversation: { findUnique: async () => ({ id: "conv", userId: "owner" }) },
      conversationAttachment: { create: async ({ data }: any) => { saved.push(data); return { ...data, id: "attachment", createdAt: new Date() }; } }
    } as never, { write: async () => { writes++; } } as never);
  });
  afterEach(async () => {
    const target = resolve(root);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.ok(basename(target).startsWith("sekhem-content-repair-"));
    await rm(target, { recursive: true, force: true });
  });

  for (const name of sourceNames) {
    it(`reads and admits ${name} without relying on browser MIME`, async () => {
      const result = await workspace.inspect(request(), name);
      assert.ok(result.document.text.includes(name === "package.json" ? "fixture" : name === "index.html" ? "<script>" : "// ordinary source comment"));
      if (name === "index.html") {
        assert.equal(result.document.text, sourceFor(name));
        assert.equal(result.document.detectedMime, "text/html");
        assert.equal((globalThis as any).sourceMustNotExecute, undefined);
      }
      await uploads.uploadAttachment("owner", "conv", { fileName: name, mimeType: "application/octet-stream", buffer: Buffer.from(sourceFor(name)) });
      assert.equal(saved[0].fileName, name);
      assert.equal(writes, 1);
    });
  }

  it("retains source-mode HTML and separate non-executing document extraction", async () => {
    const buffer = Buffer.from(sourceFor("index.html"));
    const input = { attachmentId: "a", fileName: "index.html", mimeType: "text/plain", sizeBytes: buffer.length, buffer };
    assert.equal((await files.extractFromBuffer({ ...input, interpretation: "source" })).text, sourceFor("index.html"));
    assert.equal((await files.extractFromBuffer({ ...input, interpretation: "document" })).text, "A & B");
  });

  it("denies sensitive names and secret content in workspace and upload paths", async () => {
    for (const name of [".env", ".env.local", "id_rsa", "key.pem", "credentials.json", "secrets.txt"]) {
      await writeFile(join(root, name), "ordinary text");
      await assert.rejects(workspace.inspect(request(), name));
      await assert.rejects(uploads.uploadAttachment("owner", "conv", { fileName: name, mimeType: "text/plain", buffer: Buffer.from("ordinary text") }), (error: any) => error.code === "FILE_ACCESS_DENIED");
    }
    const buffer = Buffer.from('api_key="sensitive-value-123456"');
    await writeFile(join(root, "settings.custom"), buffer);
    await assert.rejects(workspace.inspect(request(), "settings.custom"));
    await assert.rejects(uploads.uploadAttachment("owner", "conv", { fileName: "settings.custom", mimeType: "text/plain", buffer }));
    assert.equal(writes, 0);
  });

  it("rejects binary/archive/database/executable payloads even with source names", async () => {
    const payloads = [Buffer.from([0xff, 0xfe, 0x80]), Buffer.concat([Buffer.from("x".repeat(2048)), Buffer.from([0])]),
      Buffer.from("MZ executable"), Buffer.from("PK\x03\x04archive"), Buffer.from("SQLite format 3\0database"), Buffer.from([0x7f, 0x45, 0x4c, 0x46])];
    for (const buffer of payloads) {
      await assert.rejects(uploads.uploadAttachment("owner", "conv", { fileName: "app.js", mimeType: "text/plain", buffer }));
      await assert.rejects(files.extractFromBuffer({ attachmentId: "a", fileName: "unknown.extension", mimeType: "application/octet-stream", sizeBytes: buffer.length, buffer }));
    }
    for (const fileName of ["payload.exe", "bundle.zip", "data.sqlite", "data.db", "code.wasm"]) {
      await assert.rejects(uploads.uploadAttachment("owner", "conv", { fileName, mimeType: "text/plain", buffer: Buffer.from("ordinary printable text") }));
    }
    assert.equal(writes, 0);
  });

  it("retains authorization, traversal, and size boundaries", async () => {
    await assert.rejects(workspace.inspect({ ...request(), userId: "intruder" }, "app.js"));
    for (const path of ["../outside.txt", "C:\\Windows\\system.ini", "/etc/passwd"]) await assert.rejects(workspace.inspect(request(), path));
    await writeFile(join(root, "huge.txt"), "x".repeat(512 * 1024 + 1));
    await assert.rejects(workspace.inspect(request(), "huge.txt"));
    await assert.rejects(uploads.uploadAttachment("intruder", "conv", { fileName: "safe.js", mimeType: "text/plain", buffer: Buffer.from("safe text") }));
    assert.equal(writes, 0);
  });

  it("preserves individual outcomes through collection, serialization, and receipts", async () => {
    await writeFile(join(root, ".env"), "protected");
    await writeFile(join(root, "archive.zip"), "PK\x03\x04archive");
    await writeFile(join(root, "scan.pdf"), pdf());
    await writeFile(join(root, "long.txt"), "x".repeat(13000));
    await writeFile(join(root, "image.png"), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await writeFile(join(root, "fake.png"), "ordinary text pretending to be an image");
    const collector = new EvidenceCollectorService({} as never, workspace);
    const cases = [["app.js", ".env", "archive.zip", "scan.pdf", "long.txt"], ["image.png", "missing.txt", "fake.png"]];
    const expected = [["READ", "DENIED", "UNSUPPORTED", "SCANNED", "TRUNCATED"], ["IMAGE_UNAVAILABLE", "NOT_FOUND", "FAILED"]];
    for (let i = 0; i < cases.length; i++) {
      const evidence = await collector.collectWorkspace(request(), cases[i]);
      assert.deepEqual(evidence.map(item => item.outcome), expected[i]);
      const context = new AgentUnderstandingService().understand({ userId: "owner", projectId: "project", instruction: "Analyze the project", availableCapabilities: ["workspace_reader"] });
      context.evidence = evidence;
      const prompt = new AgentContextSerializerService().forReasoning(context);
      const receipts = evidenceReceipt(context);
      for (let j = 0; j < evidence.length; j++) {
        assert.ok(prompt.includes(`outcome=${expected[i][j]}`));
        assert.equal(receipts[j].outcome, expected[i][j]);
        assert.equal(receipts[j].read, ["READ", "TRUNCATED"].includes(expected[i][j]));
        if (!receipts[j].read) assert.equal(evidence[j].content, undefined);
      }
    }
  });

  it("accepts short text and short text PDFs, and bounds PDF decompression", async () => {
    await uploads.uploadAttachment("owner", "conv", { fileName: "extensionless", mimeType: "", buffer: Buffer.from("x") });
    assert.equal(new PdfParserService().parse(pdf("Hi")).isScanned, false);
    const bomb = Buffer.concat([Buffer.from("%PDF-1.4\nstream\n"), deflateSync(Buffer.from("x".repeat(2 * 1024 * 1024))), Buffer.from("\nendstream\n%%EOF")]);
    assert.throws(() => new PdfParserService().parse(bomb), (error: unknown) => error instanceof FileIntelligenceError && error.code === "EXTRACTION_LIMIT_EXCEEDED");
  });

  it("reads source without requiring valid JSON or changing whitespace", async () => {
    await writeFile(join(root, "in-progress.json"), "{\r\n  unfinished");
    assert.equal((await workspace.inspect(request(), "in-progress.json")).document.text, "{\r\n  unfinished");
  });

  it("keeps valid file evidence when another requested path is denied", async () => {
    const { context } = await workspace.collectEvidence(request(), ["../outside.txt", "app.js", "C:\\private\\secret.txt"]);
    assert.deepEqual(context.evidence.map(item => item.outcome), ["DENIED", "READ", "DENIED"]);
    assert.equal(JSON.stringify(context).includes("C:\\private"), false);
  });

  it("serves uploaded active content as a passive download", async () => {
    const db = {
      conversation: { findUnique: async () => ({ userId: "owner", projectId: "project" }) },
      user: { findUnique: async () => ({ status: "active", organizationId: "org" }) },
      project: { findUnique: async () => ({ id: "project", organizationId: "org" }) },
      projectMember: { findUnique: async () => ({ role: "PM" }) }
    };
    const access = new ProjectAccessService(db as never, new ResourceAuthorizationService(db as never));
    const controller = new AttachmentController({ getAttachmentBufferForConversation: async () => ({ fileName: "index.html", mimeType: "text/html", buffer: Buffer.from("<script>bad()</script>") }) } as never,
      { validateDurableSession: async () => ({ sub: "owner", email: "owner@example.test", displayName: "Owner", role: "PM", organizationId: "org" }) } as never,
      db as never, access);
    const headers: Record<string, string> = {};
    await controller.getAttachmentContent("a", "cookie", { setHeader: (key: string, value: string) => { headers[key] = value; }, send: () => {} } as never, "conv");
    assert.match(headers["Content-Disposition"], /^attachment;/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.match(headers["Content-Security-Policy"], /sandbox/);
  });
});
