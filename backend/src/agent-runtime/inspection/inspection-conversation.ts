import type { WorkspaceBinding } from "../../workspace-intelligence/workspace-runtime.contract";
import { parseInspectionDecision } from "./inspection.contract";
import type { InspectionAction } from "./inspection.types";
import { isRecord } from "../tools/tool-contract";
import { ASSISTANT_CONTEXT_LIMITS } from "../../ai-gateway/assistant-context-budget";

/** Model prose is display-only. Only an explicit, single machine intent can be proposed. */
export function interpretInspectionReply(raw: string, binding: WorkspaceBinding) {
  let text = raw.trim(), action: InspectionAction | undefined, report: unknown, final = false;
  const issues: string[] = [];
  const blocks = [...raw.matchAll(/```sekhem-(action|understanding)\s*\n([\s\S]*?)```/g)];
  for (const block of blocks) text = text.replace(block[0], "").trim();
  let actionValue: unknown;
  const actions = blocks.filter(b => b[1] === "action"), reports = blocks.filter(b => b[1] === "understanding");
  if (actions.length > 1) issues.push("AMBIGUOUS_ACTION");
  if (actions.length === 1) { try { actionValue = JSON.parse(actions[0][2]); } catch { issues.push("INVALID_ACTION_JSON"); } }
  if (reports.length === 1) { try { report = JSON.parse(reports[0][2]); final = !actions.length; } catch { issues.push("INVALID_REPORT_JSON"); } }
  if (reports.length > 1) issues.push("AMBIGUOUS_REPORT");
  // Read old stored/model responses without coupling their report to the action.
  if (!blocks.length) {
    try {
      const value = JSON.parse(raw);
      if (isRecord(value) && typeof value.decision === "string") {
        text = typeof value.purpose === "string" ? value.purpose : "I need to clarify the next step.";
        report = value.report; final = value.decision === "REPORT";
        if (value.decision === "INSPECT") {
          if (Object.keys(value).some(k => !["decision", "tool", "relativePath", "query", "purpose", "report"].includes(k))) issues.push("INVALID_ACTION_FIELDS");
          else actionValue = { tool: value.tool, relativePath: value.relativePath, query: value.query, purpose: value.purpose };
        }
      }
    } catch { /* Ordinary conversation does not need JSON. */ }
  }
  if (actionValue !== undefined) {
    try {
      if (!isRecord(actionValue) || Object.keys(actionValue).length !== 4 || Object.keys(actionValue).some(k => !["tool", "relativePath", "query", "purpose"].includes(k))) throw new Error();
      const parsed = parseInspectionDecision(JSON.stringify({ ...actionValue, decision: "INSPECT", report: null }), binding);
      if (parsed.decision !== "INSPECT") throw new Error();
      action = parsed.action;
    } catch (error) {
      // Containment rejection is a terminal scope result, never ordinary prose.
      if ((error as Error)?.message === "WORKSPACE_RELATIVE_PATH_INVALID") throw error;
      issues.push("INVALID_ACTION_INTENT");
    }
  }
  if (raw.includes("```sekhem-") && !blocks.length) issues.push("INCOMPLETE_ACTION_OR_REPORT");
  return { text: text || "I have proposed the next inspection.", action, report, final, issues };
}

export function conversationHistory(history: Array<{ role: "user" | "assistant"; content: string }> = [], next?: { role: "user" | "assistant"; content: string }) {
  const all = next ? [...history, next] : history;
  let size = 0;
  return all.slice(-ASSISTANT_CONTEXT_LIMITS.historyMessages).reverse().filter(m => { size += m.content.length; return size <= ASSISTANT_CONTEXT_LIMITS.evidenceChars; }).reverse();
}
