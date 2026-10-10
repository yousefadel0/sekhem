import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PdfParserService } from "../src/attachment/pdf-parser.service";
import { CsvExtractor } from "../src/file-intelligence/extractors/csv.extractor";
import { FileExtractorRegistry } from "../src/file-intelligence/extractors/file-extractor.registry";
import type { FileExtractor } from "../src/file-intelligence/extractors/file-extractor.interface";
import { JsonExtractor } from "../src/file-intelligence/extractors/json.extractor";
import { MarkdownExtractor } from "../src/file-intelligence/extractors/markdown.extractor";
import { PdfExtractor } from "../src/file-intelligence/extractors/pdf.extractor";
import { TextExtractor } from "../src/file-intelligence/extractors/text.extractor";
import { FileDetectorService } from "../src/file-intelligence/file-detector.service";
import { FileIntelligenceError } from "../src/file-intelligence/file-intelligence.errors";
import { FILE_INTELLIGENCE_LIMITS } from "../src/file-intelligence/file-intelligence.limits";
import { FileIntelligenceService } from "../src/file-intelligence/file-intelligence.service";
import { FileIntelligenceSecurityService } from "../src/file-intelligence/security/file-intelligence-security.service";
import type { FileExtractionInput } from "../src/file-intelligence/models/file-intelligence.types";
import type { NormalizedDocumentContent } from "../src/file-intelligence/models/normalized-document-content";
import type { JsonStructure, MarkdownStructure, CsvStructure } from "../src/file-intelligence/models/file-intelligence.types";

function makeInput(partial: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  attachmentId?: string;
}): FileExtractionInput {
  return {
    attachmentId: partial.attachmentId ?? "att_test",
    fileName: partial.fileName,
    mimeType: partial.mimeType,
    sizeBytes: partial.buffer.length,
    buffer: partial.buffer
  };
}

function textPdf(text: string): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
      `stream\nBT /F1 12 Tf (${text}) Tj ET\nendstream\n` +
      "%%EOF"
  );
}

function scannedPdf(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> >>\nendobj\n" +
      "4 0 obj\n<< /Type /XObject /Subtype /Image /Width 100 /Height 100 >>\nstream\n...raw image bytes...\nendstream\nendobj\n" +
      "%%EOF"
  );
}

function pngBuffer(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
}

