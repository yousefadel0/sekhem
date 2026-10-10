import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import type {
  AiGatewayProviderAdapter,
  AiGatewayProviderPreviewRequest,
  AiGatewayProviderPreviewResponse
} from "../ai-gateway-provider.adapter";
import { FetchOpenAiTextPreviewTransport, type OpenAiTextPreviewTransport } from "./openai-text-preview.transport";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_INPUT_LENGTH = 1_000;
const FORBIDDEN_PROVIDER_INPUT = [
  /\b(?:secret|token|password|authorization|api[-_ ]?key|private[-_ ]?key)\b/i,
  /\b(?:raw logs?|stack trace|traceback)\b/i,
  /\b(?:git|gh|npm|pnpm|yarn|docker|helm|kubectl|terraform|vercel|systemctl)\s+\S+/i,
  /\b(?:cat|type|get-content|set-content|add-content|apply_patch)\s+\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /(?:^|\s)[A-Z][A-Z0-9_]{2,}=\S+/,
  /\bat\s+\S+\s+\([^)]+:\d+:\d+\)/i,
  /[\r\n]|```/,
  /(?:^|\s)(?:[A-Za-z]:\\|\/)[^\s]+/
];

@Injectable()
export class OpenAiDryRunProviderAdapter implements AiGatewayProviderAdapter {
  constructor(
    @Inject(FetchOpenAiTextPreviewTransport) private readonly transport: OpenAiTextPreviewTransport,
    @Optional() private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async preview(request: AiGatewayProviderPreviewRequest): Promise<AiGatewayProviderPreviewResponse> {
    this.assertSafeProviderInput(request.question);
    const controller = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    const timeoutCall = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error("OpenAI dry-run request timed out"));
      }, this.timeoutMs);
    });

    try {
      const answerPreview = await Promise.race([
        this.transport.createTextPreview(
          {
            input: request.question
          },
          controller.signal
        ),
        timeoutCall
      ]);
      this.assertSafeProviderInput(answerPreview);

      return {
        providerType: "openai_dry_run",
        providerCallExecuted: true,
        aiGenerated: true,
        responseMode: "openai_dry_run_preview",
        answerPreview,
        citations: request.citations.map((citation) => ({ ...citation })),
        safetyFlags: {
          noNetworkCall: false,
          noCredentials: false,
          noEnvironmentRead: false,
          noRepositoryWrite: true,
          noDeployment: true,
          noEmbedding: true,
          noVectorDb: true,
          readOnly: true,
          previewOnly: true,
          humanReviewRequired: true
        }
      };
    } catch {
      throw new ServiceUnavailableException("AI Gateway provider preview unavailable");
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private assertSafeProviderInput(input: string): void {
    if (input.length > MAX_PROVIDER_INPUT_LENGTH || FORBIDDEN_PROVIDER_INPUT.some((pattern) => pattern.test(input))) {
      throw new ServiceUnavailableException("AI Gateway provider preview unavailable");
    }
  }
}
