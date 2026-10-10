import { Injectable } from "@nestjs/common";
import { FileIntelligenceSecurityService } from "../security/file-intelligence-security.service";
import { createNormalizedDocument } from "../models/normalized-document-content";
import type { NormalizedDocumentContent } from "../models/normalized-document-content";
import type { FileExtractionInput, MarkdownHeading, MarkdownStructure } from "../models/file-intelligence.types";
import type { FileExtractor } from "./file-extractor.interface";

@Injectable()
export class MarkdownExtractor implements FileExtractor {
  readonly id = "markdown";

  constructor(private readonly security: FileIntelligenceSecurityService = new FileIntelligenceSecurityService()) {}

  canHandle(input: FileExtractionInput): boolean {
    const mime = (input.mimeType ?? "").toLowerCase().trim();
    const name = this.security.normalizeFileName(input.fileName).toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    return ext === ".md" || ext === ".markdown" || mime === "text/markdown" || mime === "text/x-markdown";
  }

  async extract(input: FileExtractionInput): Promise<NormalizedDocumentContent> {
    const fileName = this.security.normalizeFileName(input.fileName);
    const decoded = this.security.normalizeText(this.security.decodeUtf8(input.buffer));
    const headings = this.extractHeadings(decoded);
    const budget = this.security.applyTextBudget(decoded);
    const warnings: string[] = [];
    if (budget.truncated) {
      warnings.push("Text extraction truncated at configured character limit.");
    }

    const structure: MarkdownStructure = {
      kind: "markdown",
      headings
    };

    return createNormalizedDocument({
      sourceAttachmentId: input.attachmentId,
      fileName,
      detectedMime: "text/markdown",
      category: "text",
      language: this.security.detectLanguage(budget.text),
      sizeBytes: input.buffer.length,
      encoding: "utf-8",
      text: budget.text,
      truncated: budget.truncated,
      structure,
      extractorId: this.id,
      warnings
    });
  }

  private extractHeadings(text: string): MarkdownHeading[] {
    const headings: MarkdownHeading[] = [];
    for (const line of text.split("\n")) {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (match) {
        headings.push({ level: match[1].length, text: match[2] });
      }
    }
    return headings;
  }
}
