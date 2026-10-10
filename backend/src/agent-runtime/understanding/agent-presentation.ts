import { evidenceIdentity, AGENT_UNDERSTANDING_LIMITS, type AgentContext, type AgentPlanningResult } from "./agent-understanding.types";
import type { WorkspaceBinding } from "../../workspace-intelligence/models/workspace.types";

export interface EvidenceReceipt {
  observedWorkspace?: { workspaceId: string; bindingVersion: number; runtimeId: string };
  operation?: string;
  runtimeReference?: import("../../workspace-intelligence/workspace-runtime.contract").RuntimeEvidenceReference;
  id: string; sourceType: string; label: string; relativePath?: string; attachmentId?: string;
  outcome: string; discovered: true; read: boolean; selected: boolean;
  /** Selection is known; causal influence on model output is not inferred. */
  usedInAnswer: "UNKNOWN"; truncated: boolean; selectionReason: string;
}

/** Display projection only: a durable verified read is not automatically admitted model evidence. */
export function runtimeReadReceipt(snapshot: { proposal: import("../../trusted-runtime/runtime.contract").RuntimeProposal; execution?: import("../../trusted-runtime/runtime.contract").RuntimeExecution | null } | null | undefined): EvidenceReceipt | null {
  const p = snapshot?.proposal, e = snapshot?.execution, w = p?.workspaceOperation ?? p?.inspection;
  if (!p || !e || !w || p.toolId !== "filesystem.read" || e.attribution.tool !== "filesystem.read" ||
    e.state !== "SUCCEEDED" || e.verificationState !== "VERIFIED" || !e.result ||
    e.attribution.proposalId !== p.proposalId || e.attribution.runtimeId !== p.runtimeId ||
    e.attribution.validatedInput.path !== p.validatedInput.path) return null;
  const path = String(p.validatedInput.path ?? ""), prefix = w.rootPath.replace(/[\\/]+$/, "") + "\\";
  if (!path.startsWith(prefix)) return null;
  const relativePath = path.slice(prefix.length).replace(/\\/g, "/");
  return { id: `runtime:${e.attribution.executionId}`, sourceType: "workspace", operation: "filesystem.read", label: relativePath, relativePath,
    observedWorkspace: { workspaceId: w.workspaceId, bindingVersion: w.bindingVersion, runtimeId: p.runtimeId },
    outcome: e.result.truncated ? "TRUNCATED" : "READ", discovered: true, read: true, selected: false, usedInAnswer: "UNKNOWN",
    truncated: e.result.truncated, selectionReason: "Verified source read receipt; model-context admission is separate." };
}
export interface AgentPresentation {
  engineeringPlan?: import("./agent-understanding.types").EngineeringPlanIdentity;
  originatingMessageId?: string;
  workspace: WorkspaceBinding | null;
  evidence: EvidenceReceipt[];
  warnings: string[];
  planning: AgentPlanningResult | null;
  /** Null for runtime plans: only their independently authorized ledger is authoritative. */
  executionAvailable: false | null;
  executionPerformed: false | null;
  executionAuthority?: "RUNTIME_LEDGER";
}

export function evidenceReceipt(context: AgentContext, maximum: number = AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS): EvidenceReceipt[] {
  return context.evidence.slice(0, maximum).map(item => {
    const id = evidenceIdentity(item);
    return { id, sourceType: item.sourceType,
      ...(item.runtimeReference && ["filesystem.list", "filesystem.search", "filesystem.read"].includes(String(item.metadata.operation)) ? { operation: String(item.metadata.operation) } : {}),
      ...(item.runtimeReference ? { runtimeReference: item.runtimeReference } : {}),
      label: String(item.relativePath ?? item.metadata.fileName ?? item.attachmentId ?? item.sourceId).slice(0, 256),
      ...(item.relativePath ? { relativePath: item.relativePath } : {}),
      ...(item.attachmentId ? { attachmentId: item.attachmentId } : {}),
      outcome: item.status === "COLLECTED" && context.truncation.truncatedEvidenceIds.includes(id) ? "TRUNCATED" : item.outcome ?? item.status, discovered: true,
      read: item.status === "COLLECTED" && (!item.runtimeReference || !item.metadata.operation || item.metadata.operation === "filesystem.read"),
      selected: item.status === "COLLECTED" && !context.truncation.droppedEvidenceIds.includes(id),
      usedInAnswer: "UNKNOWN", truncated: context.truncation.truncatedEvidenceIds.includes(id),
      selectionReason: (item.selectionReason ?? "Requested source considered by the bounded context collector.").slice(0, 256) };
  });
}

/** Only the server-created work item's display fields; never raw audit/tool payloads. */
export function presentPlan(stepsValue: unknown): AgentPresentation {
  const steps = typeof stepsValue === "string" ? JSON.parse(stepsValue) : stepsValue;
  const parameters = Array.isArray(steps) ? steps[0]?.parameters : undefined;
  return { originatingMessageId: typeof parameters?.originatingMessageId === "string" ? parameters.originatingMessageId : undefined,
    ...(parameters?.engineeringPlan ? { engineeringPlan: parameters.engineeringPlan } : {}),
    workspace: parameters?.workspaceBinding ?? null,
    evidence: Array.isArray(parameters?.evidenceReceipt) ? parameters.evidenceReceipt.slice(0, AGENT_UNDERSTANDING_LIMITS.MAX_EVIDENCE_ITEMS) : [],
    warnings: Array.isArray(parameters?.contextWarnings) ? parameters.contextWarnings.slice(0, 12) : [],
    planning: parameters?.planning ?? null,
    ...(parameters?.runtimeAction === true || parameters?.inspectionLoop === true ? { executionAvailable: null, executionPerformed: null, executionAuthority: "RUNTIME_LEDGER" as const }
      : { executionAvailable: false as const, executionPerformed: false as const }) };
}
