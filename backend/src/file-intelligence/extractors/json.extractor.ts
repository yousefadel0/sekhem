import { Injectable } from "@nestjs/common";
import { FileIntelligenceError } from "../file-intelligence.errors";
import { FILE_INTELLIGENCE_LIMITS } from "../file-intelligence.limits";
import { FileIntelligenceSecurityService } from "../security/file-intelligence-security.service";
import { createNormalizedDocument } from "../models/normalized-document-content";
import type { NormalizedDocumentContent } from "../models/normalized-document-content";
import type { FileExtractionInput, JsonStructure } from "../models/file-intelligence.types";
import type { FileExtractor } from "./file-extractor.interface";

@Injectable()
export class JsonExtractor implements FileExtractor {
  readonly id = "json";

  constructor(private readonly security: FileIntelligenceSecurityService = new FileIntelligenceSecurityService()) {}

  canHandle(input: FileExtractionInput): boolean {
    const mime = (input.mimeType ?? "").toLowerCase().trim();
    const name = this.security.normalizeFileName(input.fileName).toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    return ext === ".json" || mime === "application/json";
  }

  async extract(input: FileExtractionInput): Promise<NormalizedDocumentContent> {
    const fileName = this.security.normalizeFileName(input.fileName);
    const raw = this.security.decodeUtf8(input.buffer);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new FileIntelligenceError("FILE_EXTRACTION_FAILED", "JSON content is malformed.");
    }

    const stats = this.inspect(parsed, 1, { items: 0, maxDepth: 1, keys: [] });
    const pretty = JSON.stringify(parsed, null, 2) ?? "null";
    const budget = this.security.applyTextBudget(pretty);
    const warnings: string[] = [];
    if (budget.truncated) {
      warnings.push("Text extraction truncated at configured character limit.");
    }

    const structure: JsonStructure = {
      kind: "json",
      rootType: this.rootType(parsed),
      keys: stats.keys,
      itemCount: stats.items,
      depth: stats.maxDepth
    };

    return createNormalizedDocument({
      sourceAttachmentId: input.attachmentId,
      fileName,
      detectedMime: "application/json",
      category: "structured",
      sizeBytes: input.buffer.length,
      encoding: "utf-8",
      text: budget.text,
      truncated: budget.truncated,
      structure,
      extractorId: this.id,
      warnings
    });
  }

  private rootType(value: unknown): JsonStructure["rootType"] {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    const t = typeof value;
    if (t === "object") return "object";
    if (t === "string" || t === "number" || t === "boolean") return t;
    return "null";
  }

  private inspect(
    value: unknown,
    depth: number,
    acc: { items: number; maxDepth: number; keys: string[] }
  ): { items: number; maxDepth: number; keys: string[] } {
    if (depth > FILE_INTELLIGENCE_LIMITS.MAX_JSON_DEPTH) {
      throw new FileIntelligenceError("EXTRACTION_LIMIT_EXCEEDED", "JSON exceeds the configured depth limit.");
    }
    acc.maxDepth = Math.max(acc.maxDepth, depth);

    if (value !== null && typeof value === "object") {
      if (Array.isArray(value)) {
        acc.items += value.length;
        if (acc.items > FILE_INTELLIGENCE_LIMITS.MAX_JSON_ITEMS) {
          throw new FileIntelligenceError("EXTRACTION_LIMIT_EXCEEDED", "JSON exceeds the configured item limit.");
        }
        for (const item of value) {
          this.inspect(item, depth + 1, acc);
        }
      } else {
        const keys = Object.keys(value as object);
        if (depth === 1) {
          acc.keys = keys.slice(0, 64);
        }
        acc.items += keys.length;
        if (acc.items > FILE_INTELLIGENCE_LIMITS.MAX_JSON_ITEMS) {
          throw new FileIntelligenceError("EXTRACTION_LIMIT_EXCEEDED", "JSON exceeds the configured item limit.");
        }
        for (const key of keys) {
          this.inspect((value as Record<string, unknown>)[key], depth + 1, acc);
        }
      }
    }

    return acc;
  }
}
