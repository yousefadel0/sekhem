import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import type { AiGatewayExecutionAdapter } from "./provider-execution.adapter";
import { VllmOpenAiCompatibleAdapter } from "./providers/vllm-openai-compatible.adapter";

/**
 * Registry resolving execution adapters by provider type for the SEKHEM AI Gateway.
 * Extensible for future providers without altering gateway core routing logic.
 */
@Injectable()
export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, AiGatewayExecutionAdapter>();

  constructor(
    @Optional() @Inject(VllmOpenAiCompatibleAdapter) vllmAdapter?: VllmOpenAiCompatibleAdapter
  ) {
    if (vllmAdapter) {
      this.register(vllmAdapter);
    }
  }

  register(adapter: AiGatewayExecutionAdapter | any): void {
    const providerType = adapter.providerType || "vllm_openai_compatible";
    const executionAdapter: AiGatewayExecutionAdapter =
      typeof adapter.complete === "function" && typeof adapter.stream === "function"
        ? adapter
        : {
          providerType,
          capabilities: adapter.capabilities || Object.freeze(["chat", "streaming", "structured_output"]),
          discoverModels: typeof adapter.discoverModels === "function" ? adapter.discoverModels.bind(adapter) : async () => [],
          discoverModelMetadata: typeof adapter.discoverModelMetadata === "function" ? adapter.discoverModelMetadata.bind(adapter) : async () => [],
          testConnection: typeof adapter.testConnection === "function" ? adapter.testConnection.bind(adapter) : async () => {},
          testStructuredOutputDialect: typeof adapter.testStructuredOutputDialect === "function" ? adapter.testStructuredOutputDialect.bind(adapter) : async () => ({} as any),
          complete: typeof adapter.complete === "function" ? adapter.complete.bind(adapter) : typeof adapter.chat === "function" ? adapter.chat.bind(adapter) : async () => ({ content: "", metadata: {} as any }),
          stream: typeof adapter.stream === "function" ? adapter.stream.bind(adapter) : typeof adapter.complete === "function" ? adapter.complete.bind(adapter) : typeof adapter.chat === "function" ? adapter.chat.bind(adapter) : async () => ({ content: "", metadata: {} as any })
        };
    this.adapters.set(providerType, executionAdapter);
    if (!this.adapters.has("vllm_openai_compatible")) {
      this.adapters.set("vllm_openai_compatible", executionAdapter);
    }
  }

  resolve(providerType?: string): AiGatewayExecutionAdapter {
    const safeType = providerType || "vllm_openai_compatible";
    const adapter = this.adapters.get(safeType);
    if (!adapter) {
      throw new BadRequestException(`No execution adapter registered for provider type '${safeType}'`);
    }
    return adapter;
  }

  hasAdapter(providerType: string): boolean {
    return this.adapters.has(providerType);
  }

  registeredTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}
