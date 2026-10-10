import { createHash, randomUUID } from "node:crypto";
export const stages = ["DISPATCH_RECEIVED", "CHALLENGE_OBSERVED", "HTTP_SUBMIT", "HTTP_HEADERS", "HTTP_BODY_OBSERVED", "HTTP_FAILED", "BACKEND_RECEIVED", "BACKEND_REJECTED", "AUTH_VERIFIED", "CONSUMPTION_STAGED", "TX_REQUESTED", "TX_CALLBACK_ENTERED", "TX_CALLBACK_COMPLETED", "TX_COMMITTED", "TX_REJECTED_COMMIT_UNCONFIRMED", "START_EVENT_STAGED", "RESPONSE_READY", "RESPONSE_FINISHED", "RESPONSE_CLOSED_EARLY", "EXECUTION_GATE", "START_FAILED"] as const;
type Stage = typeof stages[number];
type Fields = { phase?: "challenge" | "started"; status?: number; execute?: boolean; cancel?: boolean; eventCommitted?: boolean; category?: string };
const categories = new Set(["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "ENETDOWN", "P2028", "P2024", "P2034", "P1001", "P1002", "P1017", "RUNTIME_SIGNATURE_INVALID", "RUNTIME_CHALLENGE_INVALID", "RUNTIME_CHALLENGE_UNKNOWN", "RUNTIME_AUTH_REPLAY", "RUNTIME_IDENTITY_REVOKED_OR_STALE", "RUNTIME_AUTH_REQUIRED", "RUNTIME_HTTPS_REQUIRED", "RUNTIME_CONNECTION_FENCED", "RUNTIME_RESULT_ATTRIBUTION_INVALID", "RUNTIME_RESPONSE_LIMIT", "HTTP_REJECTED", "UNKNOWN"]);
function ref(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    ? createHash("sha256").update(value).digest("hex") : undefined;
}
export function failureCategory(error: unknown): string {
  try {
    const e = error as { code?: unknown; message?: unknown; statusCode?: unknown };
    if (typeof e?.code === "string" && categories.has(e.code)) return e.code;
    if (typeof e?.message === "string" && categories.has(e.message)) return e.message;
    if (typeof e?.statusCode === "number") return "HTTP_REJECTED";
  } catch { /* diagnostics are non-authoritative */ }
  return "UNKNOWN";
}
export function startDiagnostic(side: "runtime" | "backend", ids: { executionId?: unknown; agentRunId?: unknown; challengeId?: unknown }, sink: (line: string) => void = line => console.info(line)) {
  let began: number, attempt: string;
  try { began = performance.now(); attempt = randomUUID(); }
  catch { return { correlate(_values: typeof ids) {}, emit(_stage: Stage, _fields: Fields = {}) {} }; }
  let executionRef: string | undefined, runRef: string | undefined, challengeRef: string | undefined;
  const correlate = (values: typeof ids) => { try { executionRef = ref(values.executionId) ?? executionRef; runRef = ref(values.agentRunId) ?? runRef; challengeRef = ref(values.challengeId) ?? challengeRef; } catch {} };
  correlate(ids);
  return {
    correlate,
    emit(stage: Stage, fields: Fields = {}) {
      try {
        if (!stages.includes(stage)) return;
        const entry: Record<string, unknown> = { schema: "sekhem.runtime-start.v1", side, operation: "started", stage, attempt, timestamp: new Date().toISOString(), elapsedMs: Math.round(performance.now() - began), executionRef, runRef, challengeRef };
        if (fields.phase === "challenge" || fields.phase === "started") entry.phase = fields.phase;
        if (Number.isInteger(fields.status) && fields.status! >= 100 && fields.status! <= 599) entry.status = fields.status;
        for (const key of ["execute", "cancel", "eventCommitted"] as const) if (typeof fields[key] === "boolean") entry[key] = fields[key];
        if (typeof fields.category === "string") entry.category = categories.has(fields.category) ? fields.category : "UNKNOWN";
        sink(JSON.stringify(entry));
      } catch { /* no throw, no retry, no execution authority */ }
    },
  };
}
