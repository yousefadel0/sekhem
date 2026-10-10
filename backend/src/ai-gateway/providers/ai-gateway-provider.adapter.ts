import type { AiGatewayPreviewRequestType } from "../ai-gateway.dto";

export interface AiGatewayProviderCitation {
  citationRef: string;
  citationLabel: string;
}

export interface AiGatewayProviderPreviewRequest {
  requestType: AiGatewayPreviewRequestType;
  question: string;
  citations: AiGatewayProviderCitation[];
}

export interface AiGatewayProviderPreviewResponse {
  providerType: "mock_provider" | "openai_dry_run";
  providerCallExecuted: boolean;
  aiGenerated: boolean;
  responseMode: "deterministic_preview" | "openai_dry_run_preview";
  answerPreview: string;
  citations: AiGatewayProviderCitation[];
  safetyFlags: {
    noNetworkCall: boolean;
    noCredentials: boolean;
    noEnvironmentRead: boolean;
    noRepositoryWrite: true;
    noDeployment: true;
    noEmbedding: true;
    noVectorDb: true;
    readOnly: true;
    previewOnly: true;
    humanReviewRequired: true;
  };
}

export interface AiGatewayProviderAdapter {
  preview(request: AiGatewayProviderPreviewRequest): Promise<AiGatewayProviderPreviewResponse>;
}
