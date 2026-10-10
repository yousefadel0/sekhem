export type FileCategory =
  | "text"
  | "document"
  | "structured"
  | "spreadsheet"
  | "image"
  | "archive"
  | "binary"
  | "unknown";

export interface FileExtractionInput {
  /** Source reads preserve markup; document extraction remains an explicit alternative. */
  interpretation?: "source" | "document";
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export interface FileDetectionResult {
  fileName: string;
  declaredMime: string;
  detectedMime: string;
  extension: string;
  category: FileCategory;
  encoding?: string;
  sizeBytes: number;
  warnings: string[];
}

export interface MarkdownHeading {
  level: number;
  text: string;
}

export interface MarkdownStructure {
  kind: "markdown";
  headings: MarkdownHeading[];
}

export interface JsonStructure {
  kind: "json";
  rootType: "object" | "array" | "string" | "number" | "boolean" | "null";
  keys: string[];
  itemCount: number;
  depth: number;
}

export interface CsvStructure {
  kind: "csv";
  columns: string[];
  rowCount: number;
  columnCount: number;
}
