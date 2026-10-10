import { FileIntelligenceError } from "../file-intelligence.errors";
import type { FileExtractionInput } from "../models/file-intelligence.types";
import type { FileExtractor } from "./file-extractor.interface";

export class FileExtractorRegistry {
  constructor(private readonly extractors: FileExtractor[]) {}

  resolve(input: FileExtractionInput): FileExtractor {
    const match = this.extractors.find((extractor) => extractor.canHandle(input));
    if (!match) {
      throw new FileIntelligenceError("UNSUPPORTED_FILE_FORMAT");
    }
    return match;
  }

  supportedExtractorIds(): string[] {
    return this.extractors.map((extractor) => extractor.id);
  }
}
