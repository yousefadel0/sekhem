import { AiGatewayService } from "../../src/ai-gateway/ai-gateway.service";
import { AiGatewayPolicyService } from "../../src/ai-gateway/ai-gateway-policy.service";
import { VllmOpenAiCompatibleAdapter } from "../../src/ai-gateway/providers/vllm-openai-compatible.adapter";
import { ProviderAdapterRegistry } from "../../src/ai-gateway/provider-adapter.registry";
import { AgentContextBuilderService } from "../../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentContextSerializerService } from "../../src/agent-runtime/understanding/agent-context-serializer.service";
import { AgentUnderstandingService } from "../../src/agent-runtime/understanding/agent-understanding.service";
import { EvidenceCollectorService } from "../../src/agent-runtime/understanding/evidence-collector.service";

export function gatewayHarness(contextWindow = 262_144, maxOutputTokens = 512) {
  const calls: any[] = [];
  let policyReviews = 0;
  const policy = new AiGatewayPolicyService();
  const review = policy.reviewRequest.bind(policy);
  policy.reviewRequest = (request) => { policyReviews++; return review(request); };
  const adapter = new VllmOpenAiCompatibleAdapter(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    if (body.stream) {
      return new Response('data: {"choices":[{"delta":{"content":"Grounded answer"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
        { headers: { "content-type": "text/event-stream" } });
    }
    return Response.json({ choices: [{ message: { content: "Grounded answer" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 500, completion_tokens: 4 } });
  });
  const model = { id: "model-test", modelId: "GLM-5.2-Abliterated", enabled: true,
    defaultForProvider: true, contextWindow, maxOutputTokens };
  const runtime = {
    providers: async () => [{ id: "provider-test", enabled: true, healthState: "healthy", providerType: adapter.providerType }],
    providerForUse: async () => ({ id: "provider-test", providerType: adapter.providerType,
      baseUrl: "https://provider.invalid/v1", apiKey: null, defaultTimeoutMs: 1000, structuredOutputDialect: "OPENAI_JSON_SCHEMA" }),
    models: async () => [model]
  };
  const gateway = new AiGatewayService(policy, {} as never, {} as never, {} as never, {} as never,
    "mock", runtime as never, adapter, new ProviderAdapterRegistry(adapter));
  return { gateway, calls, adapter, model, policyReviews: () => policyReviews };
}

export function contextHarness() {
  let reads = 0;
  const collector = new EvidenceCollectorService({
    read: async ({ attachmentId, conversationId }: { attachmentId: string; conversationId: string }) => {
      reads++;
      return { sourceType: "CONVERSATION_ATTACHMENT", conversationId, attachmentId,
        fileName: `${attachmentId}.txt`, mimeType: "text/plain", size: 12_000, status: "OK",
        normalizedContent: { text: (`${attachmentId}: authorization boundaries and technical requirements.\n`).repeat(300),
          extractorId: "text", detectedMime: "text/plain", truncated: false }, warnings: [],
        provenance: { sourceType: "CONVERSATION_ATTACHMENT", conversationId, attachmentId } };
    }
  } as never);
  const builder = new AgentContextBuilderService(new AgentUnderstandingService(), collector, new AgentContextSerializerService());
  const build = (instruction = "Explain the attached requirements and compare authorization boundaries.", count = 3) => builder.build({
    userId: "user-1", projectId: "project-1", conversationId: "conv-1", userRole: "PM",
    availableCapabilities: ["attachment_reader"], instruction,
    attachmentIds: Array.from({ length: count }, (_, i) => `att-${i + 1}`), hasConversationHistory: true
  });
  return { builder, build, reads: () => reads };
}
