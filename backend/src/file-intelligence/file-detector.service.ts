import { Injectable } from "@nestjs/common";
import { FileIntelligenceError } from "./file-intelligence.errors";
import { FileIntelligenceSecurityService } from "./security/file-intelligence-security.service";
import type {
  FileCategory,
  FileDetectionResult,
  FileExtractionInput
} from "./models/file-intelligence.types";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".html": "text/html",
  ".htm": "text/html",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

const CATEGORY_BY_MIME: Record<string, FileCategory> = {
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "spreadsheet",
  "application/json": "structured",
  "application/pdf": "document",
  "text/html": "document",
  "image/png": "image",
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/webp": "image",
  "image/gif": "image"
};

// Format denial, not a source-extension allowlist. Text disguised as these
// payloads must not turn a blocked binary/archive/database into readable code.
const BLOCKED_EXTENSIONS = new Set([
  ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".bz2", ".xz", ".zst",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".jar", ".lockb", ".wasm", ".msi",
  ".db", ".sqlite", ".sqlite3", ".mdb", ".accdb"
]);
const BLOCKED_MIME = /(?:zip|compressed|archive|x-tar|executable|x-msdownload|x-dosexec|sharedlib|wasm|sqlite|msaccess|java-archive)/i;

@Injectable()
export class FileDetectorService {
  constructor(private readonly security: FileIntelligenceSecurityService) {}

  detect(input: FileExtractionInput): FileDetectionResult {
    this.security.assertExtractionInput(input);
    this.security.assertSafeFileName(input.fileName);

    const fileName = this.security.normalizeFileName(input.fileName);
    const declaredMime = this.normalizeMime(input.mimeType);
    const extension = this.extensionOf(fileName);
    const magicMime = this.detectMagicMime(input.buffer);
    const warnings: string[] = [];

    if (BLOCKED_EXTENSIONS.has(extension) || BLOCKED_MIME.test(declaredMime) ||
      magicMime === "application/zip" || magicMime === "application/x-binary") {
      throw new FileIntelligenceError("UNSUPPORTED_FILE_FORMAT");
    }

    if (magicMime && declaredMime && declaredMime !== "application/octet-stream" && !this.mimeCompatible(magicMime, declaredMime)) {
      throw new FileIntelligenceError("FILE_DETECTION_FAILED", "File signature does not match the declared MIME type.");
    }

    const extensionMime = MIME_BY_EXTENSION[extension] ?? "";
    if (extensionMime && magicMime && !this.mimeCompatible(magicMime, extensionMime)) {
      throw new FileIntelligenceError("FILE_DETECTION_FAILED", "File signature does not match the file extension.");
    }

    const expectsBinaryFormat = (mime: string) => mime.startsWith("image/") && mime !== "image/svg+xml" || mime === "application/pdf";
    if (!magicMime && (expectsBinaryFormat(extensionMime) || expectsBinaryFormat(declaredMime))) {
      throw new FileIntelligenceError("FILE_DETECTION_FAILED", "File signature does not match the declared format.");
    }
    // Only a validated byte sequence can enter the text path. Browser MIME and
    // extension choose a parser after this check; neither grants file access.
    if (!magicMime) this.security.inspectText(input.buffer);
    const textMime = ["text/markdown", "text/csv", "application/json", "text/html"].includes(extensionMime)
      ? extensionMime : ["text/markdown", "text/csv", "application/json", "text/html"].includes(declaredMime)
        ? declaredMime : "text/plain";
    const detectedMime = magicMime || textMime;
    const category = this.categoryFor(detectedMime, extension, input.buffer);

    if (category === "text" || category === "structured" || category === "spreadsheet") {
      if (this.security.hasNulBytes(input.buffer)) {
        throw new FileIntelligenceError("FILE_DETECTION_FAILED", "Text-like files must not contain binary null bytes.");
      }
    }

    return {
      fileName,
      declaredMime: declaredMime || detectedMime,
      detectedMime,
      extension,
      category,
      encoding: category === "image" || category === "binary" || category === "archive" ? undefined : "utf-8",
      sizeBytes: input.buffer.length,
      warnings
    };
  }

  normalizeMime(mimeType: string): string {
    const raw = String(mimeType ?? "").toLowerCase().trim().split(";")[0]?.trim() ?? "";
    if (raw === "image/jpg") return "image/jpeg";
    if (raw === "text/x-markdown") return "text/markdown";
    if (raw === "application/csv") return "text/csv";
    return raw;
  }

  private extensionOf(fileName: string): string {
    const idx = fileName.lastIndexOf(".");
    if (idx <= 0 || idx === fileName.length - 1) return "";
    return fileName.slice(idx).toLowerCase();
  }

  private mimeCompatible(a: string, b: string): boolean {
    const na = this.normalizeMime(a);
    const nb = this.normalizeMime(b);
    return na === nb;
  }

  private detectMagicMime(buffer: Buffer): string | null {
    const prefix = buffer.subarray(0, 16);
    if (prefix.subarray(0, 2).toString("ascii") === "MZ" || prefix.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      prefix.subarray(0, 4).equals(Buffer.from([0, 0x61, 0x73, 0x6d])) || prefix.toString("ascii").startsWith("SQLite format 3") ||
      ["cafebabe", "cffaedfe", "cefaedfe", "feedfacf", "feedface", "504b0304", "504b0506", "504b0708", "52617221", "377abcaf", "28b52ffd"].includes(prefix.subarray(0, 4).toString("hex")) ||
      prefix.subarray(0, 2).toString("hex") === "1f8b" || prefix.subarray(0, 3).toString("ascii") === "BZh" ||
      prefix.subarray(0, 6).toString("hex") === "fd377a585a00" || buffer.subarray(257, 262).toString("ascii") === "ustar") return "application/x-binary";
    if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return "image/png";
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return "image/gif";
    }
    if (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
      return "image/webp";
    }
    if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
      return "application/pdf";
    }
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)) {
      return "application/zip";
    }
    return null;
  }

  private categoryFor(mime: string, extension: string, buffer: Buffer): FileCategory {
    if (CATEGORY_BY_MIME[mime]) {
      return CATEGORY_BY_MIME[mime];
    }
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/zip" || mime === "application/x-tar" || extension === ".zip" || extension === ".tar") {
      return "archive";
    }
    if (mime.startsWith("text/")) return "text";
    if (this.security.hasNulBytes(buffer) || mime === "application/octet-stream") {
      return "binary";
    }
    return "unknown";
  }
}
