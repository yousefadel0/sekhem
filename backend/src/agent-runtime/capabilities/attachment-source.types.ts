import type { NormalizedDocumentContent } from "../../file-intelligence/models/normalized-document-content";

export const ATTACHMENT_SOURCE_TYPE = "CONVERSATION_ATTACHMENT" as const;

export interface AttachmentFileSource {
  sourceType: typeof ATTACHMENT_SOURCE_TYPE;
  conversationId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface AttachmentReadRequest {
  userId: string;
  conversationId: string;
  attachmentId: string;
  agentRunId?: string;
}

export interface AttachmentReadAudit {
  capability: "attachment.read";
  agentRunId?: string;
  userId: string;
  conversationId: string;
  attachmentId: string;
  fileName?: string;
  allowed: boolean;
  status: "ok" | "denied" | "error";
  deniedReason?: string;
  truncated: boolean;
  durationMs: number;
}

export interface AttachmentReadResult extends AttachmentFileSource {
  /** A scanned PDF is a successful authorized read with no usable text, not a generic request failure. */
  status: "OK" | "PDF_TEXT_EXTRACTION_UNAVAILABLE";
  normalizedContent: NormalizedDocumentContent;
  metadata: {
    extractorId: string;
    category: string;
    pageCount?: number;
    scanned?: boolean;
  };
  warnings: string[];
  truncated: boolean;
  provenance: {
    sourceType: typeof ATTACHMENT_SOURCE_TYPE;
    conversationId: string;
    attachmentId: string;
  };
  audit: AttachmentReadAudit;
}
