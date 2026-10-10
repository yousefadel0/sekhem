import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { repairContinuationTx, resolveRepairContinuationTx } from "../src/agent-runtime/execution/repair-continuation";
import { reserveLineageTx } from "../src/agent-runtime/execution/execution-lineage";
import { executionRecord } from "../src/agent-runtime/execution/plan-execution-state";

async function fixture() {
  const h = await inspectionHarness();
  const scope = { userId: h.claims.sub, organizationId: h.claims.organizationId!, projectId: "project-a", workspace: h.binding };
  const source: any = { ...scope, version: 1, runId: "source-run", conversationId: "conversation-A", planId: "root-plan",
    requestId: "root-request", status: "FAILED", lineageId: "root-lineage", rootPlanId: "root-plan",
    failureRecordedAt: "2026-10-04T00:00:00Z", exactPermit: { permitId: "old-permit" },
    executionSource: { digest: "old", references: ["runtime:old"] },
    failureDiagnostics: { d: { id: "diagnostic", status: "GROUNDED", evidenceRefs: ["runtime:failed"],
      scope: { path: "index.html" }, fixProposal: { id: "fix", before: "old", after: "new" } } } };
  await h.ledger.create(h.db, "PLAN_EXECUTION", source.runId, source, { immutable: false });
  await h.ledger.create(h.db, "EXECUTION_LINEAGE", source.lineageId, { ...scope, version: 1, id: source.lineageId,
    rootPlanId: source.planId, attempts: 0, limit: 2, runId: source.runId, planId: source.planId,
    requestId: source.requestId, terminal: false }, { immutable: false });
  const target = { ...scope, conversationId: "conversation-B", planId: "repair-1" };
  const pin = () => h.ledger.transaction(tx => repairContinuationTx(h.ledger, tx, target, source.runId));
  const next = (n: number, runId: string): any => ({ ...scope, runId, planId: `repair-${n}`, requestId: `request-${n}`,
    permitId: `permit-${n}`, source: { digest: `fresh-${n}`, references: [`runtime:fresh-${n}`], observedAt: "2026-10-04T01:00:00Z" },
    actions: [{ stepId: "write", tool: "filesystem.write", relativePath: "index.html", change: { before: "old", after: "new", updatedHash: "hash" } },
      { stepId: "verify", tool: "filesystem.read", relativePath: "index.html", expectedAfterHash: "hash" }] });
  const repair = async (n: number, runId: string, parent: any) => h.ledger.transaction(async tx => {
    const input = next(n, runId), r = await reserveLineageTx(h.ledger, tx, undefined, parent, input);
    const s = { ...source, ...scope, runId, planId: input.planId, requestId: input.requestId,
      lineageId: r.lineageId, rootPlanId: r.rootPlanId, repair: r.repair,
      executionSource: input.source, exactPermit: { permitId: input.permitId } };
    await h.ledger.create(tx, "PLAN_EXECUTION", runId, s, { immutable: false });
    return s;
  });
  return { ...h, scope, source, target, pin, next, repair };
}

test("A -> B pins the exact immutable root and source execution revision", async () => {
  const h = await fixture(), c = (await h.pin())!;
  assert.equal(c.pin.rootExecutionLineageId, "root-lineage"); assert.equal(c.pin.sourceExecutionRevision, 1);
  const repair = await h.repair(1, "B-run", c.source);
  assert.equal(repair.lineageId, c.pin.rootExecutionLineageId); assert.equal(repair.repair!.attempt, 1);
});

test("parent mutable head cannot retarget the pinned source", async () => {
  const h = await fixture(), c = (await h.pin())!;
  const row = (await executionRecord(h.db, h.source.runId))!;
  await h.ledger.update(h.db, row, { ...row.payload, lineageId: "unrelated-root", planId: "new-independent-plan", status: "COMPLETED" });
  const restored = (await h.ledger.transaction(tx => repairContinuationTx(h.ledger, tx, h.target)))!;
  assert.deepEqual(restored.pin, c.pin); assert.equal(restored.source.planId, "root-plan");
  // An overwritten root head is a conflict, never authority to start a new root.
  await assert.rejects(h.repair(1, "B-run", restored.source), /REPAIR_LINEAGE_CHANGED/);
});

test("required automatic continuation without a pin fails closed", async () => {
  const h = await fixture();
  await assert.rejects(h.ledger.transaction(tx => repairContinuationTx(h.ledger, tx, h.target, undefined, true)), /REPAIR_CONTINUATION_REQUIRED/);
});

test("explicit source without a persisted lineage fails closed", async () => {
  const h = await fixture(), row = (await executionRecord(h.db, h.source.runId))!;
  const { lineageId: _missing, ...withoutLineage } = row.payload;
  await h.ledger.update(h.db, row, withoutLineage);
  await assert.rejects(h.pin(), /REPAIR_LINEAGE_REQUIRED/);
});

test("conflicting lineage, revision, source selector and target scope fail closed", async () => {
  const h = await fixture(), c = (await h.pin())!;
  for (const patch of [{ rootExecutionLineageId: "foreign-root" }, { sourceExecutionRevision: 99 }, { sourceExecutionDigest: "wrong" }])
    await assert.rejects(resolveRepairContinuationTx(h.ledger, h.db, { ...c.pin, ...patch }, h.target), /REPAIR_CONTINUATION_CHANGED/);
  await assert.rejects(resolveRepairContinuationTx(h.ledger, h.db, c.pin, { ...h.target, userId: "foreign" }), /REPAIR_CONTINUATION_CHANGED/);
  await assert.rejects(h.ledger.transaction(tx => repairContinuationTx(h.ledger, tx, h.target, "another-run")), /REPAIR_CONTINUATION_CHANGED/);
});

test("cross-conversation pins cannot reset server budget; repair 3 is rejected", async () => {
  const h = await fixture(), firstPin = (await h.pin())!;
  const first = await h.repair(1, "B-run", firstPin.source);
  const targetC = { ...h.target, conversationId: "conversation-C", planId: "repair-2" };
  const c = (await h.ledger.transaction(tx => repairContinuationTx(h.ledger, tx, targetC, first.runId)))!;
  assert.equal(c.pin.rootExecutionLineageId, firstPin.pin.rootExecutionLineageId);
  await h.repair(2, "C-run", c.source);
  await assert.rejects(h.repair(3, "D-run", firstPin.source), /REPAIR_LIMIT_REACHED/);
  assert.equal((await h.ledger.read<any>(h.db, "EXECUTION_LINEAGE", "root-lineage"))!.payload.attempts, 2);
});

test("independent workflow has no repair pin and receives a fresh root", async () => {
  const h = await fixture();
  assert.equal(await repairContinuationTx(h.ledger, h.db, h.target), undefined);
  const root = await h.ledger.transaction(tx => reserveLineageTx(h.ledger, tx, undefined, undefined, h.next(1, "independent-run")));
  assert.notEqual(root.lineageId, "root-lineage"); assert.equal(root.repair, undefined);
});

test("pin replay/restoration is immutable and does not increment lineage", async () => {
  const h = await fixture(), c = (await h.pin())!;
  const before = await h.ledger.read<any>(h.db, "EXECUTION_LINEAGE", "root-lineage");
  assert.deepEqual(await h.pin(), c);
  const saved = await h.ledger.read<any>(h.db, "REPAIR_CONTINUATION", [h.target.userId, h.target.conversationId, h.target.planId]);
  assert.equal(saved!.immutable, true); assert.equal(saved!.revision, 1);
  assert.deepEqual(await h.ledger.read<any>(h.db, "EXECUTION_LINEAGE", "root-lineage"), before);
});
