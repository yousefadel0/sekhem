import { Injectable } from "@nestjs/common";
import { FileIntelligenceSecurityService } from "../security/file-intelligence-security.service";
import { createNormalizedDocument } from "../models/normalized-document-content";
import type { NormalizedDocumentContent } from "../models/normalized-document-content";
import type { FileExtractionInput } from "../models/file-intelligence.types";
import type { FileExtractor } from "./file-extractor.interface";

const TEXT_MIME = new Set(["text/plain", "text/x-log", "application/octet-stream"]);
const TEXT_EXT = new Set([".txt", ".log"]);

@Injectable()
export class TextExtractor implements FileExtractor {
  readonly id = "text";

  constructor(private readonly security: FileIntelligenceSecurityService = new FileIntelligenceSecurityService()) {}

  canHandle(input: FileExtractionInput): boolean {
    const mime = (input.mimeType ?? "").toLowerCase().trim();
    const name = this.security.normalizeFileName(input.fileName).toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    if (TEXT_EXT.has(ext)) return true;
    if (mime === "text/plain") return true;
    if (TEXT_MIME.has(mime) && ext === ".txt") return true;
    return false;
  }

  async extract(input: FileExtractionInput): Promise<NormalizedDocumentContent> {
    const fileName = this.security.normalizeFileName(input.fileName);
    const source = this.security.decodeUtf8(input.buffer);
    const decoded = input.interpretation === "source" ? source : this.security.normalizeText(source);
    const budget = this.security.applyTextBudget(decoded);
    const warnings: string[] = [];
    if (budget.truncated) {
      warnings.push("Text extraction truncated at configured character limit.");
    }

    return createNormalizedDocument({
      sourceAttachmentId: input.attachmentId,
      fileName,
      detectedMime: "text/plain",
      category: "text",
      language: this.security.detectLanguage(budget.text),
      sizeBytes: input.buffer.length,
      encoding: "utf-8",
      text: budget.text,
      truncated: budget.truncated,
      extractorId: this.id,
      warnings
    });
  }
}