describe("File Intelligence", () => {
  let security: FileIntelligenceSecurityService;
  let detector: FileDetectorService;
  let pdf: PdfExtractor;
  let json: JsonExtractor;
  let csv: CsvExtractor;
  let markdown: MarkdownExtractor;
  let text: TextExtractor;
  let registry: FileExtractorRegistry;
  let service: FileIntelligenceService;

  beforeEach(() => {
    security = new FileIntelligenceSecurityService();
    detector = new FileDetectorService(security);
    pdf = new PdfExtractor(new PdfParserService(), security);
    json = new JsonExtractor(security);
    csv = new CsvExtractor(security);
    markdown = new MarkdownExtractor(security);
    text = new TextExtractor(security);
    registry = new FileExtractorRegistry([pdf, json, csv, markdown, text]);
    service = new FileIntelligenceService(undefined, detector, registry, security);
  });

  it("extracts TXT content", async () => {
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Hello SEKHEM\nLine 2") })
    );
    assert.equal(result.extractorId, "text");
    assert.equal(result.category, "text");
    assert.match(result.text, /Hello SEKHEM/);
    assert.equal(result.truncated, false);
  });

  it("preserves UTF-8 Arabic TXT", async () => {
    const arabic = "مرحبا بالعالم — اختبار الملف";
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "arabic.txt", mimeType: "text/plain", buffer: Buffer.from(arabic, "utf8") })
    );
    assert.ok(result.text.includes("مرحبا بالعالم"));
    assert.ok(result.text.includes("اختبار"));
    assert.equal(result.language, "ar");
    assert.equal(result.encoding, "utf-8");
  });

  it("extracts Markdown text and headings", async () => {
    const md = "# Title\n\nIntro\n\n## Section\n\nBody";
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "spec.md", mimeType: "text/markdown", buffer: Buffer.from(md) })
    );
    assert.equal(result.extractorId, "markdown");
    assert.match(result.text, /Intro/);
    const structure = result.structure as MarkdownStructure;
    assert.equal(structure.kind, "markdown");
    assert.equal(structure.headings.length, 2);
    assert.equal(structure.headings[0].level, 1);
    assert.equal(structure.headings[0].text, "Title");
  });

  it("extracts JSON structure", async () => {
    const payload = { name: "sekhem", items: [1, 2, 3] };
    const result = await service.extractFromBuffer(
      makeInput({
        fileName: "data.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(payload))
      })
    );
    assert.equal(result.extractorId, "json");
    assert.equal(result.category, "structured");
    const structure = result.structure as JsonStructure;
    assert.equal(structure.kind, "json");
    assert.equal(structure.rootType, "object");
    assert.ok(structure.keys.includes("name"));
    assert.match(result.text, /sekhem/);
  });

  it("returns a controlled error for malformed JSON", async () => {
    await assert.rejects(
      () =>
        service.extractFromBuffer(
          makeInput({ fileName: "bad.json", mimeType: "application/json", buffer: Buffer.from("{not json") })
        ),
      (err: unknown) => {
        assert.ok(err instanceof FileIntelligenceError);
        assert.equal(err.code, "FILE_EXTRACTION_FAILED");
        assert.equal((err as FileIntelligenceError).message.includes("/etc"), false);
        return true;
      }
    );
  });

  it("extracts CSV headers and rows", async () => {
    const csvText = "name,role\nAda,engineer\nGrace,scientist\n";
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "people.csv", mimeType: "text/csv", buffer: Buffer.from(csvText) })
    );
    assert.equal(result.extractorId, "csv");
    const structure = result.structure as CsvStructure;
    assert.equal(structure.kind, "csv");
    assert.deepEqual(structure.columns, ["name", "role"]);
    assert.equal(structure.rowCount, 2);
    assert.equal(result.rowCount, 2);
    assert.match(result.text, /Ada/);
  });

  it("enforces CSV row and column limits", async () => {
    const columns = Array.from({ length: FILE_INTELLIGENCE_LIMITS.MAX_CSV_COLUMNS + 5 }, (_, i) => `c${i}`);
    const rows = Array.from({ length: FILE_INTELLIGENCE_LIMITS.MAX_CSV_ROWS + 10 }, (_, i) =>
      columns.map((c) => `${c}_${i}`).join(",")
    );
    const csvText = `${columns.join(",")}\n${rows.join("\n")}`;
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "wide.csv", mimeType: "text/csv", buffer: Buffer.from(csvText) })
    );
    const structure = result.structure as CsvStructure;
    assert.equal(structure.columnCount, FILE_INTELLIGENCE_LIMITS.MAX_CSV_COLUMNS);
    assert.equal(structure.rowCount, FILE_INTELLIGENCE_LIMITS.MAX_CSV_ROWS);
    assert.equal(result.truncated, true);
    assert.ok(result.warnings.some((w) => /row/i.test(w)));
    assert.ok(result.warnings.some((w) => /column/i.test(w)));
  });

  it("adapts the existing PDF parser", async () => {
    const result = await service.extractFromBuffer(
      makeInput({
        fileName: "spec.pdf",
        mimeType: "application/pdf",
        buffer: textPdf("Hello SEKHEM Architectural Specifications")
      })
    );
    assert.equal(result.extractorId, "pdf");
    assert.equal(result.category, "document");
    assert.ok(result.text.includes("Hello SEKHEM Architectural Specifications"));
    assert.equal(result.scanned, false);
    assert.ok((result.pageCount ?? 0) >= 1);
  });

  it("preserves scanned PDF detection without fake OCR text", async () => {
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "scan.pdf", mimeType: "application/pdf", buffer: scannedPdf() })
    );
    assert.equal(result.scanned, true);
    assert.equal(result.text, "");
    assert.ok(result.warnings.some((w) => /OCR is not available/i.test(w)));
  });

  it("rejects unsupported binary instead of decoding as text", async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x10]);
    await assert.rejects(
      () =>
        service.extractFromBuffer(
          makeInput({ fileName: "blob.bin", mimeType: "application/octet-stream", buffer: binary })
        ),
      (err: unknown) => {
        assert.ok(err instanceof FileIntelligenceError);
        assert.equal(err.code, "UNSUPPORTED_FILE_FORMAT");
        return true;
      }
    );
  });

  it("classifies images as unsupported intelligence", async () => {
    await assert.rejects(
      () =>
        service.extractFromBuffer(makeInput({ fileName: "photo.png", mimeType: "image/png", buffer: pngBuffer() })),
      (err: unknown) => {
        assert.ok(err instanceof FileIntelligenceError);
        assert.equal(err.code, "IMAGE_INTELLIGENCE_NOT_AVAILABLE");
        return true;
      }
    );
  });

  it("truncates extracted text at the configured budget", async () => {
    const oversized = "A".repeat(FILE_INTELLIGENCE_LIMITS.MAX_EXTRACTED_TEXT_CHARS + 200);
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "long.txt", mimeType: "text/plain", buffer: Buffer.from(oversized) })
    );
    assert.equal(result.truncated, true);
    assert.equal(result.text.length, FILE_INTELLIGENCE_LIMITS.MAX_EXTRACTED_TEXT_CHARS);
    assert.ok(result.warnings.some((w) => /truncated/i.test(w)));
  });

  it("resolves extractors by specificity", () => {
    const mdInput = makeInput({
      fileName: "readme.md",
      mimeType: "text/plain",
      buffer: Buffer.from("# Hello")
    });
    assert.equal(registry.resolve(mdInput).id, "markdown");
    assert.equal(registry.resolve(makeInput({ fileName: "a.json", mimeType: "application/json", buffer: Buffer.from("{}") })).id, "json");
    assert.equal(registry.resolve(makeInput({ fileName: "a.csv", mimeType: "text/csv", buffer: Buffer.from("a,b") })).id, "csv");
    assert.equal(registry.resolve(makeInput({ fileName: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") })).id, "text");
  });

  it("rejects MIME and extension mismatches", async () => {
    await assert.rejects(
      () =>
        service.extractFromBuffer(
          makeInput({ fileName: "notes.txt", mimeType: "image/png", buffer: pngBuffer() })
        ),
      (err: unknown) => {
        assert.ok(err instanceof FileIntelligenceError);
        assert.equal(err.code, "FILE_DETECTION_FAILED");
        return true;
      }
    );
  });

  it("rejects files above the File Intelligence size limit", async () => {
    const huge = Buffer.alloc(FILE_INTELLIGENCE_LIMITS.MAX_FILE_BYTES + 1, 0x61);
    await assert.rejects(
      () => service.extractFromBuffer(makeInput({ fileName: "huge.txt", mimeType: "text/plain", buffer: huge })),
      (err: unknown) => {
        assert.ok(err instanceof FileIntelligenceError);
        assert.equal(err.code, "FILE_TOO_LARGE");
        return true;
      }
    );
  });

  it("selects extractors deterministically", () => {
    const input = makeInput({ fileName: "doc.md", mimeType: "text/markdown", buffer: Buffer.from("# A") });
    const first = registry.resolve(input).id;
    const second = registry.resolve(input).id;
    assert.equal(first, "markdown");
    assert.equal(second, first);
    assert.deepEqual(registry.supportedExtractorIds(), ["pdf", "json", "csv", "markdown", "text"]);
  });

  it("normalizes path-like filenames without filesystem access", async () => {
    const unix = await service.extractFromBuffer(
      makeInput({
        fileName: "../../etc/passwd",
        mimeType: "text/plain",
        buffer: Buffer.from("safe-buffer-content")
      })
    );
    assert.equal(unix.fileName, "passwd");
    assert.equal(unix.text.includes("safe-buffer-content"), true);
    assert.equal(unix.text.includes("root:"), false);
    assert.equal(unix.text.includes("/etc"), false);

    const windows = await service.extractFromBuffer(
      makeInput({
        fileName: "..\\..\\Windows\\System32",
        mimeType: "text/plain",
        buffer: Buffer.from("windows-buffer-content")
      })
    );
    assert.equal(windows.fileName, "System32");
    assert.equal(windows.text.includes("windows-buffer-content"), true);
    assert.equal(windows.text.includes("Windows"), false);
  });

  it("does not follow path-like names into the filesystem", () => {
    const name = security.normalizeFileName("../../etc/passwd");
    assert.equal(name.includes("/"), false);
    assert.equal(name.includes(".."), false);
    assert.equal(name, "passwd");
  });

  it("converts extractor failures into controlled errors", async () => {
    const exploding: FileExtractor = {
      id: "boom",
      canHandle: () => true,
      extract: async () => {
        throw new Error("ENOENT /var/secrets/token stack at /app/node_modules");
      }
    };
    const localRegistry = new FileExtractorRegistry([exploding]);
    const localService = new FileIntelligenceService(undefined, detector, localRegistry, security);
    await assert.rejects(
      () =>
        localService.extractFromBuffer(
          makeInput({ fileName: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") })
        ),
      (err: unknown) => {
        assert.ok(err instanceof FileIntelligenceError);
        assert.equal(err.code, "FILE_EXTRACTION_FAILED");
        assert.equal(String((err as Error).message).includes("/var/secrets"), false);
        assert.equal(String((err as Error).message).includes("stack"), false);
        return true;
      }
    );
  });

  it("returns a serializable normalized document schema", async () => {
    const result = await service.extractFromBuffer(
      makeInput({ fileName: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("schema check") })
    );
    const roundTrip = JSON.parse(JSON.stringify(result)) as NormalizedDocumentContent;
    assert.equal(typeof roundTrip.sourceAttachmentId, "string");
    assert.equal(typeof roundTrip.fileName, "string");
    assert.equal(typeof roundTrip.detectedMime, "string");
    assert.equal(typeof roundTrip.category, "string");
    assert.equal(typeof roundTrip.sizeBytes, "number");
    assert.equal(typeof roundTrip.text, "string");
    assert.equal(typeof roundTrip.truncated, "boolean");
    assert.equal(typeof roundTrip.extractorId, "string");
    assert.ok(Array.isArray(roundTrip.warnings));
    assert.equal(typeof roundTrip.extractedAt, "string");
    assert.ok(!("buffer" in roundTrip));
    assert.ok(!JSON.stringify(roundTrip).includes("data:"));
  });

  it("rejects JSON that exceeds depth limits", async () => {
    let nested: unknown = { v: 1 };
    for (let i = 0; i < FILE_INTELLIGENCE_LIMITS.MAX_JSON_DEPTH + 2; i++) {
      nested = { child: nested };
    }
    await assert.rejects(
      () =>
        service.extractFromBuffer(
          makeInput({
            fileName: "deep.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(nested))
          })
        ),
      (err: unknown) => {
        assert.ok(err instanceof FileIntelligenceError);
        assert.equal(err.code, "EXTRACTION_LIMIT_EXCEEDED");
        return true;
      }
    );
  });

  it("does not treat unknown binary as UTF-8 text", async () => {
    assert.throws(() => detector.detect(makeInput({
      fileName: "blob.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0x00, 0x7f, 0xff, 0x10])
    })), (error: unknown) => error instanceof FileIntelligenceError && error.code === "UNSUPPORTED_FILE_FORMAT");
  });

  it("extractor sources never open files, spawn processes, or use the network", () => {
    const dir = path.resolve(__dirname, "../src/file-intelligence");
    const files = [
      "extractors/text.extractor.ts",
      "extractors/markdown.extractor.ts",
      "extractors/json.extractor.ts",
      "extractors/csv.extractor.ts",
      "extractors/pdf.extractor.ts",
      "extractors/file-extractor.registry.ts",
      "file-intelligence.service.ts"
    ];
    const forbidden = /from ["']node:(fs|child_process|net|http|https|dgram)["']|require\(["'](fs|child_process|net)["']\)/;
    for (const relative of files) {
      const source = readFileSync(path.join(dir, relative), "utf8");
      assert.equal(forbidden.test(source), false, relative);
    }
  });
});
