import { Injectable } from "@nestjs/common";
import { FILE_INTELLIGENCE_LIMITS } from "../file-intelligence.limits";
import { FileIntelligenceSecurityService } from "../security/file-intelligence-security.service";
import { createNormalizedDocument } from "../models/normalized-document-content";
import type { NormalizedDocumentContent } from "../models/normalized-document-content";
import type { CsvStructure, FileExtractionInput } from "../models/file-intelligence.types";
import type { FileExtractor } from "./file-extractor.interface";

@Injectable()
export class CsvExtractor implements FileExtractor {
  readonly id = "csv";

  constructor(private readonly security: FileIntelligenceSecurityService = new FileIntelligenceSecurityService()) {}

  canHandle(input: FileExtractionInput): boolean {
    const mime = (input.mimeType ?? "").toLowerCase().trim();
    const name = this.security.normalizeFileName(input.fileName).toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    return ext === ".csv" || mime === "text/csv" || mime === "application/csv";
  }

  async extract(input: FileExtractionInput): Promise<NormalizedDocumentContent> {
    const fileName = this.security.normalizeFileName(input.fileName);
    const decoded = this.security.normalizeText(this.security.decodeUtf8(input.buffer));
    const lines = this.splitLines(decoded);
    const delimiter = this.detectDelimiter(lines[0] ?? "");

    const warnings: string[] = [];
    let truncated = false;

    if (lines.length === 0) {
      return this.result(input, fileName, [], [], 0, 0, false, warnings);
    }

    const headerCells = this.parseLine(lines[0], delimiter);
    if (headerCells.length > FILE_INTELLIGENCE_LIMITS.MAX_CSV_COLUMNS) {
      truncated = true;
      warnings.push("CSV columns truncated at configured column limit.");
    }
    const columns = headerCells.slice(0, FILE_INTELLIGENCE_LIMITS.MAX_CSV_COLUMNS).map((c, i) => c || `column_${i + 1}`);

    const dataLines = lines.slice(1);
    if (dataLines.length > FILE_INTELLIGENCE_LIMITS.MAX_CSV_ROWS) {
      truncated = true;
      warnings.push("CSV rows truncated at configured row limit.");
    }
    const limitedRows = dataLines.slice(0, FILE_INTELLIGENCE_LIMITS.MAX_CSV_ROWS);

    const rows: string[][] = [];
    for (const line of limitedRows) {
      if (line.length === 0) continue;
      const cells = this.parseLine(line, delimiter).slice(0, FILE_INTELLIGENCE_LIMITS.MAX_CSV_COLUMNS);
      if (this.parseLine(line, delimiter).length > FILE_INTELLIGENCE_LIMITS.MAX_CSV_COLUMNS && !warnings.includes("CSV columns truncated at configured column limit.")) {
        truncated = true;
        warnings.push("CSV columns truncated at configured column limit.");
      }
      rows.push(cells);
    }

    const textLines = [columns.join(","), ...rows.map((row) => row.join(","))];
    const joined = textLines.join("\n");
    const budget = this.security.applyTextBudget(joined);
    if (budget.truncated) {
      truncated = true;
      warnings.push("Text extraction truncated at configured character limit.");
    }

    const structure: CsvStructure = {
      kind: "csv",
      columns,
      rowCount: rows.length,
      columnCount: columns.length
    };

    return this.result(input, fileName, budget.text, structure, rows.length, columns.length, truncated, warnings);
  }

  private result(
    input: FileExtractionInput,
    fileName: string,
    text: string | string[],
    structure: CsvStructure | [],
    rowCount: number,
    columnCount: number,
    truncated: boolean,
    warnings: string[]
  ): NormalizedDocumentContent {
    const resolvedStructure: CsvStructure =
      Array.isArray(structure)
        ? { kind: "csv", columns: [], rowCount: 0, columnCount: 0 }
        : structure;

    return createNormalizedDocument({
      sourceAttachmentId: input.attachmentId,
      fileName,
      detectedMime: "text/csv",
      category: "spreadsheet",
      sizeBytes: input.buffer.length,
      encoding: "utf-8",
      text: typeof text === "string" ? text : "",
      truncated,
      structure: resolvedStructure,
      rowCount,
      extractorId: this.id,
      warnings
    });
  }

  private splitLines(text: string): string[] {
    return text.replace(/^\uFEFF/, "").split("\n").map((line) => line.replace(/\s+$/, ""));
  }

  private detectDelimiter(headerLine: string): string {
    const candidates = [",", ";", "\t", "|"];
    let best = ",";
    let bestCount = -1;
    for (const candidate of candidates) {
      const count = this.parseLine(headerLine, candidate).length;
      if (count > bestCount) {
        bestCount = count;
        best = candidate;
      }
    }
    return best;
  }

  private parseLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }
}
