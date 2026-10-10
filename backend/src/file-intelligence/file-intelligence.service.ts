import { Inject, Injectable, Optional } from "@nestjs/common";
import { AttachmentService } from "../attachment/attachment.service";
import { FileDetectorService } from "./file-detector.service";
import { FileExtractorRegistry } from "./extractors/file-extractor.registry";
import { TextExtractor } from "./extractors/text.extractor";
import { FileIntelligenceError, toControlledExtractionError } from "./file-intelligence.errors";
import { FileIntelligenceSecurityService } from "./security/file-intelligence-security.service";
import type { FileExtractionInput } from "./models/file-intelligence.types";
import type { NormalizedDocumentContent } from "./models/normalized-document-content";

@Injectable()
export class FileIntelligenceService {
  constructor(
    @Optional() @Inject(AttachmentService) private readonly attachmentService: AttachmentService | undefined,
    private readonly detector: FileDetectorService,
    private readonly registry: FileExtractorRegistry,
    private readonly security: FileIntelligenceSecurityService
  ) {}

  /**
   * Authorized extraction: loads bytes through AttachmentService ownership checks.
   */
  async extractForUser(userId: string, attachmentId: string): Promise<NormalizedDocumentContent> {
    if (!this.attachmentService) {
      throw new FileIntelligenceError("FILE_EXTRACTION_FAILED");
    }
    const loaded = await this.attachmentService.getAttachmentBuffer(userId, attachmentId);
    return this.extractFromBuffer({
      attachmentId,
      fileName: loaded.fileName,
      mimeType: loaded.mimeType,
      sizeBytes: loaded.buffer.length,
      buffer: loaded.buffer
    });
  }

  /**
   * Internal extraction from an already-authorized attachment buffer.
   * Callers must enforce ownership before invoking this method.
   */
  async extractFromBuffer(input: FileExtractionInput): Promise<NormalizedDocumentContent> {
    this.security.assertExtractionInput(input);

    const detection = this.detector.detect(input);

    if (detection.category === "image") {
      throw new FileIntelligenceError("IMAGE_INTELLIGENCE_NOT_AVAILABLE");
    }

    if (detection.category === "archive" || detection.category === "binary" || detection.category === "unknown") {
      throw new FileIntelligenceError("UNSUPPORTED_FILE_FORMAT");
    }

    const extractionInput: FileExtractionInput = {
      attachmentId: input.attachmentId,
      fileName: detection.fileName,
      mimeType: detection.detectedMime,
      sizeBytes: detection.sizeBytes,
      buffer: input.buffer,
      interpretation: input.interpretation
    };

    try {
      const sourceText = input.interpretation === "source" && ["text", "structured", "spreadsheet"].includes(detection.category);
      const extractor = sourceText ? new TextExtractor(this.security) : this.registry.resolve(extractionInput);
      const result = await extractor.extract(extractionInput);
      this.security.assertNoSecrets(result.text);
      return {
        ...result,
        fileName: detection.fileName,
        detectedMime: detection.detectedMime,
        category: detection.category,
        warnings: [...detection.warnings, ...result.warnings]
      };
    } catch (err) {
      throw toControlledExtractionError(err);
    }
  }
}
