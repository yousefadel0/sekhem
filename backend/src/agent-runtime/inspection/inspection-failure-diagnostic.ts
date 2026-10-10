import { diagnosticFromError, inspectionRequestDiagnostic, type ProviderDiagnostic } from "../../ai-gateway/provider-diagnostic";
import { inspectionValidationDiagnostic } from "./inspection-understanding";
import { PROVIDER_FAILURE_CODES } from "../../ai-gateway/providers/vllm-openai-compatible.adapter";

export type InspectionFailureStage = "context" | "provider" | "parsing" | "contract_validation" | "grounding" | "checkpoint" | "persistence" | "cancellation" | "deadline" | "authorization" | "observation";
/** Per-advance observation only; never authority, persisted input, or replay state. */
export interface InspectionFailureTrace { stage: InspectionFailureStage; provider?: ProviderDiagnostic; responseReceived?: boolean }
const codes = ["USER_CANCELLED", "MODEL_INTERRUPTED", "OUTPUT_TRUNCATED", "INSPECTION_REASONING_TIMEOUT", "INSPECTION_REASONING_FAILED",
  "INVALID_MODEL_PROPOSAL", "INSPECTION_SCOPE_DENIED", "RUNTIME_GRANT_INVALID", "INSPECTION_RUN_CHANGED", "INSPECTION_REASONING_STALE",
  "INSPECTION_REASONING_REPLAY_BLOCKED", "INSPECTION_CONTEXT_BUDGET_EXCEEDED", "INSPECTION_CONTEXT_INVALID", "INSUFFICIENT_EVIDENCE", "PLAN_NOT_READY",
  "RUNTIME_OFFLINE", "RUNTIME_REVOKED", "RUNTIME_IDENTITY_MISMATCH", "RUNTIME_AUTHORIZING_SESSION_INVALID", "RUNTIME_PROJECT_SCOPE_INVALID",
  "RUNTIME_OWNER_INVALID", "INSPECTION_CONVERSATION_DENIED", "INSPECTION_RUN_MISSING", "WORKSPACE_BINDING_CHANGED", "OUTCOME_UNKNOWN",
  "FAILED", "TIMED_OUT", "EXECUTION_FAILED", "P2002", "P2003", "P2025", "P2028", "P1001", "P1002"];
export function inspectionFailureDiagnostic(runId: string, error: unknown, trace: InspectionFailureTrace) {
  const provider = diagnosticFromError(error) ?? trace.provider;
  const validation = inspectionValidationDiagnostic(error);
  const candidate = error instanceof Error ? error.message : "";
  const databaseCode = error instanceof Error && "code" in error && typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : "";
  // Prisma codes are five bounded characters; retain the code, never its message,
  // query, connection string or raw metadata. New database failures must remain diagnosable.
  const code = validation?.issues[0]?.code ?? (codes.includes(candidate) ? candidate : databaseCode ? databaseCode
    : provider?.failureCode && PROVIDER_FAILURE_CODES.includes(provider.failureCode) ? provider.failureCode : "UNEXPECTED_EXCEPTION");
  const deadline = provider?.failureCode === "CLIENT_DEADLINE" || candidate === "INSPECTION_REASONING_TIMEOUT" ||
    (error instanceof Error && "inspectionReasoningFailure" in error && error.inspectionReasoningFailure === "INSPECTION_REASONING_TIMEOUT");
  const stage = ["INSPECTION_CONTEXT_BUDGET_EXCEEDED", "INSPECTION_CONTEXT_INVALID"].includes(candidate) ? "context" : deadline ? "deadline" : ["USER_CANCELLED", "MODEL_INTERRUPTED"].includes(candidate) ? "cancellation"
    : validation?.issues.some(i => i.code === "INVALID_JSON") || provider?.httpClassification === "INVALID_JSON" ? "parsing"
    : provider?.httpClassification === "INVALID_SCHEMA" ? "contract_validation" : trace.stage;
  const request = provider && inspectionRequestDiagnostic(provider);
  return { version: 1, runId, stage, code, category: validation ? "VALIDATION" : deadline ? "DEADLINE" : stage === "cancellation" ? "CANCELLATION"
    : databaseCode ? "PERSISTENCE" : stage === "provider" ? "PROVIDER" : "APPLICATION",
    responseReceived: trace.responseReceived === true || provider?.httpStatus != null || provider?.httpClassification === "SUCCESS" || provider?.requestTiming?.responseCompleteAt != null,
    correlationId: provider && /^ai-[a-z-]{1,40}[a-f0-9-]{36}$/.test(provider.correlationId) ? provider.correlationId : null,
    httpStatus: provider?.httpStatus != null && Number.isInteger(provider.httpStatus) && provider.httpStatus >= 100 && provider.httpStatus <= 599 ? provider.httpStatus : null,
    ...(request ? { request } : {}), ...(validation ? { validation } : {}) };
}
