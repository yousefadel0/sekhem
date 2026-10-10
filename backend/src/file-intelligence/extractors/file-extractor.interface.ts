import type { FileExtractionInput } from "../models/file-intelligence.types";
import type { NormalizedDocumentContent } from "../models/normalized-document-content";

export interface FileExtractor {
  readonly id: string;
  canHandle(input: FileExtractionInput): boolean;
  extract(input: FileExtractionInput): Promise<NormalizedDocumentContent>;
}
