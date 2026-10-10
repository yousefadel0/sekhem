/**
 * Attachment types for the SEKHEM Command Composer.
 *
 * Files remain local until send, then use the conversation upload API.
 * The server authorizes storage and detects bounded content; browser MIME
 * and extensions are display hints, never proof that a file is readable.
 */

/** Mirrors the backend upload boundary. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  // 10 MB
export const MAX_FILE_COUNT = 5

/** Selected locally; page dispatch owns upload and failure handling. */
export type AttachmentState = "selected"

export interface AttachmentItem {
  /** Unique local ID */
  id: string
  /** The raw browser File object */
  file: File
  /** Display filename */
  name: string
  /** MIME type */
  type: string
  /** File size in bytes */
  size: number
  /** Object URL for image preview — must be revoked on removal */
  previewUrl?: string
  /** Current state */
  state: AttachmentState
}

/** Format file size for display */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Get file category for icon selection */
export type FileCategory = "image" | "pdf" | "code" | "data" | "config" | "log" | "doc" | "unknown"

export function getFileCategory(file: File): FileCategory {
  if (file.type.startsWith("image/")) return "image"
  if (file.type === "application/pdf") return "pdf"

  const ext = "." + file.name.split(".").pop()?.toLowerCase()

  const DATA_EXT = [".json", ".csv"]
  const DOC_EXT = [".md", ".txt", ".pdf", ".html", ".htm"]

  if (DATA_EXT.includes(ext)) return "data"
  if (DOC_EXT.includes(ext)) return "doc"
  return "unknown"
}

/** Validate a file for frontend acceptance */
export interface AttachmentValidationError {
  type: "size" | "type" | "count"
  message: string
}

export function validateFile(file: File, currentCount: number): AttachmentValidationError | null {
  if (currentCount >= MAX_FILE_COUNT) {
    return {
      type: "count",
      message: `Maximum ${MAX_FILE_COUNT} attachments allowed per message.`,
    }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      type: "size",
      message: `"${file.name}" exceeds the 10 MB limit (${formatFileSize(file.size)}).`,
    }
  }

  // Admission is provisional until the server inspects the actual bytes.
  return null
}
