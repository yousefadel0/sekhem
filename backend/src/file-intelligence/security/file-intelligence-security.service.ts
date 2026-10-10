import { Injectable } from "@nestjs/common";
import { FileIntelligenceError } from "../file-intelligence.errors";
import { FILE_INTELLIGENCE_LIMITS } from "../file-intelligence.limits";
import type { FileExtractionInput } from "../models/file-intelligence.types";
import { TextDecoder } from "node:util";
import { WorkspaceSecurityService } from "../../workspace-intelligence/security/workspace-security.service";
import { WorkspacePathService } from "../../workspace-intelligence/workspace-path.service";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

@Injectable()
export class FileIntelligenceSecurityService {
  /** Reuse the existing sensitive-path policy for uploaded names as well. */
  assertSafeFileName(fileName: string): void {
    const policy = new WorkspaceSecurityService(new WorkspacePathService());
    if (String(fileName).replace(/\\/g, "/").split("/").some(part =>
      policy.isSensitiveFile(part) || policy.isForbiddenDirectoryName(part))) {
      throw new FileIntelligenceError("FILE_ACCESS_DENIED");
    }
  }

  assertNoSecrets(text: string): void {
    // Same high-confidence secret forms excluded by repository snapshots.
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text) || /\bAKIA[0-9A-Z]{16}\b/.test(text) ||
      /\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(text) || /\bsk-[A-Za-z0-9_-]{20,}\b/.test(text) ||
      /(?:password|passwd|api[_-]?key|secret|token|authorization)\s*[:=]\s*["']?[A-Za-z0-9_+./=-]{12,}/i.test(text)) {
      throw new FileIntelligenceError("FILE_ACCESS_DENIED");
    }
  }

  /** Inspect the entire already size-bounded buffer; never accept replacement decoding. */
  inspectText(buffer: Buffer): string {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { throw new FileIntelligenceError("UNSUPPORTED_FILE_FORMAT"); }
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
      throw new FileIntelligenceError("UNSUPPORTED_FILE_FORMAT");
    }
    this.assertNoSecrets(text);
    return text;
  }
  /**
   * Normalize a client-supplied filename to a basename only.
   * Path separators and traversal sequences are discarded; never used as a filesystem path.
   */
  normalizeFileName(fileName: string): string {
    const unified = String(fileName ?? "").replace(/\\/g, "/").replace(/\0/g, "");
    const segments = unified.split("/").filter((part) => part.length > 0 && part !== "." && part !== "..");
    const base = segments.length > 0 ? segments[segments.length - 1] : "unnamed";
    const trimmed = base.trim().slice(0, 255);
    return trimmed.length > 0 ? trimmed : "unnamed";
  }

  assertExtractionInput(input: FileExtractionInput): void {
    if (!input || !Buffer.isBuffer(input.buffer)) {
      throw new FileIntelligenceError("FILE_DETECTION_FAILED");
    }
    if (input.buffer.length === 0) {
      throw new FileIntelligenceError("FILE_DETECTION_FAILED", "File buffer is empty.");
    }
    if (input.buffer.length > FILE_INTELLIGENCE_LIMITS.MAX_FILE_BYTES || input.sizeBytes > FILE_INTELLIGENCE_LIMITS.MAX_FILE_BYTES) {
      throw new FileIntelligenceError("FILE_TOO_LARGE");
    }
  }

  decodeUtf8(buffer: Buffer): string {
    let offset = 0;
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      offset = 3;
    }
    return buffer.subarray(offset).toString("utf8");
  }

  normalizeText(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(CONTROL_CHARS, "");
  }

  applyTextBudget(text: string): { text: string; truncated: boolean } {
    if (text.length <= FILE_INTELLIGENCE_LIMITS.MAX_EXTRACTED_TEXT_CHARS) {
      return { text, truncated: false };
    }
    return {
      text: text.slice(0, FILE_INTELLIGENCE_LIMITS.MAX_EXTRACTED_TEXT_CHARS),
      truncated: true
    };
  }

  detectLanguage(text: string): string | undefined {
    const sample = text.slice(0, 2_000);
    if (/[\u0600-\u06FF]/.test(sample)) {
      return "ar";
    }
    return undefined;
  }

  hasNulBytes(buffer: Buffer, sampleBytes = 1024): boolean {
    const sample = buffer.subarray(0, Math.min(buffer.length, sampleBytes));
    return sample.includes(0x00);
  }
}
