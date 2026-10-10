import { Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { ContextMessage } from "./assistant-context-budget";
import type { StructuredOutputDialect } from "./runtime-configuration.dto";
import { PROVIDER_FAILURE_CODES, vllmMetadataFromError, type VllmChatResult, type VllmCallMetadata, type ProviderRequestTiming } from "./providers/vllm-openai-compatible.adapter";

export interface ProviderDiagnostic {
  requestTiming?: ProviderRequestTiming;
  version: 1;
  correlationId: string;
  providerId: string;
  providerType: string;
  modelId: string;
  instructionVersion: "sekhem-assistant-v1";
  instructionFingerprint: string;
  dialect: StructuredOutputDialect | null;
  messageRoleCounts: { system: number; user: number; assistant: number; tool: number; other: number };
  httpStatus: number | null;
  finishReason: string | null;
  refusalFieldPresent: boolean | null;
  refusalAttribution: "UNKNOWN";
  httpClassification?: VllmCallMetadata["httpClassification"] | null;
  failureStage?: VllmCallMetadata["failureStage"] | null;
  failureCode?: VllmCallMetadata["failureCode"] | null;
  durationMs?: number | null;
  configuredMaxOutputTokens?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
}

const logger = new Logger("AiGatewayDiagnostics");
const identifier = (value: string) => /^[\w .:\u2014-]{1,160}$/.test(value) ? value : "[redacted]";
const safeCount = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
/** Whitelist a bounded transport summary; never copy arbitrary provider fields. */
export function inspectionRequestDiagnostic(value: ProviderDiagnostic) {
  const timing = value.requestTiming;
  const bounded = (n: unknown, max: number): n is number => safeCount(n) !== null && (n as number) <= max;
  if (!timing || !bounded(timing.dispatchedAt, 8_640_000_000_000_000) ||
      !bounded(timing.requestBytes, 16_777_216) || !bounded(value.durationMs, 86_400_000) ||
      (timing.responseHeadersAt !== null && (!bounded(timing.responseHeadersAt, 8_640_000_000_000_000) || timing.responseHeadersAt < timing.dispatchedAt))) return undefined;
  return { correlationId: identifier(value.correlationId), providerId: identifier(value.providerId),
    providerType: identifier(value.providerType), modelId: identifier(value.modelId),
    dispatchedAt: timing.dispatchedAt, responseHeadersAt: timing.responseHeadersAt,
    requestBytes: timing.requestBytes, durationMs: value.durationMs,
    providerOrigin: typeof timing.providerOrigin === "string" && /^https?:\/\/[a-zA-Z0-9.\-\[\]:]{1,253}$/.test(timing.providerOrigin) ? timing.providerOrigin : null,
    deadlineAt: bounded(timing.deadlineAt, 8_640_000_000_000_000) && timing.deadlineAt >= timing.dispatchedAt ? timing.deadlineAt : null,
    responseCompleteAt: bounded(timing.responseCompleteAt, 8_640_000_000_000_000) && timing.responseHeadersAt !== null && timing.responseCompleteAt >= timing.responseHeadersAt ? timing.responseCompleteAt : null,
    httpStatus: bounded(value.httpStatus, 599) && value.httpStatus >= 100 ? value.httpStatus : null,
    classification: ["SUCCESS", "UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "PROVIDER_ERROR", "INVALID_JSON", "INVALID_SCHEMA"].includes(value.httpClassification ?? "") ? value.httpClassification : null,
    stage: ["REQUEST", "RESPONSE_BODY", "RESPONSE_CONTENT"].includes(value.failureStage ?? "") ? value.failureStage : null,
    code: PROVIDER_FAILURE_CODES.includes(value.failureCode!) ? value.failureCode : null };
}
export const diagnosticFromError = (error: unknown): ProviderDiagnostic | undefined =>
  error instanceof Error ? (error as Error & { providerDiagnostic?: ProviderDiagnostic }).providerDiagnostic : undefined;

/** No request/response bodies, credential-bearing URLs, headers, memory values, or refusal text leave this boundary. */
export async function traceProviderCall(input: {
  correlationId: string; providerId: string; providerType: string; modelId: string;
  systemPrompt: string; messages: ContextMessage[]; dialect?: StructuredOutputDialect;
  onDiagnostic?: (diagnostic: ProviderDiagnostic) => void;
}, invoke: () => Promise<VllmChatResult>): Promise<VllmChatResult & { diagnostic: ProviderDiagnostic }> {
  const counts = { system: 0, user: 0, assistant: 0, tool: 0, other: 0 };
  for (const message of input.messages) {
    const role = ["system", "user", "assistant", "tool"].includes(message.role) ? message.role as keyof typeof counts : "other";
    counts[role]++;
  }
  const finish = (metadata: VllmChatResult["metadata"] | null): ProviderDiagnostic => {
    const diagnostic: ProviderDiagnostic = {
      version: 1, correlationId: identifier(input.correlationId), providerId: identifier(input.providerId),
      providerType: identifier(input.providerType), modelId: identifier(input.modelId),
      instructionVersion: "sekhem-assistant-v1",
      instructionFingerprint: createHash("sha256").update(input.systemPrompt).digest("hex"),
      dialect: input.dialect ?? null, messageRoleCounts: counts,
      httpStatus: metadata?.httpStatus && metadata.httpStatus >= 100 && metadata.httpStatus <= 599 ? metadata.httpStatus : null,
      finishReason: metadata?.finishReason ? ["stop", "length", "tool_calls", "function_call", "content_filter", "eos_token", "error"].includes(metadata.finishReason) ? metadata.finishReason : "OTHER" : null,
      refusalFieldPresent: typeof metadata?.refusalFieldPresent === "boolean" ? metadata.refusalFieldPresent : null,
      refusalAttribution: "UNKNOWN",
      httpClassification: metadata?.httpClassification && ["SUCCESS", "UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "PROVIDER_ERROR", "INVALID_JSON", "INVALID_SCHEMA"].includes(metadata.httpClassification) ? metadata.httpClassification : null,
      failureStage: metadata?.failureStage && ["REQUEST", "RESPONSE_BODY", "RESPONSE_CONTENT"].includes(metadata.failureStage) ? metadata.failureStage : null,
      failureCode: metadata?.failureCode && PROVIDER_FAILURE_CODES.includes(metadata.failureCode) ? metadata.failureCode : null,
      durationMs: safeCount(metadata?.durationMs), configuredMaxOutputTokens: safeCount(metadata?.configuredMaxOutputTokens),
      promptTokens: safeCount(metadata?.promptTokens), completionTokens: safeCount(metadata?.completionTokens),
      ...(metadata?.requestTiming ? { requestTiming: { dispatchedAt: metadata.requestTiming.dispatchedAt,
        responseHeadersAt: metadata.requestTiming.responseHeadersAt, requestBytes: metadata.requestTiming.requestBytes,
        providerOrigin: metadata.requestTiming.providerOrigin, deadlineAt: metadata.requestTiming.deadlineAt, responseCompleteAt: metadata.requestTiming.responseCompleteAt } } : {})
    };
    try { logger.log(JSON.stringify(diagnostic)); } catch { /* logging only */ }
    // Diagnostics must never change inference success/failure semantics.
    try { input.onDiagnostic?.(diagnostic); } catch { /* diagnostic consumer only */ }
    return diagnostic;
  };
  try {
    const result = await invoke();
    return { ...result, diagnostic: finish(result.metadata) };
  } catch (error) {
    const diagnostic = finish(vllmMetadataFromError(error));
    if (error instanceof Error) { try { Object.assign(error, { providerDiagnostic: diagnostic }); } catch { /* preserve original failure */ } }
    throw error;
  }
}
