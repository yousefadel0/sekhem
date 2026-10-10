import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { AttachmentCapabilityService } from "../src/agent-runtime/capabilities/attachment-capability.service";
import { CsvExtractor } from "../src/file-intelligence/extractors/csv.extractor";
import { FileExtractorRegistry } from "../src/file-intelligence/extractors/file-extractor.registry";
import { HtmlExtractor } from "../src/file-intelligence/extractors/html.extractor";
import { JsonExtractor } from "../src/file-intelligence/extractors/json.extractor";
import { MarkdownExtractor } from "../src/file-intelligence/extractors/markdown.extractor";
import { PdfExtractor } from "../src/file-intelligence/extractors/pdf.extractor";
import { TextExtractor } from "../src/file-intelligence/extractors/text.extractor";
import { FileDetectorService } from "../src/file-intelligence/file-detector.service";
import { FileIntelligenceService } from "../src/file-intelligence/file-intelligence.service";
import { FileIntelligenceSecurityService } from "../src/file-intelligence/security/file-intelligence-security.service";
import { PdfParserService } from "../src/attachment/pdf-parser.service";

function fileIntelligence(): FileIntelligenceService {
  const security = new FileIntelligenceSecurityService();
  return new FileIntelligenceService(undefined, new FileDetectorService(security), new FileExtractorRegistry([
    new PdfExtractor(new PdfParserService(), security),
    new JsonExtractor(security),
    new CsvExtractor(security),
    new HtmlExtractor(security),
    new MarkdownExtractor(security),
    new TextExtractor(security)
  ]), security);
}

function reader(files: Record<string, { conversationId: string; fileName: string; mimeType: string; body: string }>) {
  const attachmentService = {
    async getAttachmentBufferForConversation(userId: string, conversationId: string, attachmentId: string) {
      const file = files[attachmentId];
      if (!file) throw new Error("missing");
      if (userId !== "user-1" || file.conversationId !== conversationId) throw new ForbiddenException("Attachment access denied");
      const buffer = Buffer.from(file.body, "utf8");
      return { buffer, fileName: file.fileName, mimeType: file.mimeType, fileSize: buffer.length };
    }
  };
  return new AttachmentCapabilityService(attachmentService as never, fileIntelligence());
}

describe("Attachment-backed Agent File Reader", () => {
  it("extracts each deterministic text format through File Intelligence", async () => {
    const capability = reader({
      txt: { conversationId: "conv-1", fileName: "notes.txt", mimeType: "text/plain", body: "Release is Tuesday" },
      markdown: { conversationId: "conv-1", fileName: "notes.md", mimeType: "text/markdown", body: "# Plan\nShip safely" },
      json: { conversationId: "conv-1", fileName: "config.json", mimeType: "application/json", body: '{"auth":true}' },
      csv: { conversationId: "conv-1", fileName: "users.csv", mimeType: "text/csv", body: "name,role\nAda,admin" },
      html: { conversationId: "conv-1", fileName: "page.html", mimeType: "text/html", body: "<h1>Architecture</h1><script>evil()</script><p>Gateway handles auth.</p>" }
    });
    for (const attachmentId of ["txt", "markdown", "json", "csv", "html"]) {
      const result = await capability.read({ userId: "user-1", conversationId: "conv-1", attachmentId, agentRunId: "run-1" });
      assert.equal(result.sourceType, "CONVERSATION_ATTACHMENT");
      assert.equal(result.provenance.attachmentId, attachmentId);
      assert.equal(result.audit.capability, "attachment.read");
      assert.equal(result.audit.agentRunId, "run-1");
      assert.ok(result.normalizedContent.text.length > 0);
    }
    const html = await capability.read({ userId: "user-1", conversationId: "conv-1", attachmentId: "html" });
    assert.match(html.normalizedContent.text, /Architecture/);
    assert.match(html.normalizedContent.text, /Gateway handles auth/);
    assert.match(html.normalizedContent.text, /<script>evil\(\)<\/script>/); // source text, never executed
    assert.equal(html.metadata.extractorId, "html-source");
  });

  it("denies a cross-conversation attachment before extraction", async () => {
    const capability = reader({
      private: { conversationId: "conv-private", fileName: "secret.txt", mimeType: "text/plain", body: "do not leak" }
    });
    await assert.rejects(
      () => capability.read({ userId: "user-1", conversationId: "conv-1", attachmentId: "private" }),
      (error: unknown) => error instanceof ForbiddenException
    );
  });

  it("never accepts a filesystem path in place of an attachment id", async () => {
    const capability = reader({});
    await assert.rejects(() => capability.read({ userId: "user-1", conversationId: "conv-1", attachmentId: "C:\\Windows\\System32" }));
  });
});
