export type AttachmentCategory = "image" | "pdf" | "doc" | "other";

export interface AttachmentDto {
  id: string;
  conversationId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: AttachmentCategory;
  hasExtractedText: boolean;
  isScanned: boolean;
  createdAt: string;
}

export interface AttachmentDetailDto extends AttachmentDto {
  extractedText?: string | null;
}

export interface UploadAttachmentResponseDto {
  success: boolean;
  attachment: AttachmentDto;
}
