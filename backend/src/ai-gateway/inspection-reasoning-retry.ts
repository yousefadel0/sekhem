import { createHash } from "node:crypto";
import { diagnosticFromError } from "./provider-diagnostic";

export type ReasoningTerminalReason = "RESPONSE_RECEIVED" | "DEADLINE_EXHAUSTED" | "TRANSPORT_TIMEOUT" | "TRANSPORT_FAILURE" | "MODEL_REJECTION" | "MALFORMED_RESPONSE";
export interface InspectionReasoningLifecycle {
  beforeAttempt(state: { requestId: string; deadlineAt: number; attempt: number }): Promise<void>;
  settled(state: { requestId: string; attempts: number; terminalReason: ReasoningTerminalReason }): Promise<void>;
}

function classification(error: unknown): ReasoningTerminalReason {
  const d = diagnosticFromError(error);
  if (d?.httpClassification === "TIMEOUT" || d?.failureCode === "CLIENT_DEADLINE") return "TRANSPORT_TIMEOUT";
  if (d?.httpClassification === "INVALID_JSON" || d?.httpClassification === "INVALID_SCHEMA") return "MALFORMED_RESPONSE";
  if (d?.failureStage === "RESPONSE_CONTENT" || d?.httpClassification === "SUCCESS") return "MODEL_REJECTION";
  return "TRANSPORT_FAILURE";
}
function eligible(error: unknown) {
  const d = diagnosticFromError(error);
  if (d?.failureStage !== "REQUEST" || d.finishReason != null || d.refusalFieldPresent === true) return false;
  return ["CLIENT_DEADLINE", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET"].includes(d.failureCode ?? "") ||
    (d.failureCode === "HTTP_REJECTION" && [408, 504].includes(d.httpStatus ?? 0));
}

/** Only model reasoning is retried. No tool dispatch or workflow advancement occurs here. */
export async function inspectionReasoningRetry<T>(input: {
  request: unknown; timeoutMs: number; lifecycle: InspectionReasoningLifecycle;
  invoke(remainingMs: number): Promise<T>; now?: () => number;
}): Promise<T> {
  const now = input.now ?? Date.now;
  const requestId = createHash("sha256").update(JSON.stringify(input.request)).digest("hex");
  const deadlineAt = now() + input.timeoutMs;
  let attempts = 0;
  const fail = async (reason: ReasoningTerminalReason, cause?: unknown): Promise<never> => {
    await input.lifecycle.settled({ requestId, attempts, terminalReason: reason });
    const error = cause instanceof Error ? cause : new Error("Inspection reasoning deadline exhausted");
    Object.assign(error, { inspectionReasoningFailure: reason === "DEADLINE_EXHAUSTED" || reason === "TRANSPORT_TIMEOUT"
      ? "INSPECTION_REASONING_TIMEOUT" : "INSPECTION_REASONING_FAILED" });
    throw error;
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (now() >= deadlineAt) return fail("DEADLINE_EXHAUSTED");
    await input.lifecycle.beforeAttempt({ requestId, deadlineAt, attempt });
    attempts = attempt;
    const remaining = deadlineAt - now();
    if (remaining <= 0) return fail("DEADLINE_EXHAUSTED");
    let result: T;
    try { result = await input.invoke(remaining); }
    catch (error) {
      if (now() >= deadlineAt) return fail("DEADLINE_EXHAUSTED", error);
      if (attempt === 1 && eligible(error)) continue;
      return fail(classification(error), error);
    }
    if (now() >= deadlineAt) return fail("DEADLINE_EXHAUSTED");
    await input.lifecycle.settled({ requestId, attempts, terminalReason: "RESPONSE_RECEIVED" });
    return result;
  }
  throw new Error("Unreachable reasoning retry state");
}
