import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { AttachmentService, MAX_ATTACHMENT_SIZE_BYTES } from "../src/attachment/attachment.service";
import { PdfParserService } from "../src/attachment/pdf-parser.service";
import { LocalAttachmentStorageService } from "../src/attachment/storage/local-attachment-storage.service";
import * as zlib from "node:zlib";

describe("AttachmentService & PDF Parser", () => {
  let pdfParser: PdfParserService;
  let attachmentService: AttachmentService;

  beforeEach(() => {
    pdfParser = new PdfParserService();
    attachmentService = new AttachmentService();
  });

  describe("Magic Bytes Validation", () => {
    it("validates PNG magic bytes correctly", () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      assert.equal(attachmentService.validateMagicBytes(pngBuffer, "image/png"), true);
      assert.equal(attachmentService.validateMagicBytes(pngBuffer, "image/jpeg"), false);
    });

    it("validates JPEG magic bytes correctly", () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
      assert.equal(attachmentService.validateMagicBytes(jpegBuffer, "image/jpeg"), true);
      assert.equal(attachmentService.validateMagicBytes(jpegBuffer, "image/jpg"), true);
      assert.equal(attachmentService.validateMagicBytes(jpegBuffer, "image/png"), false);
    });

    it("validates GIF magic bytes correctly", () => {
      const gifBuffer = Buffer.from("GIF89a...");
      assert.equal(attachmentService.validateMagicBytes(gifBuffer, "image/gif"), true);
    });

    it("validates PDF magic bytes correctly", () => {
      const pdfBuffer = Buffer.from("%PDF-1.4\n...");
      assert.equal(attachmentService.validateMagicBytes(pdfBuffer, "application/pdf"), true);
      assert.equal(attachmentService.validateMagicBytes(pdfBuffer, "image/png"), false);
    });

    it("rejects invalid magic bytes / spoofed MIME type", () => {
      const fakePng = Buffer.from("This is plain text pretending to be PNG");
      assert.equal(attachmentService.validateMagicBytes(fakePng, "image/png"), false);
    });
  });

  describe("PDF Parser & Bounded Safety", () => {
    it("detects scanned/image-only PDF with no text layer", () => {
      // PDF containing an image XObject but zero text show commands (BT / ET / Tj)
      const scannedPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> >>\nendobj\n" +
        "4 0 obj\n<< /Type /XObject /Subtype /Image /Width 100 /Height 100 >>\nstream\n...raw image bytes...\nendstream\nendobj\n" +
        "%%EOF"
      );

      const result = pdfParser.parse(scannedPdf);
      assert.equal(result.isScanned, true);
      assert.equal(result.hasText, false);
      assert.equal(result.pageCount, 1);
    });

    it("extracts text from uncompressed PDF streams", () => {
      const textPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
        "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
        "stream\nBT /F1 12 Tf (Hello SEKHEM Architectural Specifications) Tj ET\nendstream\n" +
        "%%EOF"
      );

      const result = pdfParser.parse(textPdf);
      assert.equal(result.isScanned, false);
      assert.equal(result.hasText, true);
      assert.ok(result.extractedText?.includes("Hello SEKHEM Architectural Specifications"));
    });

    it("extracts text from FlateDecode compressed PDF streams", () => {
      const rawStream = "BT /F1 14 Tf (Project Requirements for High-Concurrency Multi-Tenant Platform) Tj ET";
      const deflated = zlib.deflateSync(Buffer.from(rawStream));

      const pdfHeader = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n");
      const pdfFooter = Buffer.from("\nendstream\nendobj\n%%EOF");
      const compressedPdf = Buffer.concat([pdfHeader, deflated, pdfFooter]);

      const result = pdfParser.parse(compressedPdf);
      assert.equal(result.isScanned, false);
      assert.equal(result.hasText, true);
      assert.ok(result.extractedText?.includes("Project Requirements for High-Concurrency Multi-Tenant Platform"));
    });

    it("enforces deterministic 12,000 character maximum context budget", () => {
      const longSentence = "A".repeat(15_000);
      const stream = `BT /F1 12 Tf (${longSentence}) Tj ET`;
      const pdf = Buffer.from(`%PDF-1.4\nstream\n${stream}\nendstream\n%%EOF`);

      const result = pdfParser.parse(pdf);
      assert.ok(result.extractedText);
      assert.ok(result.extractedText.length <= 12_000 + 100);
      assert.ok(result.extractedText.includes("[Document truncated: context exceeded 12,000 character budget]"));
    });
    it("rejects PDF exceeding 20-page limit with explicit BadRequestException", async () => {
      // Synthesise a minimal PDF with /Count 21 so the page detector returns 21
      const over20PagesPdf = Buffer.from(
        "%PDF-1.4\n" +
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 21 >>\nendobj\n" +
        // One real page object (we only need the count detected correctly)
        "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
        "%%EOF"
      );

      // No Prisma needed — validation fires before any DB call
      const serviceNoPrisma = new AttachmentService();

      await assert.rejects(
        async () => {
          await serviceNoPrisma.uploadAttachment("user_1", "conv_1", {
            fileName: "long-document.pdf",
            mimeType: "application/pdf",
            buffer: over20PagesPdf
          });
        },
        /PDF exceeds the maximum supported page count of 20 pages/
      );
    });
  });

  describe("Attachment Validation & User Isolation", () => {
    it("rejects files exceeding MAX_ATTACHMENT_SIZE_BYTES", async () => {
      const oversizedBuffer = Buffer.alloc(MAX_ATTACHMENT_SIZE_BYTES + 1);
      oversizedBuffer[0] = 0x89;
      oversizedBuffer[1] = 0x50;
      oversizedBuffer[2] = 0x4e;
      oversizedBuffer[3] = 0x47;

      await assert.rejects(
        async () => {
          await attachmentService.uploadAttachment("user_1", "conv_1", {
            fileName: "large.png",
            mimeType: "image/png",
            buffer: oversizedBuffer
          });
        },
        /exceeds the 10 MB maximum size limit/
      );
    });

    it("rejects unpermitted file extensions", async () => {
      const buffer = Buffer.from("MZ exe payload");
      await assert.rejects(
        async () => {
          await attachmentService.uploadAttachment("user_1", "conv_1", {
            fileName: "malware.exe",
            mimeType: "application/octet-stream",
            buffer
          });
        },
        /file format is not supported/
      );
    });

    it("rejects unpermitted MIME types", async () => {
      const buffer = Buffer.from("raw data");
      await assert.rejects(
        async () => {
          await attachmentService.uploadAttachment("user_1", "conv_1", {
            fileName: "data.bin",
            mimeType: "application/x-executable",
            buffer
          });
        },
        /file format is not supported/
      );
    });

    it("enforces user isolation: User B cannot retrieve User A's attachment", async () => {
      // Create mock Prisma with 1 attachment belonging to user_A
      const mockPrisma = {
        conversationAttachment: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            if (where.id === "att_secret_123") {
              return {
                id: "att_secret_123",
                conversationId: "conv_A",
                userId: "user_A",
                fileName: "confidential.pdf",
                mimeType: "application/pdf",
                fileSize: 1024,
                category: "pdf",
                storageKey: "att_opaque_key_1",
                extractedText: "Confidential data",
                hasExtractedText: true,
                isScanned: false,
                createdAt: new Date()
              };
            }
            return null;
          }
        }
      };

      const isolatedService = new AttachmentService(mockPrisma as any);

      // User A can access
      const userAResult = await isolatedService.getAttachment("user_A", "att_secret_123");
      assert.equal(userAResult.id, "att_secret_123");
      assert.equal(userAResult.fileName, "confidential.pdf");

      // User B cannot access: NotFoundException (ID guessing prevented)
      await assert.rejects(
        async () => {
          await isolatedService.getAttachment("user_B", "att_secret_123");
        },
        /Attachment not found/
      );
    });

    it("enforces conversation ownership during upload", async () => {
      const mockPrisma = {
        conversation: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            if (where.id === "conv_userA") {
              return { id: "conv_userA", userId: "user_A" };
            }
            return null;
          }
        }
      };

      const isolatedService = new AttachmentService(mockPrisma as any);
      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

      // User B attempts to attach to User A's conversation
      await assert.rejects(
        async () => {
          await isolatedService.uploadAttachment("user_B", "conv_userA", {
            fileName: "photo.png",
            mimeType: "image/png",
            buffer: validPng
          });
        },
        /Cannot attach files to a conversation belonging to another user/
      );
    });
  });
});
