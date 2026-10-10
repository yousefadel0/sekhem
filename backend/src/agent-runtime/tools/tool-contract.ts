import { createHash } from "node:crypto";
import type { AuthSubject } from "../../auth/resource-authz.service";

export const TOOL_PERMISSIONS = ["filesystem.read", "filesystem.write", "filesystem.delete", "terminal.execute", "git.read", "git.write", "package.install", "browser.open"] as const;
export type ToolPermission = typeof TOOL_PERMISSIONS[number];
export type ToolRisk = "LOW" | "MEDIUM" | "HIGH";
export type ToolApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "CANCELLED";
/** Bounded JSON Schema subset used by definitions and the input validator. */
export interface ToolJsonSchema {
  type: "object" | "string" | "array" | "boolean" | "integer";
  minimum?: number;
  maximum?: number;
  properties?: Record<string, ToolJsonSchema>;
  required?: readonly string[];
  additionalProperties?: false;
  items?: ToolJsonSchema;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  enum?: readonly string[];
}
export interface AgentTool {
  id: string;
  version: string;
  category: "FILESYSTEM" | "TERMINAL" | "GIT";
  description: string;
  inputSchema: ToolJsonSchema;
  outputSchema: ToolJsonSchema;
  requiredPermissions: readonly ToolPermission[];
  riskLevel: ToolRisk;
  scopeRequirements: { kind: "WORKSPACE"; wholeWorkspace: boolean };
  approvalRequirement: "REQUIRED" | "NOT_REQUIRED";
  executionMode: "DEFINITION_ONLY";
  executionCapability: "UNAVAILABLE";
  /** Observable evidence to require later; these descriptions never run verification. */
  verificationExpectations: readonly string[];
  supportsDryRun: boolean;
  reversible: boolean;
  /** Server-owned schema properties that identify every affected path. */
  pathFields: readonly string[];
}
export interface ToolScope { workspaceId: string; paths: string[] }
export interface ToolRequest {
  id: string;
  toolId: string;
  toolVersion: string;
  input: Record<string, unknown>;
  purpose: string;
  scope: ToolScope;
  requestedBy: "AGENT";
  runId: string;
  planId: string;
  planVersion: number;
  planStepId: string;
  risk: ToolRisk;
  requiresApproval: boolean;
}
/** Trusted host input, never deserialized from a model, HTTP body, or evidence. */
export interface TrustedToolWorkspace {
  /** Validated server-side Workspace binding layered over the existing machine grant. */
  runtimeWorkspace?: { workspaceId: string; bindingVersion: number; rootPath: string; runtimeFingerprint: string };
  /** Backend-loaded durable grant only; never accepted in a client tool request. */
  runtimeGrant?: { mode: "TRUSTED_MACHINE"; runtimeId: string; grantId: string; projectId: string; version: number; capabilities: readonly string[] };
  workspaceId: string;
  projectId: string;
  trustedRoot: string;
  /** Deployment-owned allowlist from WorkspaceBindingService, never request data. */
  authorizedRoots?: string;
  allowedPaths: readonly string[];
  permissions: readonly ToolPermission[];
}
export interface PermissionDecision {
  allowed: boolean;
  permission: ToolPermission;
  reason: "GRANTED" | "WORKSPACE_GRANT_MISSING" | "RESOURCE_PERMISSION_DENIED";
  scope: ToolScope;
}
export type ToolBlockCode = "INVALID_TOOL" | "INVALID_INPUT" | "INVALID_PLAN_STEP" | "DEPENDENCY_NOT_SATISFIED" | "PERMISSION_DENIED" | "SCOPE_VIOLATION" | "POLICY_BLOCKED" | "APPROVAL_INVALID" | "APPROVAL_EXPIRED" | "INSUFFICIENT_SCOPE" | "RUN_NOT_ACTIVE";
export interface AuthorizationDecision {
  status: "AUTHORIZED" | "APPROVAL_REQUIRED" | "BLOCKED";
  code?: ToolBlockCode;
  request?: ToolRequest;
  approvalId?: string;
  permissions?: PermissionDecision[];
  /** A decision is never an executable permit or an assertion of confinement. */
  executionAllowed: false;
}
export type AgentDecision =
  | { type: "EXECUTE_TOOL" | "REQUEST_APPROVAL"; toolRequest: unknown; approvalId?: string }
  | { type: "ASK_USER" | "REPLAN" | "VERIFY" | "COMPLETE" | "STOP" };
