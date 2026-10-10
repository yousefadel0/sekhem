/** Read outcomes describe evidence availability, never authorization grants. */
export type FileReadOutcome = "READ" | "TRUNCATED" | "DENIED" | "UNSUPPORTED" | "SCANNED" | "FAILED" | "IMAGE_UNAVAILABLE" | "TOO_LARGE" | "NOT_FOUND";

export function fileReadOutcome(error: unknown): FileReadOutcome {
  const value = error as { code?: string; extractionCode?: string; getStatus?: () => number } | null;
  const code = value?.extractionCode ?? value?.code ?? "";
  const status = typeof value?.getStatus === "function" ? value.getStatus() : undefined;
  if (/DENIED|OUTSIDE_ROOT|PATH_INVALID/.test(code) || status === 403) return "DENIED";
  if (code === "IMAGE_INTELLIGENCE_NOT_AVAILABLE") return "IMAGE_UNAVAILABLE";
  if (code === "SCANNED_DOCUMENT_OCR_REQUIRED") return "SCANNED";
  if (/UNSUPPORTED/.test(code)) return "UNSUPPORTED";
  if (/TOO_LARGE|LIMIT_EXCEEDED/.test(code)) return "TOO_LARGE";
  if (/NOT_FOUND/.test(code) || status === 404) return "NOT_FOUND";
  return "FAILED";
}

export const hasReadableContent = (outcome?: FileReadOutcome): boolean => outcome === undefined || outcome === "READ" || outcome === "TRUNCATED";
