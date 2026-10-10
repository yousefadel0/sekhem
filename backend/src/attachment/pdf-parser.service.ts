import { Injectable, Logger } from "@nestjs/common";
import * as zlib from "node:zlib";
import { FileIntelligenceError } from "../file-intelligence/file-intelligence.errors";

export interface PdfParseResult {
  /** Total detected page count (actual value, not capped) */
  pageCount: number;
  /** Normalized, bounded text extracted from the PDF */
  extractedText: string;
  /** True if the document has meaningful readable text */
  hasText: boolean;
  /** True if the document appears to be scanned/image-only (no text layer) */
  isScanned: boolean;
  /** True if text exceeded the budget and was truncated */
  isTruncated: boolean;
}

export const PDF_MAX_PAGES = 20;
export const PDF_MAX_TEXT_BUDGET_CHARS = 12_000;

@Injectable()
export class PdfParserService {
  private readonly logger = new Logger(PdfParserService.name);

  /**
   * Parse a PDF buffer deterministically:
   * 1. Detect page count (capped at PDF_MAX_PAGES).
   * 2. Extract and decompress text streams.
   * 3. Extract text operators (Tj, TJ, ').
   * 4. Normalize whitespace and clean control characters.
   * 5. Detect scanned/image-only PDFs (lack of extractable text layer).
   * 6. Enforce strict character budget (PDF_MAX_TEXT_BUDGET_CHARS).
   */
  parse(buffer: Buffer): PdfParseResult {
    try {
      const rawString = buffer.toString("binary");

      // Verify PDF magic header (%PDF-)
      if (!rawString.startsWith("%PDF-")) {
        return {
          pageCount: 0,
          extractedText: "",
          hasText: false,
          isScanned: true,
          isTruncated: false
        };
      }

      // 1. Detect page count from /Type /Page occurrences or /Count
      let pageCount = this.detectPageCount(rawString);
      if (pageCount < 1) pageCount = 1;

      // 2. Extract text from uncompressed and compressed streams
      const textPieces: string[] = [];
      this.extractStreams(buffer, rawString, textPieces);

      const combinedText = textPieces.join("\n");
      const normalized = this.normalizeText(combinedText);

      // Only an empty extraction is image-only; short text is still readable evidence.
      if (normalized.length === 0) {
        return {
          pageCount,
          extractedText: "",
          hasText: false,
          isScanned: true,
          isTruncated: false
        };
      }

      // Context budget enforcement (12,000 characters)
      let finalBoundedText = normalized;
      let isTruncated = false;
      if (finalBoundedText.length > PDF_MAX_TEXT_BUDGET_CHARS) {
        finalBoundedText = finalBoundedText.slice(0, PDF_MAX_TEXT_BUDGET_CHARS).trim();
        finalBoundedText += "\n\n[Document truncated: context exceeded 12,000 character budget]";
        isTruncated = true;
      }

      return {
        pageCount,
        extractedText: finalBoundedText,
        hasText: true,
        isScanned: false,
        isTruncated
      };
    } catch (err) {
      if (err instanceof FileIntelligenceError) throw err;
      this.logger.warn(`PDF parsing error: ${(err as Error).message}`);
      return {
        pageCount: 1,
        extractedText: "",
        hasText: false,
        isScanned: true,
        isTruncated: false
      };
    }
  }

  private detectPageCount(raw: string): number {
    // Check for explicit /Count in /Pages object
    const countMatch = /\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/.exec(raw);
    if (countMatch && countMatch[1]) {
      const parsed = parseInt(countMatch[1], 10);
      if (parsed > 0) return parsed; // Return raw value — caller decides how to cap
    }
    // Count individual /Type /Page occurrences (excluding /Pages)
    const pageMatches = raw.match(/\/Type\s*\/Page\b/g);
    if (pageMatches) {
      return pageMatches.length;
    }
    return 1;
  }

  private extractStreams(buffer: Buffer, raw: string, out: string[]): void {
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    let decodedBytes = 0;
    let streamCount = 0;

    while ((match = streamRegex.exec(raw)) !== null) {
      if (++streamCount > 512) throw new FileIntelligenceError("EXTRACTION_LIMIT_EXCEEDED");
      const streamStart = match.index + match[0].indexOf("\n") + 1;
      const streamContent = match[1];

      let streamBuffer: Buffer;
      try {
        // Try inflating with zlib (FlateDecode)
        const rawStreamBytes = buffer.subarray(streamStart, streamStart + streamContent.length);
        streamBuffer = zlib.inflateSync(rawStreamBytes, { maxOutputLength: 1024 * 1024 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new FileIntelligenceError("EXTRACTION_LIMIT_EXCEEDED");
        try {
          streamBuffer = zlib.inflateRawSync(Buffer.from(streamContent, "binary"), { maxOutputLength: 1024 * 1024 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw new FileIntelligenceError("EXTRACTION_LIMIT_EXCEEDED");
          // Uncompressed text stream
          streamBuffer = Buffer.from(streamContent, "binary");
        }
      }

      decodedBytes += streamBuffer.length;
      if (decodedBytes > 4 * 1024 * 1024) throw new FileIntelligenceError("EXTRACTION_LIMIT_EXCEEDED");

      const streamText = streamBuffer.toString("utf8");
      this.extractTextFromStream(streamText, out);
    }

    // Fallback: also scan uncompressed text blocks in main body
    this.extractTextFromStream(raw, out);
  }

  private extractTextFromStream(content: string, out: string[]): void {
    // Look for text objects: BT ... ET
    const btRegex = /BT([\s\S]*?)ET/g;
    let btMatch: RegExpExecArray | null;

    while ((btMatch = btRegex.exec(content)) !== null) {
      const block = btMatch[1];
      // Match string literals ( ... ) followed by Tj or ' or in TJ arrays
      const tjRegex = /\(([^)]*)\)\s*(?:Tj|'|")/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(block)) !== null) {
        const text = this.unescapePdfString(tjMatch[1]);
        if (text.trim()) out.push(text);
      }

      // Match array format: [ (text) -10 (more) ] TJ
      const arrayRegex = /\[([^\]]*)\]\s*TJ/g;
      let arrMatch: RegExpExecArray | null;
      while ((arrMatch = arrayRegex.exec(block)) !== null) {
        const inner = arrMatch[1];
        const innerRegex = /\(([^)]*)\)/g;
        let innerMatch: RegExpExecArray | null;
        let line = "";
        while ((innerMatch = innerRegex.exec(inner)) !== null) {
          line += this.unescapePdfString(innerMatch[1]) + " ";
        }
        if (line.trim()) out.push(line.trim());
      }
    }
  }

  private unescapePdfString(s: string): string {
    return s
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
  }

  private normalizeText(text: string): string {
    return text
      // Replace non-printable characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Collapse multiple consecutive blank lines
      .replace(/\n{3,}/g, "\n\n")
      // Collapse multiple consecutive spaces
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
}
