import { BadRequestException } from "@nestjs/common";
import type { FileIntelligenceErrorCode } from "../file-intelligence/file-intelligence.errors";

export type WorkspaceIntelligenceErrorCode =
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_ACCESS_DENIED"
  | "WORKSPACE_PATH_INVALID"
  | "WORKSPACE_PATH_OUTSIDE_ROOT"
  | "WORKSPACE_LIMIT_EXCEEDED"
  | "WORKSPACE_FILE_NOT_FOUND"
  | "WORKSPACE_FILE_ACCESS_DENIED"
  | "WORKSPACE_FILE_TOO_LARGE"
  | "WORKSPACE_INSPECTION_FAILED"
  | "WORKSPACE_SOURCE_UNSUPPORTED";

const SAFE_MESSAGES: Record<WorkspaceIntelligenceErrorCode, string> = {
  WORKSPACE_NOT_FOUND: "Workspace was not found.",
  WORKSPACE_ACCESS_DENIED: "Workspace access is denied.",
  WORKSPACE_PATH_INVALID: "The workspace path is invalid.",
  WORKSPACE_PATH_OUTSIDE_ROOT: "The requested path is outside the workspace root.",
  WORKSPACE_LIMIT_EXCEEDED: "Workspace discovery reached a configured safety limit.",
  WORKSPACE_FILE_NOT_FOUND: "The requested workspace file was not found.",
  WORKSPACE_FILE_ACCESS_DENIED: "Access to this workspace file is denied.",
  WORKSPACE_FILE_TOO_LARGE: "The workspace file exceeds the inspection size limit.",
  WORKSPACE_INSPECTION_FAILED: "Workspace file inspection failed.",
  WORKSPACE_SOURCE_UNSUPPORTED: "This workspace source is not supported for safe local inspection."
};

export class WorkspaceIntelligenceError extends BadRequestException {
  readonly code: WorkspaceIntelligenceErrorCode;

  constructor(code: WorkspaceIntelligenceErrorCode, message?: string, readonly extractionCode?: FileIntelligenceErrorCode) {
    const safeMessage = message && !containsUnsafeDetail(message) ? message : SAFE_MESSAGES[code];
    super({ code, message: safeMessage, ...(extractionCode ? { extractionCode } : {}) });
    this.code = code;
  }
}

function containsUnsafeDetail(message: string): boolean {
  return /[\\/]|\.\.|stack|node_modules|passwd|System32|[A-Za-z]:\\/i.test(message);
}

export function toControlledWorkspaceError(err: unknown): WorkspaceIntelligenceError {
  if (err instanceof WorkspaceIntelligenceError) {
    return err;
  }
  return new WorkspaceIntelligenceError("WORKSPACE_INSPECTION_FAILED");
}
