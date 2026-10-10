import { BadRequestException } from "@nestjs/common";
import { ASSISTANT_CONTEXT_LIMITS, AssistantContextBudgetError, prepareAssistantContext } from "./assistant-context-budget";
import { chatCompletionBody } from "./providers/vllm-openai-compatible.adapter";
import type { VllmChatRequest } from "./providers/vllm-openai-compatible.adapter";

/** Reuse the existing conservative input allowance, expressed as a hard UTF-8 transport-byte ceiling. */
export const INSPECTION_CONTEXT_BYTES = ASSISTANT_CONTEXT_LIMITS.inputTokens - ASSISTANT_CONTEXT_LIMITS.templateTokens;
type Input = Parameters<typeof prepareAssistantContext>[0];

export function prepareInspectionContext(input: Input & { modelId: string; dialect?: VllmChatRequest["dialect"] }) {
  let question = input.question;
  const marker = "\n[INSPECTION STATE]\n", index = question.lastIndexOf(marker);
  let state: Record<string, unknown> | undefined;
  if (index >= 0) {
    try { state = JSON.parse(question.slice(index + marker.length)); }
    catch { throw new BadRequestException("INSPECTION_CONTEXT_INVALID"); }
  }
  const evicted: string[] = [];
  // Current objective, sources, user follow-ups, active history, projected events
  // and schema stay whole. Older quoted assistant reports are advisory context;
  // their complete durable conversation records are never changed.
  const optional = ["priorFindings", "groundingFeedback"];
  const historical = state?.historicalReferenceData as { messages?: Array<{ sourceRole?: string; content?: string }>; omittedAssistantMessages?: number } | undefined;
  const removable = Array.isArray(historical?.messages) ? historical.messages.filter(m => m.sourceRole === "assistant").length : 0;
  for (let attempt = 0; attempt <= optional.length + removable; attempt++) {
    try {
      const prepared = prepareAssistantContext({ ...input, question });
      if (prepared.metadata.history.droppedIndices.length) throw new AssistantContextBudgetError("ASSISTANT_CONTEXT_BUDGET");
      const body = chatCompletionBody({ modelId: input.modelId, messages: prepared.messages,
        maxOutputTokens: prepared.maxOutputTokens,
        systemPrompt: prepared.systemPrompt, userPrompt: prepared.userPrompt,
        structuredOutput: input.structuredOutput as VllmChatRequest["structuredOutput"], dialect: input.dialect }, prepared.maxOutputTokens);
      const bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
      if (bytes <= INSPECTION_CONTEXT_BYTES) return { ...prepared, inspectionBudget: { bytes, limit: INSPECTION_CONTEXT_BYTES, evicted } };
    } catch (error) { if (!(error instanceof AssistantContextBudgetError) || error.code !== "ASSISTANT_CONTEXT_BUDGET") throw error; }
    if (!state || attempt === optional.length + removable) break;
    if (attempt < optional.length) {
      const key = optional[attempt];
      if (state[key] != null) { state[key] = null; evicted.push(key); }
    } else {
      const assistantIndex = historical!.messages!.findIndex(m => m.sourceRole === "assistant");
      if (assistantIndex < 0) break;
      historical!.messages!.splice(assistantIndex, 1);
      historical!.omittedAssistantMessages = (historical!.omittedAssistantMessages ?? 0) + 1;
      evicted.push("historicalReferenceData.assistant");
    }
    question = input.question.slice(0, index) + marker + JSON.stringify(state);
  }
  throw new BadRequestException("INSPECTION_CONTEXT_BUDGET_EXCEEDED");
}
