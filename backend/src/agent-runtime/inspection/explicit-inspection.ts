import { workspaceFileReferences, requestsSourceAnalysis } from "../workspace-intent";
import { projectContentAnalysisRequest } from "../../conversation/review-intent";
import type { InspectionAction, InspectionLoop } from "./inspection.types";

/** Bounded user-request worklist, never evidence or authorization. Every action
 * still passes the strict target validator and existing Runtime approval path. */
export function nextExplicitInspection(s: InspectionLoop): InspectionAction | undefined {
  if (!(projectContentAnalysisRequest(s.objective) || requestsSourceAnalysis(s.objective)) || s.current || s.pendingConversation || s.planningContinuation || s.reportCorrection && s.reportCorrection.pending !== false ||
    s.iterations >= s.maxIterations || s.operations.some(op => ["REJECTED", "SKIPPED"].includes(op.state))) return;
  // Require an explicit read clause; paths mentioned as examples/recommendations
  // elsewhere in the request are not automatically scheduled.
  const clause = s.objective.match(/(?:^|[.:؛!?؟\n]|(?:\bthen\b|ثم)\s+)\s*(?:(?:read|inspect these files)\s+|اقر[أا]\s+)([^\n!?؟]+)/i)?.[1];
  if (!clause) return;
  const files = workspaceFileReferences(clause.split(/(?:\bthen\b|ثم|إذا كانت|if (?:they |the files )?exist|\.\s)/i)[0], 24)
    .filter(path => /(?:\.[\w.-]+|(?:^|\/)(?:Dockerfile|Makefile|LICENSE))$/i.test(path));
  if (files.length < 2) return;
  const requested: InspectionAction[] = [];
  const arabic = /[\u0600-\u06ff]/.test(s.objective);
  // Only these literal directory clauses are deterministic. Broader discovery
  // remains a model decision based on actual listings.
  if (/(?:استعراض\s+الجذر|\blist (?:the )?root\b)/i.test(s.objective)) {
    requested.push({ tool: "filesystem.list", relativePath: "", purpose: arabic ? "استعراض الجذر المطلوب في الطلب" : "List the root explicitly requested by the user" });
    if (/(?:الجذر\s+و\s*src\b|root\s+and\s+src\b)/i.test(s.objective))
      requested.push({ tool: "filesystem.list", relativePath: "src", purpose: arabic ? "استعراض مجلد src المطلوب في الطلب" : "List src explicitly requested by the user" });
  }
  requested.push(...files.map(relativePath => ({ tool: "filesystem.read" as const, relativePath, purpose: arabic ? `قراءة الملف المطلوب: ${relativePath}` : `Read user-requested source: ${relativePath}` })));
  return requested.find(action => !s.operations.some(op => op.action.tool === action.tool && op.action.relativePath === action.relativePath));
}
