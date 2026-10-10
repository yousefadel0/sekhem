import { BadRequestException } from "@nestjs/common";
import { win32 } from "node:path";
import { runtimePath } from "../trusted-runtime/runtime.contract";

export const WORKSPACE_PRIVATE_MODULE = "SEKHEM_WORKSPACE_V1";
export type WorkspaceBindingVersion = number;
export type WorkspaceStatus = "VERIFYING" | "READY" | "OFFLINE" | "REVOKED" | "EXPIRED_GRANT" | "DIRECTORY_MISSING" | "UNAUTHORIZED" | "STALE";
export interface RuntimeWorkspaceReference { workspaceId: string; bindingVersion: WorkspaceBindingVersion }
export interface WorkspaceBinding {
  workspaceId: string; version: WorkspaceBindingVersion; revision: number;
  projectId: string; organizationId: string; userId: string; runtimeId: string; runtimeFingerprint: string;
  rootPath: string; displayName: string; status: WorkspaceStatus; verifiedAt: string | null;
  verificationReceiptId: string | null; createdAt: string; updatedAt: string;
}
export interface WorkspaceFileReference extends RuntimeWorkspaceReference { runtimeId: string; relativePath: string; receiptId: string }
export interface WorkspaceReceiptReference extends WorkspaceFileReference { observedAt: string; operationId: string; truncated: boolean }
export type RuntimeEvidenceState = "PENDING" | "APPROVAL_REQUIRED" | "EXECUTING" | "VERIFIED" | "TRUNCATED" | "UNAVAILABLE" | "DENIED" | "FAILED" | "STALE";
/** Explicit user intent, never derived from file content or an ordinary viewer receipt. */
export interface RuntimeEvidenceRequest extends RuntimeWorkspaceReference {
  requestId: string; runtimeId: string; runtimeFingerprint: string; relativePath: string;
  projectId: string; organizationId: string; userId: string; conversationId: string; operationId: string;
}
export interface RuntimeEvidenceReference extends RuntimeEvidenceRequest {
  receiptId: string; observationTime: string; contentIdentity: { status: "UNAVAILABLE" };
  truncated: boolean; encoding: "utf-8-decoded"; sourceType: "runtime-workspace"; verificationState: "VERIFIED";
}
export interface RuntimeEvidenceView {
  request: RuntimeEvidenceRequest; state: RuntimeEvidenceState; reference?: RuntimeEvidenceReference;
  /** Historical provenance is immutable, but is not permission to reuse content. */
  historical: boolean; operation?: WorkspaceOperation; message?: string;
}
export type WorkspaceOperationState = "LOADING" | "APPROVAL_REQUIRED" | "EXECUTING" | "READY" | "OFFLINE" | "REVOKED" | "EXPIRED_GRANT" | "UNAUTHORIZED" | "DIRECTORY_MISSING" | "NOT_FOUND" | "DENIED" | "FAILED" | "TRUNCATED" | "UNSUPPORTED" | "STALE";
/** Immutable intent/association only; execution state always comes from RuntimeControl.snapshot. */
export interface WorkspaceOperation extends RuntimeWorkspaceReference {
  /** Present only for an operation belonging to a coherent Agent inspection run. */
  planVersion?: number;
  query?: string;
  operationId: string; projectId: string; organizationId: string; userId: string; runtimeId: string;
  conversationId: string; runtimeRequestId: string; runId: string; tool: "filesystem.list" | "filesystem.read" | "filesystem.search";
  kind: "VERIFY" | "LIST" | "READ" | "SEARCH"; relativePath: string; absolutePath: string; createdAt: string;
}
export interface WorkspaceOperationView {
  operation: WorkspaceOperation; state: WorkspaceOperationState; message?: string; receipt?: WorkspaceReceiptReference;
  entries?: Array<{ name: string; path: string; type: "file" | "directory" | "other" }>;
  matches?: Array<{ path: string; line: number; text: string }>;
  file?: { text: string; fileName: string; mimeType: string; language?: string; warnings: string[] };
}
export function workspaceRoot(value: unknown): string {
  const path = runtimePath(value);
  if (!/^[a-z]:\\/i.test(path)) throw new BadRequestException("WORKSPACE_WINDOWS_PATH_REQUIRED");
  return path;
}
/** Navigation coordinates, not OS confinement. The runtime retains broad machine access. */
export const WORKSPACE_TARGET_REJECTION_REASONS = ["TARGET_TYPE", "TARGET_LENGTH", "INVALID_CHARACTERS", "ROOTED_PATH", "DOT_SEGMENT", "OUTSIDE_WORKSPACE"] as const;
export type WorkspaceTargetRejectionReason = typeof WORKSPACE_TARGET_REJECTION_REASONS[number];
const targetRejections = new WeakMap<Error, WorkspaceTargetRejectionReason>();
export const workspaceTargetRejectionReason = (error: unknown) => error instanceof Error ? targetRejections.get(error) : undefined;
function invalidWorkspaceTarget(reason: WorkspaceTargetRejectionReason): never {
  const error = new BadRequestException("WORKSPACE_RELATIVE_PATH_INVALID");
  targetRejections.set(error, reason);
  throw error;
}
export function workspaceTarget(root: string, value: unknown): { relativePath: string; absolutePath: string } {
  if (typeof value !== "string") return invalidWorkspaceTarget("TARGET_TYPE");
  if (value.length > 1024) return invalidWorkspaceTarget("TARGET_LENGTH");
  if (/[\x00-\x1f:*?"<>|]/.test(value)) return invalidWorkspaceTarget("INVALID_CHARACTERS");
  const path = value.replace(/\\/g, "/");
  if (path.startsWith("/")) return invalidWorkspaceTarget("ROOTED_PATH");
  if (path.split("/").some(p => p === ".." || p === ".")) return invalidWorkspaceTarget("DOT_SEGMENT");
  const relativePath = path.split("/").filter(Boolean).join("/");
  const absolutePath = workspaceRoot(win32.join(root, relativePath));
  const relative = win32.relative(root, absolutePath);
  if (relative.startsWith("..\\") || relative === ".." || win32.isAbsolute(relative)) return invalidWorkspaceTarget("OUTSIDE_WORKSPACE");
  return { relativePath, absolutePath };
}
