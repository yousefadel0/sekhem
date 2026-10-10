import { PDF_MAX_PAGES, PDF_MAX_TEXT_BUDGET_CHARS } from "../attachment/pdf-parser.service";

/** Matches AttachmentService MAX_ATTACHMENT_SIZE_BYTES — do not raise this ceiling. */
const ATTACHMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Centralized File Intelligence budgets.
 * MAX_FILE_BYTES must not exceed the existing attachment upload boundary.
 */
export const FILE_INTELLIGENCE_LIMITS = {
  MAX_FILE_BYTES: ATTACHMENT_UPLOAD_MAX_BYTES,
  MAX_EXTRACTED_TEXT_CHARS: PDF_MAX_TEXT_BUDGET_CHARS,
  MAX_JSON_DEPTH: 12,
  MAX_JSON_ITEMS: 2_000,
  MAX_CSV_ROWS: 500,
  MAX_CSV_COLUMNS: 64,
  MAX_PDF_PAGES: PDF_MAX_PAGES
} as const;
