import type { ContextBudgetMetadata } from "./assistant-context-budget";
import type { ProviderDiagnostic } from "./provider-diagnostic";

export type AiGatewayPreviewRequestType =
  | "rag_answer_preview"
  | "knowledge_summary_preview"
  | "repository_context_summary_preview"
  | "ai_patch_explanation_preview"
  | "risk_review_preview";

export type AiGatewayPreviewSourceScope = "knowledge_base" | "repository_evidence";

export interface AiGatewayPreviewRequestDto {
  requestType: AiGatewayPreviewRequestType;
  question: string;
  sourceScope: AiGatewayPreviewSourceScope[];
  requestedBy: string;
}

export interface AiGatewayPreviewResponseDto {
  gatewayRequestId: string;
  status: "GATEWAY_PREVIEW_ONLY" | "GATEWAY_PREVIEW_BLOCKED";
  nextGate: "POLICY_REVIEW_REQUIRED";
  requestType?: AiGatewayPreviewRequestType;
  policyStatus: "ALLOWED_PREVIEW_ONLY" | "BLOCKED";
  blocked: boolean;
  riskFlags: string[];
  redactionsApplied: string[];
  providerCallExecuted: boolean;
  aiGenerated: boolean;
  responseMode: "deterministic_preview" | "openai_dry_run_preview";
  noProviderCall: boolean;
  noAiExecution: boolean;
  humanReviewRequired: true;
  citationsRequired: true;
  readOnly: true;
  previewOnly: true;
  answerPreview?: string;
  citations?: Array<{
    citationRef: string;
    citationLabel: string;
  }>;
}

export interface AiAssistantResponseDto {
  diagnostic?: ProviderDiagnostic;
  httpStatus?: number | null;
  contextBudget?: ContextBudgetMetadata;
  status: "REAL_PROVIDER" | "PROVIDER_UNAVAILABLE" | "POLICY_BLOCKED";
  answer: string | null;
  correlationId: string;
  providerId: string | null;
  modelId: string | null;
  providerCallExecuted: boolean;
  durationMs: number | null;
  httpClassification: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  configuredMaxOutputTokens: number | null;
  evidence: [];
  humanReviewRequired: true;
}
