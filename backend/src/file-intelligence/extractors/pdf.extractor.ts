import { Injectable } from "@nestjs/common";
import { PdfParserService } from "../../attachment/pdf-parser.service";
import { FileIntelligenceError } from "../file-intelligence.errors";
import { FILE_INTELLIGENCE_LIMITS } from "../file-intelligence.limits";
import { FileIntelligenceSecurityService } from "../security/file-intelligence-security.service";
import { createNormalizedDocument } from "../models/normalized-document-content";
import type { NormalizedDocumentContent } from "../models/normalized-document-content";
import type { FileExtractionInput } from "../models/file-intelligence.types";
import type { FileExtractor } from "./file-extractor.interface";

const OCR_WARNING = "OCR is not available in the current File Intelligence pipeline.";

@Injectable()
export class PdfExtractor implements FileExtractor {
  readonly id = "pdf";

  constructor(
    private readonly pdfParser: PdfParserService = new PdfParserService(),
    private readonly security: FileIntelligenceSecurityService = new FileIntelligenceSecurityService()
  ) { }

  canHandle(input: FileExtractionInput): boolean {
    const mime = (input.mimeType ?? "").toLowerCase().trim();
    const name = this.security.normalizeFileName(input.fileName).toLowerCase();
    return mime === "application/pdf" || name.endsWith(".pdf");
  }

  async extract(input: FileExtractionInput): Promise<NormalizedDocumentContent> {
    const fileName = this.security.normalizeFileName(input.fileName);
    const parsed = this.pdfParser.parse(input.buffer);

    if (parsed.pageCount > FILE_INTELLIGENCE_LIMITS.MAX_PDF_PAGES) {
      throw new FileIntelligenceError(
        "EXTRACTION_LIMIT_EXCEEDED",
        "PDF exceeds the maximum supported page count."
      );
    }

    const warnings: string[] = [];
    let text = parsed.extractedText ?? "";
    let truncated = parsed.isTruncated;

    if (parsed.isScanned) {
      text = "";
      warnings.push(OCR_WARNING);
    }

    if (truncated) {
      warnings.push("Text extraction truncated at configured character limit.");
    }

    const budget = this.security.applyTextBudget(text);
    if (budget.truncated) {
      truncated = true;
      if (!warnings.includes("Text extraction truncated at configured character limit.")) {
        warnings.push("Text extraction truncated at configured character limit.");
      }
    }

    return createNormalizedDocument({
      sourceAttachmentId: input.attachmentId,
      fileName,
      detectedMime: "application/pdf",
      category: "document",
      sizeBytes: input.buffer.length,
      encoding: "utf-8",
      text: budget.text,
      truncated,
      pageCount: parsed.pageCount,
      scanned: parsed.isScanned,
      extractorId: this.id,
      warnings,
      rawMetadata: {
        hasText: parsed.hasText
      }
    });
  }
}
