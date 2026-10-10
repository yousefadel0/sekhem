import type { StructuredOutputDialect } from "./runtime-configuration.dto";
import type {
  VllmConnectionConfiguration,
  VllmChatRequest,
  VllmChatResult,
  OpenAiCompatibleModelMetadata,
  ProviderDialectTestDiagnostic
} from "./providers/vllm-openai-compatible.adapter";

export interface ProviderStreamChunk {
  delta: string;
  accumulated: string;
}

export interface ProviderStreamOptions {
  onChunk?: (chunk: ProviderStreamChunk) => void;
  signal?: AbortSignal;
}

/**
 * Unified provider-agnostic execution contract for SEKHEM AI Gateway.
 * Supports completion, real streaming with cancellation, model discovery,
 * and dialect validation.
 */
export interface AiGatewayExecutionAdapter {
  readonly providerType: string;
  readonly capabilities: readonly string[];

  discoverModels(configuration: VllmConnectionConfiguration): Promise<string[]>;
  discoverModelMetadata(configuration: VllmConnectionConfiguration): Promise<OpenAiCompatibleModelMetadata[]>;
  testConnection(configuration: VllmConnectionConfiguration): Promise<void>;
  testStructuredOutputDialect(
    configuration: VllmConnectionConfiguration,
    modelId: string,
    dialect: StructuredOutputDialect,
    configuredMaxOutputTokens: number
  ): Promise<ProviderDialectTestDiagnostic>;

  complete(configuration: VllmConnectionConfiguration, request: VllmChatRequest): Promise<VllmChatResult>;
  stream(
    configuration: VllmConnectionConfiguration,
    request: VllmChatRequest,
    options?: ProviderStreamOptions
  ): Promise<VllmChatResult>;
}
