import { BadRequestException } from "@nestjs/common";

export type FileIntelligenceErrorCode =
  | "FILE_ACCESS_DENIED"
  | "UNSUPPORTED_FILE_FORMAT"
  | "FILE_DETECTION_FAILED"
  | "FILE_EXTRACTION_FAILED"
  | "FILE_TOO_LARGE"
  | "EXTRACTION_LIMIT_EXCEEDED"
  | "IMAGE_INTELLIGENCE_NOT_AVAILABLE"
  | "SCANNED_DOCUMENT_OCR_REQUIRED";

const SAFE_MESSAGES: Record<FileIntelligenceErrorCode, string> = {
  FILE_ACCESS_DENIED: "Sensitive file content is not permitted.",
  UNSUPPORTED_FILE_FORMAT: "This file format is not supported for intelligence extraction.",
  FILE_DETECTION_FAILED: "The file could not be detected or failed consistency checks.",
  FILE_EXTRACTION_FAILED: "File extraction failed.",
  FILE_TOO_LARGE: "The file exceeds the File Intelligence processing size limit.",
  EXTRACTION_LIMIT_EXCEEDED: "Extraction exceeded a configured safety limit.",
  IMAGE_INTELLIGENCE_NOT_AVAILABLE:
    "Image intelligence is not available in the current File Intelligence pipeline.",
  SCANNED_DOCUMENT_OCR_REQUIRED:
    "OCR is not available in the current File Intelligence pipeline."
};

export class FileIntelligenceError extends BadRequestException {
  readonly code: FileIntelligenceErrorCode;

  constructor(code: FileIntelligenceErrorCode, message?: string) {
    const safeMessage = message && !containsUnsafeDetail(message) ? message : SAFE_MESSAGES[code];
    super({ code, message: safeMessage });
    this.code = code;
  }
}

function containsUnsafeDetail(message: string): boolean {
  return /[\\/]|\.\.|stack|node_modules|passwd|System32/i.test(message);
}

export function toControlledExtractionError(err: unknown): FileIntelligenceError {
  if (err instanceof FileIntelligenceError) {
    return err;
  }
  return new FileIntelligenceError("FILE_EXTRACTION_FAILED");
}
