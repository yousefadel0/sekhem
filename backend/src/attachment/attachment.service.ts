import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { PrismaService } from "../data-access/prisma.service";
import { LocalAttachmentStorageService } from "./storage/local-attachment-storage.service";
import { PdfParserService } from "./pdf-parser.service";
import { PDF_MAX_PAGES } from "./pdf-parser.service";
import type { AttachmentCategory, AttachmentDto, AttachmentDetailDto } from "./attachment.dto";
import { FileDetectorService } from "../file-intelligence/file-detector.service";
import { FileIntelligenceSecurityService } from "../file-intelligence/security/file-intelligence-security.service";
import { FileIntelligenceError } from "../file-intelligence/file-intelligence.errors";

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
/** Maximum raw image bytes accepted for server-side base64 conversion (4 MB — conservative to prevent memory exhaustion during base64 encoding overhead) */
export const MAX_IMAGE_BASE64_BYTES = 4 * 1024 * 1024;

@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);

  constructor(
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService,
    private readonly storageService: LocalAttachmentStorageService = new LocalAttachmentStorageService(),
    private readonly pdfParser: PdfParserService = new PdfParserService()
  ) { }

  /**
   * Validate magic bytes of common file formats to prevent MIME-type spoofing
   */
  public validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
    if (!buffer || buffer.length < 4) return false;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return declaredMime === "image/png";
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return declaredMime === "image/jpeg" || declaredMime === "image/jpg";
    }

    // GIF: 47 49 46 38 ("GIF8")
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return declaredMime === "image/gif";
    }

    // WebP: RIFF ... WEBP
    if (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      return declaredMime === "image/webp";
    }

    // PDF: %PDF-
    if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
      return declaredMime === "application/pdf";
    }

    // Text / JSON / CSV: non-binary heuristic (no null bytes in sample)
    if (
      declaredMime.startsWith("text/") ||
      declaredMime === "application/json"
    ) {
      const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
      return !sample.includes(0x00);
    }

    return false;
  }

  public detectCategory(mimeType: string, fileName: string): AttachmentCategory {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) return "pdf";
    if (mimeType.startsWith("text/") || mimeType === "application/json") return "doc";
    return "other";
  }

  /**
   * Upload and process an attachment for a conversation.
   * Enforces conversation ownership, file size limits, bounded content inspection,
   * magic bytes verification, and secure persistence.
   */
  async uploadAttachment(
    userId: string,
    conversationId: string,
    file: {
      fileName: string;
      mimeType: string;
      buffer: Buffer;
    }
  ): Promise<AttachmentDto> {
    // ── Validation ─────────────────────────────────────────────────────────────
    // All guards run BEFORE the database call so that unit tests without a live
    // Prisma instance can exercise every validation branch.

    // 1. Verify file size
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException("File buffer is empty");
    }
    if (file.buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds the 10 MB maximum size limit (${(file.buffer.length / (1024 * 1024)).toFixed(1)} MB)`
      );
    }

    // Admission interprets bounded bytes. Ownership below still determines
    // whether these bytes may be stored or later read in this conversation.
    const security = new FileIntelligenceSecurityService();
    const detection = new FileDetectorService(security).detect({ ...file, attachmentId: "upload", sizeBytes: file.buffer.length });
    if (["archive", "binary", "unknown"].includes(detection.category)) throw new FileIntelligenceError("UNSUPPORTED_FILE_FORMAT");
    const normalizedMime = detection.detectedMime;

    // 5a. PDF: detect page count BEFORE storage — reject explicitly if over limit
    const category = this.detectCategory(normalizedMime, file.fileName);
    if (category === "pdf") {
      // Parse page count first (cheap); reject with a clear error if over the limit
      const preCheck = this.pdfParser.parse(file.buffer);
      security.assertNoSecrets(preCheck.extractedText);
      if (preCheck.pageCount > PDF_MAX_PAGES) {
        throw new BadRequestException(
          `PDF exceeds the maximum supported page count of ${PDF_MAX_PAGES} pages (detected: ${preCheck.pageCount} pages). ` +
          `Please split the document or upload a shorter version.`
        );
      }
    }

    // ── Database presence check ────────────────────────────────────────────────
    if (!this.prisma) {
      throw new BadRequestException("Database service unavailable");
    }

    // 5b. Verify conversation existence and user ownership
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true }
    });
    if (!conv) {
      throw new NotFoundException("Conversation not found");
    }
    if (conv.userId !== userId) {
      throw new ForbiddenException("Cannot attach files to a conversation belonging to another user");
    }

    // 6. Detect category & perform PDF extraction if applicable
    let extractedText: string | null = null;
    let hasExtractedText = false;
    let isScanned = false;

    if (category === "pdf") {
      const parsed = this.pdfParser.parse(file.buffer);
      extractedText = parsed.extractedText;
      hasExtractedText = parsed.hasText;
      isScanned = parsed.isScanned;
    } else if (category === "doc") {
      // Plain text document: extract and normalize directly
      const rawText = file.buffer.toString("utf8");
      const normalized = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
      if (normalized.length > 0) {
        extractedText = normalized.slice(0, 12_000);
        hasExtractedText = true;
      }
    }

    // 7. Save binary data to storage using opaque storage key
    const storageKey = `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await this.storageService.write(storageKey, file.buffer);

    // 8. Persist durable metadata in PostgreSQL
    const record = await this.prisma.conversationAttachment.create({
      data: {
        conversationId,
        userId,
        fileName: detection.fileName,
        mimeType: normalizedMime,
        fileSize: file.buffer.length,
        category,
        storageKey,
        extractedText,
        hasExtractedText,
        isScanned,
        metadata: {}
      }
    });

    this.logger.log(`Attachment persisted: id=${record.id}, category=${category}, size=${record.fileSize}B`);

    return {
      id: record.id,
      conversationId: record.conversationId,
      userId: record.userId,
      fileName: record.fileName,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      category: record.category as AttachmentCategory,
      hasExtractedText: record.hasExtractedText,
      isScanned: record.isScanned,
      createdAt: record.createdAt.toISOString()
    };
  }

  /**
   * Retrieve attachment metadata with strict user authorization
   */
  async getAttachment(userId: string, attachmentId: string): Promise<AttachmentDetailDto> {
    if (!this.prisma) {
      throw new BadRequestException("Database service unavailable");
    }
    const att = await this.prisma.conversationAttachment.findUnique({
      where: { id: attachmentId }
    });
    if (!att || att.userId !== userId) {
      throw new NotFoundException("Attachment not found");
    }
    return {
      id: att.id,
      conversationId: att.conversationId,
      userId: att.userId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSize: att.fileSize,
      category: att.category as AttachmentCategory,
      extractedText: att.extractedText,
      hasExtractedText: att.hasExtractedText,
      isScanned: att.isScanned,
      createdAt: att.createdAt.toISOString()
    };
  }

  /**
   * List all attachments for a conversation with user authorization
   */
  async listAttachmentsForConversation(
    userId: string,
    conversationId: string
  ): Promise<AttachmentDto[]> {
    if (!this.prisma) return [];
    const rows = await this.prisma.conversationAttachment.findMany({
      where: { conversationId, userId },
      orderBy: { createdAt: "asc" }
    });
    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      userId: r.userId,
      fileName: r.fileName,
      mimeType: r.mimeType,
      fileSize: r.fileSize,
      category: r.category as AttachmentCategory,
      hasExtractedText: r.hasExtractedText,
      isScanned: r.isScanned,
      createdAt: r.createdAt.toISOString()
    }));
  }

  /**
   * Read raw binary content for an attachment (for multimodal AI forwarding or preview)
   */
  async getAttachmentBuffer(userId: string, attachmentId: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    if (!this.prisma) {
      throw new BadRequestException("Database service unavailable");
    }
    const att = await this.prisma.conversationAttachment.findUnique({
      where: { id: attachmentId }
    });
    if (!att || att.userId !== userId) {
      throw new NotFoundException("Attachment not found");
    }
    const buffer = await this.storageService.read(att.storageKey);
    if (!buffer) {
      throw new NotFoundException("Attachment binary data not found in storage");
    }
    return {
      buffer,
      mimeType: att.mimeType,
      fileName: att.fileName
    };
  }

  /**
   * Load an attachment only after establishing both user and conversation scope.
   * The storage key remains internal to this service and is never returned.
   */
  async getAttachmentBufferForConversation(
    userId: string,
    conversationId: string,
    attachmentId: string
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string; fileSize: number }> {
    if (!this.prisma) {
      throw new BadRequestException("Database service unavailable");
    }
    const att = await this.prisma.conversationAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) {
      throw new NotFoundException("Attachment not found");
    }
    if (att.userId !== userId || att.conversationId !== conversationId) {
      throw new ForbiddenException("Attachment access denied");
    }
    if (att.fileSize > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException("Attachment exceeds the maximum size limit");
    }
    const buffer = await this.storageService.read(att.storageKey);
    if (!buffer) {
      throw new NotFoundException("Attachment binary data not found in storage");
    }
    if (buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException("Attachment exceeds the maximum size limit");
    }
    return {
      buffer,
      mimeType: att.mimeType,
      fileName: att.fileName,
      fileSize: att.fileSize
    };
  }
}
