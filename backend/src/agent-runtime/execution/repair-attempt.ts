import { ConflictException } from "@nestjs/common";
import type { ExactPlanAction, PlanExecutionState } from "./plan-execution-state";
import { toolDigest } from "../tools/tool-contract";

export interface ExecutionSource { digest: string; references: string[]; observedAt: string }
export interface RepairAttempt {
  version: 1; rootPlanId: string; attempt: number; limit: 2;
  diagnosticId: string; fixProposalId: string;
  previousPlanId: string; previousPermitId: string;
  source: ExecutionSource;
}

/** Admission bookkeeping only. The caller must still consume a fresh exact permit. */
export function reserveRepair(previous: PlanExecutionState | undefined, next: {
  planId: string; workspace: PlanExecutionState["workspace"]; actions: ExactPlanAction[];
  source: ExecutionSource; permitId?: string;
}): RepairAttempt | undefined {
  if (!previous || previous.planId === next.planId) return previous?.repair;
  if (previous.status === "COMPLETED") return undefined;
  if (previous.status !== "FAILED") {
    if (previous.repair) throw new ConflictException("REPAIR_UNSETTLED");
    return undefined;
  }
  const diagnostics = Object.values(previous.failureDiagnostics ?? {}).filter(d => d.status === "GROUNDED" && d.fixProposal);
  if (diagnostics.length !== 1) throw new ConflictException("REPAIR_DIAGNOSIS_REQUIRED");
  const d = diagnostics[0], fix = d.fixProposal!;
  const count = previous.repair?.attempt ?? 0;
  if (count >= 2) throw new ConflictException("REPAIR_LIMIT_REACHED");
  if (!next.permitId || !previous.exactPermit || next.permitId === previous.exactPermit.permitId)
    throw new ConflictException("REPAIR_FRESH_EXACT_PERMIT_REQUIRED");
  if (toolDigest(previous.workspace) !== toolDigest(next.workspace)) throw new ConflictException("REPAIR_SCOPE_CHANGED");
  const writes = next.actions.filter(a => a.tool === "filesystem.write");
  const write = writes[0];
  if (writes.length !== 1 || write.relativePath !== d.scope.path || write.change?.before !== fix.before || write.change?.after !== fix.after ||
      next.actions.some(a => !["filesystem.write", "filesystem.read"].includes(a.tool)) ||
      next.actions.some(a => a.tool === "filesystem.read" && (a.relativePath !== write.relativePath || a.expectedAfterHash !== write.change?.updatedHash)) ||
      !next.actions.some(a => a.tool === "filesystem.read" && a.relativePath === write.relativePath && a.expectedAfterHash === write.change?.updatedHash))
    throw new ConflictException("REPAIR_PLANNED_TEST_REQUIRED");
  const oldSource = previous.executionSource;
  if (!oldSource || !Number.isFinite(Date.parse(previous.failureRecordedAt ?? "")) ||
      !Number.isFinite(Date.parse(next.source.observedAt)) || Date.parse(next.source.observedAt) <= Date.parse(previous.failureRecordedAt!) ||
      !next.source.digest || !next.source.references.length || next.source.digest === oldSource.digest ||
      next.source.references.some(ref => oldSource.references.includes(ref) || d.evidenceRefs.includes(ref)))
    throw new ConflictException("REPAIR_FRESH_EVIDENCE_REQUIRED");
  return { version: 1, rootPlanId: previous.repair?.rootPlanId ?? previous.planId, attempt: count + 1, limit: 2,
    diagnosticId: d.id, fixProposalId: fix.id, previousPlanId: previous.planId,
    previousPermitId: previous.exactPermit.permitId,
    source: { digest: next.source.digest, references: [...next.source.references], observedAt: next.source.observedAt } };
}
