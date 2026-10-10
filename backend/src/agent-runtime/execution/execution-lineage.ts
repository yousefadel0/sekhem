import { ConflictException } from "@nestjs/common";
import { RuntimeLedgerService } from "../../trusted-runtime/runtime-ledger.service";
import { toolDigest } from "../tools/tool-contract";
import { executionRecord, type PlanExecutionState } from "./plan-execution-state";
import { reserveRepair } from "./repair-attempt";

interface ExecutionLineage {
  version: 1; id: string; userId: string; organizationId: string; projectId: string;
  rootPlanId: string; attempts: number; limit: 2;
  runId: string; planId: string; requestId: string; terminal: boolean;
}

/** Called inside the existing serialized permit/reservation transaction.
 * parent is obtained only from the validated server-owned conversation transfer.
 */
export async function reserveLineageTx(ledger: RuntimeLedgerService, tx: any,
  previous: PlanExecutionState | undefined, parent: PlanExecutionState | undefined,
  next: Parameters<typeof reserveRepair>[1] & {
    runId: string; requestId: string; userId: string; organizationId: string; projectId: string;
  }) {
  let source = previous ?? parent;
  if (source && (source.userId !== next.userId || source.organizationId !== next.organizationId || source.projectId !== next.projectId))
    throw new ConflictException("REPAIR_LINEAGE_SCOPE_CHANGED");
  // A completed local execution is terminal. A new independent plan has its own root.
  if ((source?.status === "COMPLETED" || source?.status === "CANCELLED" && !source.repair) && source.planId !== next.planId) source = undefined;
  if (source && source.planId !== next.planId && source.status !== "FAILED") throw new ConflictException("REPAIR_UNSETTLED");
  const rootPlanId = source?.rootPlanId ?? source?.repair?.rootPlanId ?? source?.planId ?? next.planId;
  const lineageId = source?.lineageId ?? `execution_lineage_${toolDigest([next.userId, next.organizationId, next.projectId, rootPlanId])}`;
  const record = await ledger.read<ExecutionLineage>(tx, "EXECUTION_LINEAGE", lineageId);
  if (record) {
    const root = record.payload;
    if (root.id !== lineageId || root.userId !== next.userId || root.organizationId !== next.organizationId || root.projectId !== next.projectId ||
        root.rootPlanId !== rootPlanId || root.limit !== 2 || !Number.isSafeInteger(root.attempts) || root.attempts < 0 || root.attempts > 2)
      throw new ConflictException("REPAIR_LINEAGE_CHANGED");
    if (root.terminal) throw new ConflictException("REPAIR_LINEAGE_COMPLETED");
    // A fork pointing at an older failure must resolve the latest root attempt.
    const latest = (await executionRecord(tx, root.runId))?.payload;
    if (!latest || latest.lineageId !== lineageId || latest.planId !== root.planId || latest.requestId !== root.requestId)
      throw new ConflictException("REPAIR_LINEAGE_CHANGED");
    if (latest.status === "COMPLETED") throw new ConflictException("REPAIR_LINEAGE_COMPLETED");
    source = { ...latest, ...(root.attempts ? { repair: { ...latest.repair!, attempt: root.attempts, rootPlanId } } : {}) };
  } else if (source?.lineageId) throw new ConflictException("REPAIR_LINEAGE_REQUIRED");
  // Historical server-ledger state is imported once; client counters are never accepted.
  const repair = reserveRepair(source, next);
  const attempts = repair?.attempt ?? 0;
  const payload: ExecutionLineage = { version: 1, id: lineageId, userId: next.userId, organizationId: next.organizationId, projectId: next.projectId,
    rootPlanId, attempts, limit: 2, runId: next.runId, planId: next.planId, requestId: next.requestId, terminal: false };
  if (record) await ledger.update(tx, record, payload);
  else await ledger.create(tx, "EXECUTION_LINEAGE", lineageId, payload, { immutable: false });
  return { lineageId, rootPlanId, repair };
}

export async function completeLineageTx(ledger: RuntimeLedgerService, tx: any, state: PlanExecutionState) {
  if (!state.lineageId) return;
  const record = await ledger.read<ExecutionLineage>(tx, "EXECUTION_LINEAGE", state.lineageId);
  if (!record || record.payload.runId !== state.runId || record.payload.planId !== state.planId || record.payload.requestId !== state.requestId)
    throw new ConflictException("REPAIR_LINEAGE_CHANGED");
  if (!record.payload.terminal) await ledger.update(tx, record, { ...record.payload, terminal: true });
}
