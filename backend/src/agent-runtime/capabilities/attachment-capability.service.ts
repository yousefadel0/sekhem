import { Injectable } from "@nestjs/common";
import { AttachmentService } from "../../attachment/attachment.service";
import { FileIntelligenceService } from "../../file-intelligence/file-intelligence.service";
import { FileIntelligenceError } from "../../file-intelligence/file-intelligence.errors";
import {
  ATTACHMENT_SOURCE_TYPE,
  type AttachmentReadAudit,
  type AttachmentReadRequest,
  type AttachmentReadResult
} from "./attachment-source.types";

/**
 * Read-only attachment source for Agent File Reader. Storage is deliberately
 * reachable only through AttachmentService's conversation-scoped authorization.
 */
@Injectable()
export class AttachmentCapabilityService {
  constructor(
    private readonly attachments: AttachmentService,
    private readonly fileIntelligence: FileIntelligenceService
  ) {}

  async read(request: AttachmentReadRequest): Promise<AttachmentReadResult> {
    const started = Date.now();
    let fileName: string | undefined;
    try {
      const loaded = await this.attachments.getAttachmentBufferForConversation(
        request.userId,
        request.conversationId,
        request.attachmentId
      );
      fileName = loaded.fileName;
      const normalizedContent = await this.fileIntelligence.extractFromBuffer({
        attachmentId: request.attachmentId,
        fileName: loaded.fileName,
        mimeType: loaded.mimeType,
        interpretation: "source",
        sizeBytes: loaded.fileSize,
        buffer: loaded.buffer
      });
      return {
        sourceType: ATTACHMENT_SOURCE_TYPE,
        conversationId: request.conversationId,
        attachmentId: request.attachmentId,
        fileName: loaded.fileName,
        mimeType: loaded.mimeType,
        size: loaded.fileSize,
        status: normalizedContent.scanned ? "PDF_TEXT_EXTRACTION_UNAVAILABLE" : "OK",
        normalizedContent,
        metadata: {
          extractorId: normalizedContent.extractorId,
          category: normalizedContent.category,
          pageCount: normalizedContent.pageCount,
          scanned: normalizedContent.scanned
        },
        warnings: normalizedContent.warnings,
        truncated: normalizedContent.truncated,
        provenance: {
          sourceType: ATTACHMENT_SOURCE_TYPE,
          conversationId: request.conversationId,
          attachmentId: request.attachmentId
        },
        audit: this.audit(request, started, true, "ok", normalizedContent.truncated, fileName)
      };
    } catch (error) {
      // This audit object is returned only on success; failures are intentionally
      // represented by the controlled domain exception without storage details.
      void this.audit(
        request,
        started,
        false,
        this.isAccessFailure(error) ? "denied" : "error",
        false,
        fileName,
        this.errorCode(error)
      );
      throw error;
    }
  }

  private audit(
    request: AttachmentReadRequest,
    started: number,
    allowed: boolean,
    status: AttachmentReadAudit["status"],
    truncated: boolean,
    fileName?: string,
    deniedReason?: string
  ): AttachmentReadAudit {
    return {
      capability: "attachment.read",
      agentRunId: request.agentRunId,
      userId: request.userId,
      conversationId: request.conversationId,
      attachmentId: request.attachmentId,
      fileName,
      allowed,
      status,
      deniedReason,
      truncated,
      durationMs: Date.now() - started
    };
  }

  private isAccessFailure(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "getStatus" in error &&
      typeof (error as { getStatus?: unknown }).getStatus === "function" &&
      (error as { getStatus(): number }).getStatus() === 403);
  }

  private errorCode(error: unknown): string | undefined {
    if (error instanceof FileIntelligenceError) return error.code;
    if (error && typeof error === "object" && "getStatus" in error && typeof (error as { getStatus?: unknown }).getStatus === "function") {
      const status = (error as { getStatus(): number }).getStatus();
      if (status === 404) return "ATTACHMENT_NOT_FOUND";
      if (status === 403) return "ATTACHMENT_ACCESS_DENIED";
      if (status === 400) return "ATTACHMENT_READ_FAILED";
    }
    return "FILE_EXTRACTION_FAILED";
  }
}
