import { Injectable } from "@nestjs/common";
import type {
  AiGatewayProviderAdapter,
  AiGatewayProviderPreviewRequest,
  AiGatewayProviderPreviewResponse
} from "./ai-gateway-provider.adapter";

@Injectable()
export class MockAiGatewayProviderAdapter implements AiGatewayProviderAdapter {
  async preview(request: AiGatewayProviderPreviewRequest): Promise<AiGatewayProviderPreviewResponse> {
    return {
      providerType: "mock_provider",
      providerCallExecuted: false,
      aiGenerated: false,
      responseMode: "deterministic_preview",
      answerPreview:
        "Reviewed sources are available for a controlled answer preview. This deterministic sample requires human review before any downstream action.",
      citations: request.citations.map((citation) => ({ ...citation })),
      safetyFlags: {
        noNetworkCall: true,
        noCredentials: true,
        noEnvironmentRead: true,
        noRepositoryWrite: true,
        noDeployment: true,
        noEmbedding: true,
        noVectorDb: true,
        readOnly: true,
        previewOnly: true,
        humanReviewRequired: true
      }
    };
  }
}