export interface ToolApprovalBinding {
  taskConsent?: import("./consent.contract").TaskConsentReference;
  workspaceRead?: import("../../trusted-runtime/runtime.contract").WorkspaceReadCoverage;
  kind: "TOOL_AUTHORIZATION";
  version: 1;
  fingerprint: string;
  requestId: string;
  toolId: string;
  toolVersion: string;
  runId: string;
  planId: string;
  planVersion: number;
  planDigest: string;
  planStepId: string;
  risk: ToolRisk;
  scope: ToolScope;
  requestedBy: string;
  /** Server-created Phase 0A binding; never accepted from a model or HTTP body. */
  actionBinding?: ToolActionBinding;
}
export interface ToolActionBinding {
  userId: string; projectId: string; organizationId: string; conversationId: string;
  workspaceBindingId: string; workspaceBindingVersion: string; proposalDigest: string;
  planDigest: string; inputDigest: string; scopeDigest: string; verificationDigest: string; policyVersion: string;
}
export function toolSubject(claims: { sub: string; email: string; displayName: string; role: AuthSubject["role"]; organizationId?: string }): AuthSubject {
  return { userId: claims.sub, email: claims.email, displayName: claims.displayName, role: claims.role,
    organizationId: claims.organizationId, isSystemAdmin: claims.role === "Admin" };
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
export function validToolId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value);
}
/** Preflight before cloning/hashing. JSON only, bounded depth/nodes/text; cycles fail. */
export function boundedToolJson(value: unknown): boolean {
  let nodes = 0, chars = 0;
  const seen = new Set<object>();
  const visit = (v: unknown, depth: number): boolean => {
    if (++nodes > 512 || depth > 8) return false;
    if (typeof v === "string") { chars += v.length; return chars <= 32768; }
    if (v === null || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (!v || typeof v !== "object" || seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.length <= 128 && v.every(x => visit(x, depth + 1));
    if (!isRecord(v)) return false;
    const keys = Object.keys(v);
    return keys.length <= 32 && keys.every(k => {
      const property = Object.getOwnPropertyDescriptor(v, k);
      return k.length <= 128 && !["__proto__", "constructor", "prototype"].includes(k) && !!property && "value" in property && visit(property.value, depth + 1);
    });
  };
  return visit(value, 0);
}
export function matchesToolSchema(value: unknown, schema: ToolJsonSchema): boolean {
  if (!boundedToolJson(value)) return false;
  const match = (v: unknown, s: ToolJsonSchema): boolean => {
    if (s.type === "string") return typeof v === "string" && v.length >= (s.minLength ?? 0) && v.length <= (s.maxLength ?? 0) && (!s.enum || s.enum.includes(v));
    if (s.type === "boolean") return typeof v === "boolean";
    if (s.type === "integer") return typeof v === "number" && Number.isSafeInteger(v) && v >= (s.minimum ?? 0) && v <= (s.maximum ?? 0);
    if (s.type === "array") return Array.isArray(v) && v.length <= (s.maxItems ?? 0) && !!s.items && v.every(x => match(x, s.items!));
    if (s.type !== "object" || !isRecord(v) || s.additionalProperties !== false) return false;
    return (s.required ?? []).every(k => Object.prototype.hasOwnProperty.call(v, k)) && Object.keys(v).every(k => !!s.properties?.[k] && match(v[k], s.properties[k]));
  };
  return match(value, schema);
}
export function toolDigest(value: unknown): string {
  const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
    : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
  return createHash("sha256").update(canonical(value)).digest("hex");
}
