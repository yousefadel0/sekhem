import { ConflictException } from "@nestjs/common";
import { RuntimeLedgerService, type RuntimeRecord } from "../../trusted-runtime/runtime-ledger.service";
import { executionRecord, type PlanExecutionState } from "./plan-execution-state";
import { toolDigest } from "../tools/tool-contract";

export interface RepairContinuation {
  version: 1;
  userId: string; organizationId: string; projectId: string;
  conversationId: string; planId: string;
  rootExecutionLineageId: string;
  sourceRunId: string; sourceExecutionRecordId: string; sourceExecutionRevision: number;
  sourceExecutionDigest: string;
}
type Target = Pick<RepairContinuation, "userId" | "organizationId" | "projectId" | "conversationId" | "planId"> &
  { workspace: PlanExecutionState["workspace"] };

/** Server-only pinning inside the same serialized admission/permit transaction.
 * A run selector locates evidence; it supplies neither lineage nor a counter.
 */
export async function repairContinuationTx(ledger: RuntimeLedgerService, tx: any, target: Target,
  sourceRunId?: string, required = false) {
  const key = [target.userId, target.conversationId, target.planId];
  let pin = await ledger.read<RepairContinuation>(tx, "REPAIR_CONTINUATION", key);
  if (!pin && sourceRunId) {
    const source = await executionRecord(tx, sourceRunId);
    if (!source) throw new ConflictException("REPAIR_LINEAGE_SCOPE_CHANGED");
    const s = source.payload;
    if (!s.lineageId) throw new ConflictException("REPAIR_LINEAGE_REQUIRED");
    const payload: RepairContinuation = { version: 1, userId: target.userId, organizationId: target.organizationId,
      projectId: target.projectId, conversationId: target.conversationId, planId: target.planId,
      rootExecutionLineageId: s.lineageId, sourceRunId, sourceExecutionRecordId: source.recordId,
      sourceExecutionRevision: source.revision, sourceExecutionDigest: source.payloadDigest };
    // Validate before persisting; rejection rolls back the entire admission.
    await resolveRepairContinuationTx(ledger, tx, payload, target);
    pin = await ledger.create(tx, "REPAIR_CONTINUATION", key, payload, { immutable: true });
  }
  if (!pin) {
    if (required) throw new ConflictException("REPAIR_CONTINUATION_REQUIRED");
    return undefined;
  }
  if (!pin.immutable || sourceRunId && sourceRunId !== pin.payload.sourceRunId)
    throw new ConflictException("REPAIR_CONTINUATION_CHANGED");
  return { pin: pin.payload, source: await resolveRepairContinuationTx(ledger, tx, pin.payload, target) };
}

export async function resolveRepairContinuationTx(ledger: RuntimeLedgerService, tx: any,
  pin: RepairContinuation, target: Target): Promise<PlanExecutionState> {
  if (pin.version !== 1 || pin.userId !== target.userId || pin.organizationId !== target.organizationId ||
      pin.projectId !== target.projectId || pin.conversationId !== target.conversationId || pin.planId !== target.planId ||
      !Number.isSafeInteger(pin.sourceExecutionRevision) || pin.sourceExecutionRevision < 1)
    throw new ConflictException("REPAIR_CONTINUATION_CHANGED");
  const revision = await ledger.read<RuntimeRecord<PlanExecutionState>>(tx, "RUNTIME_REVISION",
    [pin.sourceExecutionRecordId, pin.sourceExecutionRevision]);
  const r = revision?.payload, s = r?.payload;
  if (!revision?.immutable || !r || !s || r.recordType !== "PLAN_EXECUTION" ||
      r.recordId !== pin.sourceExecutionRecordId || r.canonicalKeyDigest !== toolDigest(pin.sourceRunId) ||
      r.revision !== pin.sourceExecutionRevision || r.payloadDigest !== pin.sourceExecutionDigest ||
      toolDigest(s) !== pin.sourceExecutionDigest || s.runId !== pin.sourceRunId ||
      s.lineageId !== pin.rootExecutionLineageId || s.userId !== target.userId ||
      s.organizationId !== target.organizationId || s.projectId !== target.projectId ||
      toolDigest(s.workspace) !== toolDigest(target.workspace)) throw new ConflictException("REPAIR_CONTINUATION_CHANGED");
  if (s.status !== "FAILED") throw new ConflictException("REPAIR_SOURCE_NOT_FAILED");
  const root = await ledger.read<any>(tx, "EXECUTION_LINEAGE", pin.rootExecutionLineageId);
  if (!root) throw new ConflictException("REPAIR_LINEAGE_REQUIRED");
  if (root.payload.id !== pin.rootExecutionLineageId || root.payload.userId !== target.userId ||
      root.payload.organizationId !== target.organizationId || root.payload.projectId !== target.projectId ||
      root.payload.rootPlanId !== s.rootPlanId) throw new ConflictException("REPAIR_CONTINUATION_CHANGED");
  if (root.payload.terminal) throw new ConflictException("REPAIR_LINEAGE_COMPLETED");
  return s;
}
