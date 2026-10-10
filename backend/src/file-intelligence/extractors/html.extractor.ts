import { Injectable } from "@nestjs/common";
import { createNormalizedDocument } from "../models/normalized-document-content";
import type { NormalizedDocumentContent } from "../models/normalized-document-content";
import type { FileExtractionInput } from "../models/file-intelligence.types";
import { FileIntelligenceSecurityService } from "../security/file-intelligence-security.service";
import type { FileExtractor } from "./file-extractor.interface";

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "div", "dl", "dt", "dd", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"
]);
const NOISE_TAGS = /<(script|style|noscript|template|svg|canvas|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENT_OR_DECLARATION = /<!--[\s\S]*?-->|<![^>]*>/g;

@Injectable()
export class HtmlExtractor implements FileExtractor {
  readonly id = "html";

  constructor(private readonly security: FileIntelligenceSecurityService = new FileIntelligenceSecurityService()) {}

  canHandle(input: FileExtractionInput): boolean {
    const mime = String(input.mimeType ?? "").toLowerCase().trim().split(";")[0];
    const name = this.security.normalizeFileName(input.fileName).toLowerCase();
    return mime === "text/html" || mime === "application/xhtml+xml" || name.endsWith(".html") || name.endsWith(".htm");
  }

  async extract(input: FileExtractionInput): Promise<NormalizedDocumentContent> {
    const fileName = this.security.normalizeFileName(input.fileName);
    const source = this.security.decodeUtf8(input.buffer);
    // This is deliberately a text-only, non-executing transform: it never instantiates a DOM,
    // evaluates JavaScript, resolves URLs, or fetches external resources.
    const text = input.interpretation === "source" ? source : this.toMeaningfulText(source);
    const budget = this.security.applyTextBudget(text);
    const warnings = budget.truncated ? ["HTML text extraction truncated at configured character limit."] : [];
    return createNormalizedDocument({
      sourceAttachmentId: input.attachmentId,
      fileName,
      detectedMime: "text/html",
      category: "document",
      sizeBytes: input.buffer.length,
      encoding: "utf-8",
      text: budget.text,
      truncated: budget.truncated,
      structure: { kind: "html" },
      extractorId: input.interpretation === "source" ? "html-source" : this.id,
      warnings
    });
  }

  private toMeaningfulText(source: string): string {
    const withoutNoise = source.replace(NOISE_TAGS, " ").replace(COMMENT_OR_DECLARATION, " ");
    const withStructure = withoutNoise.replace(/<\/?([a-zA-Z0-9:-]+)\b[^>]*>/g, (_tag, name: string) =>
      BLOCK_TAGS.has(name.toLowerCase()) ? "\n" : " "
    );
    return this.decodeEntities(this.security.normalizeText(withStructure))
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (entity, value: string) => {
      const lower = value.toLowerCase();
      if (lower === "nbsp") return " ";
      if (lower === "amp") return "&";
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "quot") return '"';
      if (lower === "apos") return "'";
      const numeric = lower.startsWith("#x") ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
      return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : entity;
    });
  }
}
