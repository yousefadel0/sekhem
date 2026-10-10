export type AiGatewayRequestType =
  | "rag_answer_preview"
  | "knowledge_summary_preview"
  | "repository_context_summary_preview"
  | "ai_patch_explanation_preview"
  | "risk_review_preview";

export type AiGatewayPolicyStatus = "ALLOWED_PREVIEW_ONLY" | "BLOCKED";

export type AiGatewayRiskFlag =
  | "SECRET_LIKE_CONTENT"
  | "REPOSITORY_WRITE_REQUESTED"
  | "DEPLOYMENT_REQUESTED"
  | "RAW_LOG_CONTENT"
  | "UNSUPPORTED_REQUEST_TYPE"
  | "HIGH_RISK_ACTION";

export interface AiGatewayPolicyReview {
  policyStatus: AiGatewayPolicyStatus;
  blocked: boolean;
  redactionsApplied: AiGatewayRiskFlag[];
  riskFlags: AiGatewayRiskFlag[];
  safeForPreview: boolean;
  sanitizedInput?: unknown;
}
