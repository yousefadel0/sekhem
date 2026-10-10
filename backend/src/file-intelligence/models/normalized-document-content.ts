import type { FileCategory } from "./file-intelligence.types";

export interface NormalizedDocumentContent {
  sourceAttachmentId: string;
  fileName: string;
  detectedMime: string;
  category: FileCategory;
  language?: string;
  sizeBytes: number;
  encoding?: string;
  text: string;
  truncated: boolean;
  structure?: unknown;
  pageCount?: number;
  rowCount?: number;
  scanned?: boolean;
  extractorId: string;
  warnings: string[];
  rawMetadata?: Record<string, unknown>;
  extractedAt: string;
}

export function createNormalizedDocument(
  partial: Omit<NormalizedDocumentContent, "extractedAt" | "warnings" | "truncated" | "text"> &
    Partial<Pick<NormalizedDocumentContent, "extractedAt" | "warnings" | "truncated" | "text">>
): NormalizedDocumentContent {
  return {
    text: "",
    truncated: false,
    warnings: [],
    extractedAt: new Date().toISOString(),
    ...partial
  };
}
