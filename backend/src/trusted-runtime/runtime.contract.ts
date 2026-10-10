import { createHash, createPublicKey } from "node:crypto";
import { win32, posix } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { isRecord, toolDigest, type ToolPermission, type ToolRequest, type ToolActionBinding } from "../agent-runtime/tools/tool-contract";

export const RUNTIME_LABEL = "Trusted Local Runtime — broad machine access, controlled execution";
export const RUNTIME_MODULE = "SEKHEM_TRUSTED_RUNTIME_V1";
export const RUNTIME_VERSION = "1.0.0";
export const RUNTIME_TOOLS = ["filesystem.read", "filesystem.write", "filesystem.list", "filesystem.search", "filesystem.create", "filesystem.delete", "filesystem.move", "filesystem.copy", "terminal.execute"] as const;
export type RuntimeTool = typeof RUNTIME_TOOLS[number];
export const RUNTIME_STATES = ["CREATED", "AUTHORIZED", "DISPATCHED", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "OUTCOME_UNKNOWN", "REJECTED", "EXPIRED"] as const;
export type RuntimeState = typeof RUNTIME_STATES[number];
export const TERMINAL_RUNTIME_STATES: readonly RuntimeState[] = ["SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "OUTCOME_UNKNOWN", "REJECTED", "EXPIRED"];
export const RUNTIME_LIMITS = { inputBytes: 24576, writeBytes: 22528, outputBytes: 32768, recordBytes: 262144, readBytes: 32768, fileBytes: 16777216, entries: 256, timeoutMs: 300000, challengeMs: 30000, permitMs: 60000, heartbeatMs: 15000, lostMs: 45000 } as const;
export type RuntimeRecordType = "REPAIR_CONTINUATION" | "EXECUTION_LINEAGE" | "CHANGE_SET" | "CHANGE_DECISION" | "CHANGE_SELECTION_HEAD" | "CHANGE_SELECTION_REVISION" | "CHANGE_SELECTED_PROPOSAL" | "WORKFLOW_PAUSE_REQUEST" | "WORKFLOW_PAUSE" | "WORKFLOW_DECISION" | "WORKSPACE_READ_CONSENT" | "WORKSPACE_READ_CONSENT_REQUEST" | "RUNTIME_GRANT_RENEWAL" | "RUNTIME_CAPABILITY_ENROLLMENT" | "TASK_CONSENT" | "TASK_CONSENT_HEAD" | "TASK_CONSENT_REQUEST" | "RUNTIME_FOLDER_SELECTION" | "RUNTIME_DEVICE" | "RUNTIME_FINGERPRINT" | "RUNTIME_GRANT" | "RUNTIME_PROPOSAL" | "RUNTIME_EXECUTION" | "RUNTIME_IDEMPOTENCY" | "RUNTIME_PERMIT_CONSUMPTION" | "RUNTIME_RESULT" | "RUNTIME_CHALLENGE" | "RUNTIME_AUTH_CONSUMPTION" | "RUNTIME_REVISION" | "AGENT_INSPECTION" | "PLAN_EXECUTION" | "EXACT_PLAN_CONTINUATION" | "EXACT_PROPOSAL" | "EXACT_EXECUTION_PERMIT" | "EXACT_PERMIT_CONSUMPTION" | "EXACT_PERMIT_HEAD" | "EXACT_PERMIT_GENERATION" | "EXACT_APPROVAL_HEAD" | "EXACT_APPROVAL_GENERATION";
export interface RuntimeDevice {
  conditionalWriteProtocol?: 1;
  workspaceReadProtocol?: 1;
  folderPickerProtocol?: 1;
  runtimeId: string; userId: string; organizationId: string; displayName: string; publicKey: string; fingerprint: string;
  keyVersion: number; status: "ACTIVE" | "REVOKED" | "DISABLED"; connectionEpoch: number; protocolVersion: string;
  runtimeVersion: string; lastSeenAt: string | null; createdAt: string; updatedAt: string; revokedAt: string | null;
}
/** Explicit configuration ceiling only. Never an operational grant or execution authority. */
export interface RuntimeCapabilityEnrollment {
  enrollmentId: string; revision: number; userId: string; organizationId: string; projectId: string;
  runtimeId: string; runtimeFingerprint: string; capabilities: RuntimeTool[];
  configuredBy: string; configuredAt: string;
  /** Optional only for readable Stage-1 records; renewal requires explicit ACTIVE lifecycle metadata. */
  status?: "ACTIVE" | "REVOKED"; expiresAt?: string | null; revokedAt?: string | null;
}
export interface RuntimeGrant {
  /** Server-derived presentation/current read-policy result; never client authority. */
  persistentReadAccess?: boolean;
  grantId: string; runtimeId: string; userId: string; projectId: string; organizationId: string; mode: "TRUSTED_MACHINE";
  capabilities: RuntimeTool[]; version: number; status: "ACTIVE" | "REVOKED"; createdAt: string; expiresAt: string | null; revokedAt: string | null;
  enrollment?: { enrollmentId: string; revision: number; runtimeFingerprint: string };
  workspaceRead?: WorkspaceReadConsent;
}
// Explicit work-session access; durable session and enrollment expiry remain ceilings.
export const RUNTIME_GRANT_RENEWAL_MAX_MS = 8 * 60 * 60 * 1000;
export const WORKSPACE_READ_TOOLS = ["filesystem.list", "filesystem.search", "filesystem.read"] as const;
export const WORKSPACE_READ_TTL_MS = 60 * 60 * 1000;
/** Human consent stored in the existing versioned grant, never inferred from a model or path. */
export interface WorkspaceReadConsent {
  kind: "WORKSPACE_READ"; workspaceId: string; bindingId: string; bindingVersion: number; rootPath: string;
  runtimeId: string; runtimeFingerprint: string; userId: string; organizationId: string; projectId: string;
  capabilities: Array<typeof WORKSPACE_READ_TOOLS[number]>; version: number; status: "ACTIVE" | "REVOKED";
  approvedBy: string; approvedAt: string; expiresAt: string | null; revokedAt: string | null; fingerprint: string;
}
export interface WorkspaceReadCoverage { kind: "WORKSPACE_READ_GRANT"; grantId: string; grantVersion: number; consent: WorkspaceReadConsent; lifecycle?: "DEVELOPMENT_ENROLLED_READ" }
export interface RuntimeProposal {
  workspaceRead?: WorkspaceReadCoverage;
  /** Server-owned Explorer coordinates; separate from the Agent loop association. */
  workspaceOperation?: { workspaceId: string; bindingVersion: number; runtimeFingerprint: string; rootPath: string; operationId: string };
  /** Server-owned workspace coordinates; never accepted by the public proposal endpoint. */
  inspection?: { workspaceId: string; bindingVersion: number; runtimeFingerprint: string; rootPath: string; operationId: string };
  proposalId: string; proposalDigest: string; runtimeId: string; grantId: string; grantVersion: number; connectionEpoch: number;
  userId: string; organizationId: string; projectId: string; conversationId: string; runId: string; planId: string; planVersion: number; planStepId: string;
  toolId: RuntimeTool; toolVersion: "2.0.0"; validatedInput: Record<string, unknown>; purpose: string; effect: "READ_ONLY" | "WRITE" | "DESTRUCTIVE" | "EXECUTE";
  risk: "LOW" | "MEDIUM" | "HIGH"; scope: ToolRequest["scope"]; planDigest: string; inputDigest: string; scopeDigest: string; verificationDigest: string;
  workspaceBindingId: string; workspaceBindingVersion: string; policyVersion: "trusted-runtime-v1"; createdAt: string;
  preview: { available: true; description: string }; approvalId: string | null; approvalFingerprint: string | null;
  state: "AWAITING_APPROVAL" | "APPROVED" | "CANCELLED" | "REJECTED" | "DISPATCHED"; authorizingSessionId: string; authorizingIssuedAt: number; authorizingExpiresAt: number;
}
export interface RuntimeAttribution {
  workspaceRead?: WorkspaceReadCoverage;
  executionId: string; executionIntentId: string; idempotencyKey: string; runtimeId: string; grantId: string; grantVersion: number;
  userId: string; organizationId: string; projectId: string; conversationId: string; agentRunId: string; planId: string; planVersion: number;
  planStepId: string; proposalId: string; approvalId: string; approvalFingerprint: string; tool: RuntimeTool; toolVersion: string;
  validatedInput: Record<string, unknown>; operationDigest: string; permitDigest: string; permitExpiresAt: string; connectionEpoch: number; createdAt: string;
}
export interface RuntimeResult {
  executionId: string; operationDigest: string; state: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "OUTCOME_UNKNOWN";
  startedAt: string; finishedAt: string; durationMs: number; pid: number | null; exitCode: number | null; stdout: string; stderr: string;
  result: Record<string, unknown>; error: string | null; truncated: boolean; verificationState: "VERIFIED" | "FAILED" | "NOT_VERIFIED";
  verificationResult: Record<string, unknown>;
}
export interface RuntimeExecution {
  attribution: RuntimeAttribution; state: RuntimeState; dispatchedAt: string | null; startedAt: string | null; finishedAt: string | null;
  consumedAt: string | null; lastSeenAt: string; cancellationState: "NONE" | "REQUESTED" | "CONFIRMED" | "UNKNOWN";
  verificationState: "PENDING" | "VERIFYING" | "VERIFIED" | "FAILED" | "NOT_VERIFIED"; verifiedAt: string | null; result: RuntimeResult | null; error: string | null;
  output?: { stdout: string; stderr: string };
}
export interface RuntimeAuth {
  runtimeId: string; connectionEpoch: number; challengeId: string; timestamp: string; signature: string;
}
export interface RuntimeChallenge { challengeId: string; runtimeId: string; connectionEpoch: number; nonce: string; operation: string; bodyDigest: string; expiresAt: string }
export function runtimeKey(type: RuntimeRecordType, parts: unknown): string { return `rt1_${type}_${toolDigest(parts)}`; }
export function runtimeError(code: string): never { throw new BadRequestException(code); }
export function boundedRuntime(value: unknown, limit: number = RUNTIME_LIMITS.recordBytes): void {
  let count = 0; const seen = new Set<object>();
  const visit = (v: unknown, depth: number): boolean => {
    if (++count > 8192 || depth > 14) return false;
    if (v === null || typeof v === "string" || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (!v || typeof v !== "object" || seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.length <= 512 && v.every(x => visit(x, depth + 1));
    return isRecord(v) && Object.keys(v).length <= 64 && Object.entries(v).every(([k, x]) => !["__proto__", "prototype", "constructor"].includes(k) && visit(x, depth + 1));
  };
  if (!visit(value, 0) || Buffer.byteLength(JSON.stringify(value)) > limit) runtimeError("RUNTIME_PAYLOAD_INVALID");
}
export function runtimePath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 1024 || /[\x00-\x1f*?"<>|]/.test(value) || value.startsWith("\\\\") || value.startsWith("//")) runtimeError("RUNTIME_PATH_INVALID");
  const windows = /^[a-z]:[\\/]/i.test(value);
  if (!windows && !posix.isAbsolute(value)) runtimeError("RUNTIME_ABSOLUTE_PATH_REQUIRED");
  if (value.slice(windows ? 2 : 0).includes(":")) runtimeError("RUNTIME_PATH_INVALID");
  const parts = value.replace(/\\/g, "/").split("/").slice(windows ? 1 : 0).filter(Boolean);
  if (parts.some(p => p === "." || p === ".." || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) runtimeError("RUNTIME_PATH_INVALID");
  return windows ? win32.normalize(value) : posix.normalize(value);
}
export function runtimeInput(tool: string, value: unknown): Record<string, unknown> {
  boundedRuntime(value, RUNTIME_LIMITS.inputBytes);
  if (!RUNTIME_TOOLS.includes(tool as RuntimeTool) || !isRecord(value)) runtimeError("RUNTIME_TOOL_INVALID");
  const keys = tool === "terminal.execute" ? ["executable", "args", "cwd", "timeoutMs"] : ["filesystem.move", "filesystem.copy"].includes(tool) ? ["source", "destination"] : ["filesystem.write", "filesystem.create"].includes(tool) ? ["path", "content", ...(tool === "filesystem.write" && "expectedSha256" in value ? ["expectedSha256"] : [])] : tool === "filesystem.search" ? ["path", "query"] : ["path"];
  if (Object.keys(value).length !== keys.length || keys.some(k => !(k in value))) runtimeError("RUNTIME_INPUT_INVALID");
  const input = structuredClone(value);
  for (const key of ["path", "source", "destination", "cwd"]) if (key in input) input[key] = runtimePath(input[key]);
  if ("expectedSha256" in input && (typeof input.expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedSha256))) runtimeError("RUNTIME_PREIMAGE_INVALID");
  if ("content" in input && (typeof input.content !== "string" || Buffer.byteLength(input.content) > ("expectedSha256" in input ? RUNTIME_LIMITS.writeBytes : 16384))) runtimeError("RUNTIME_CONTENT_LIMIT");
  if ("query" in input && (typeof input.query !== "string" || !input.query || input.query.length > 512)) runtimeError("RUNTIME_QUERY_INVALID");
  if (tool === "terminal.execute" && (typeof input.executable !== "string" || !input.executable || input.executable.length > 1024 || /[\x00-\x1f]/.test(input.executable) ||
    !Array.isArray(input.args) || input.args.length > 64 || input.args.some(x => typeof x !== "string" || /\x00/.test(x) || x.length > 2048) ||
    !Number.isInteger(input.timeoutMs) || Number(input.timeoutMs) < 100 || Number(input.timeoutMs) > RUNTIME_LIMITS.timeoutMs)) runtimeError("RUNTIME_PROCESS_INPUT_INVALID");
  return input;
}
export function runtimePaths(input: Record<string, unknown>): string[] { return [...new Set(["path", "source", "destination", "cwd"].filter(k => k in input).map(k => String(input[k])))].sort(); }
export function runtimePermissions(capabilities: readonly RuntimeTool[]): ToolPermission[] {
  const permissions = new Set<ToolPermission>();
  for (const c of capabilities) {
    if (["filesystem.read", "filesystem.list", "filesystem.search", "filesystem.copy", "filesystem.move"].includes(c)) permissions.add("filesystem.read");
    if (["filesystem.write", "filesystem.create", "filesystem.copy", "filesystem.move"].includes(c)) permissions.add("filesystem.write");
    if (["filesystem.delete", "filesystem.move"].includes(c)) permissions.add("filesystem.delete");
    if (c === "terminal.execute") permissions.add("terminal.execute");
  }
  return [...permissions].sort();
}
export function runtimePublicKey(pem: unknown): { publicKey: string; fingerprint: string } {
  if (typeof pem !== "string" || pem.length > 2048 || !pem.startsWith("-----BEGIN PUBLIC KEY-----") || pem.includes("PRIVATE")) runtimeError("RUNTIME_PUBLIC_KEY_INVALID");
  try { const key = createPublicKey(pem); if (key.asymmetricKeyType !== "ed25519") runtimeError("RUNTIME_KEY_TYPE_INVALID");
    const der = key.export({ type: "spki", format: "der" }); return { publicKey: String(key.export({ type: "spki", format: "pem" })), fingerprint: createHash("sha256").update(der).digest("hex") };
  } catch { return runtimeError("RUNTIME_PUBLIC_KEY_INVALID"); }
}
export function runtimeSigningText(challenge: RuntimeChallenge, timestamp: string): string { return JSON.stringify(["SEKHEM_RUNTIME_AUTH_V1", challenge.challengeId, challenge.runtimeId, challenge.connectionEpoch, challenge.nonce, challenge.operation, challenge.bodyDigest, challenge.expiresAt, timestamp]); }
export function runtimeBinding(p: RuntimeProposal): ToolActionBinding { return { userId: p.userId, organizationId: p.organizationId, projectId: p.projectId, conversationId: p.conversationId, workspaceBindingId: p.workspaceBindingId, workspaceBindingVersion: p.workspaceBindingVersion, proposalDigest: p.proposalDigest, planDigest: p.planDigest, inputDigest: p.inputDigest, scopeDigest: p.scopeDigest, verificationDigest: p.verificationDigest, policyVersion: p.policyVersion }; }
export function runtimeRequest(p: RuntimeProposal): ToolRequest { return { id: p.proposalId, toolId: p.toolId, toolVersion: p.toolVersion, input: p.validatedInput, purpose: p.purpose, scope: p.scope, requestedBy: "AGENT", runId: p.runId, planId: p.planId, planVersion: p.planVersion, planStepId: p.planStepId, risk: p.risk, requiresApproval: true }; }
