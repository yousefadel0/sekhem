import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { reserveLineageTx, completeLineageTx } from "../src/agent-runtime/execution/execution-lineage";
import { executionRecord, exactExecutionReservationTx } from "../src/agent-runtime/execution/plan-execution-state";

async function fixture() {
  const h = await inspectionHarness();
  const previous: any = { version: 1, runId: "root-run", planId: "root-plan", requestId: "root-request", status: "FAILED",
    userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: "project-a", workspace: h.binding,
    exactPermit: { permitId: "old-permit" }, failureRecordedAt: "2026-10-04T00:00:00Z",
    executionSource: { digest: "old-source", references: ["runtime:old-read"] },
    failureDiagnostics: { failure: { id: "diagnostic", status: "GROUNDED", evidenceRefs: ["runtime:failed-read"],
      scope: { path: "index.html" }, fixProposal: { id: "fix", before: "old", after: "new" } } } };
  await h.ledger.create(h.db, "PLAN_EXECUTION", previous.runId, previous, { immutable: false });
  const next = (n: number, runId = "root-run"): any => ({ planId: `plan-${n}`, runId, requestId: `request-${n}`,
    userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: "project-a", workspace: h.binding,
    permitId: `permit-${n}`, source: { digest: `source-${n}`, references: [`runtime:read-${n}`], observedAt: `2026-10-04T00:0${n}:00Z` },
    actions: [{ stepId: "write", tool: "filesystem.write", relativePath: "index.html", change: { before: "old", after: "new", updatedHash: "hash" } },
      { stepId: "verify", tool: "filesystem.read", relativePath: "index.html", expectedAfterHash: "hash" }] });
  const reserve = async (input: any, parent?: any) => h.ledger.transaction(async tx => {
    const old = await executionRecord(tx, input.runId);
    const r = await reserveLineageTx(h.ledger, tx, old?.payload, parent, input);
    const { source, permitId, ...identity } = input;
    const state = { ...previous, ...identity, lineageId: r.lineageId, rootPlanId: r.rootPlanId, ...(r.repair ? { repair: r.repair } : {}),
      exactPermit: { permitId }, executionSource: structuredClone(source) };
    if (old) await h.ledger.update(tx, old, state); else await h.ledger.create(tx, "PLAN_EXECUTION", input.runId, state, { immutable: false });
    return state;
  });
  return { ...h, previous, next, reserve };
}

test("root budget admits repairs 1 and 2 across reload, plan revision and another conversation; rejects 3", async () => {
  const h = await fixture(), first = await h.reserve(h.next(1));
  assert.equal(first.repair.attempt, 1);
  const reloaded = (await executionRecord(h.db, "root-run"))!.payload;
  const second = await h.reserve(h.next(2, "child-conversation-run"), reloaded);
  assert.equal(second.repair.attempt, 2); assert.equal(second.lineageId, first.lineageId);
  // A second fork still referring to the original root cannot reuse its old count.
  await assert.rejects(h.reserve(h.next(3, "other-conversation-run"), h.previous), /REPAIR_LIMIT_REACHED/);
  assert.equal((await h.ledger.read<any>(h.db, "EXECUTION_LINEAGE", first.lineageId))!.payload.attempts, 2);
});

test("FAILED -> repair -> COMPLETED closes root; independent subsequent plan starts budget zero", async () => {
  const h = await fixture(), first = await h.reserve(h.next(1));
  await h.ledger.transaction(async tx => {
    const row = (await executionRecord(tx, first.runId))!;
    await completeLineageTx(h.ledger, tx, row.payload);
    await h.ledger.update(tx, row, { ...row.payload, status: "COMPLETED" });
  });
  const independent = await h.reserve(h.next(2));
  assert.equal(independent.repair, undefined); assert.notEqual(independent.lineageId, first.lineageId);
  assert.equal((await h.ledger.read<any>(h.db, "EXECUTION_LINEAGE", independent.lineageId))!.payload.attempts, 0);
  await assert.rejects(h.reserve(h.next(3, "fork-of-completed-root"), first), /REPAIR_LINEAGE_COMPLETED/);
});

test("server root count wins over stale/tampered continuation counters", async () => {
  const h = await fixture(), first = await h.reserve(h.next(1));
  const fake = { ...first, repair: { ...first.repair, attempt: 0 } };
  const second = await h.reserve(h.next(2, "child-run"), fake);
  assert.equal(second.repair.attempt, 2);
  await assert.rejects(h.reserve({ ...h.next(3, "foreign-run"), userId: "other-user" }, first), /REPAIR_LINEAGE_SCOPE_CHANGED/);
});

test("failed admission rolls back lineage reservation; no permit or execution authority is manufactured", async () => {
  const h = await fixture();
  await assert.rejects(h.ledger.transaction(async tx => {
    await reserveLineageTx(h.ledger, tx, h.previous, undefined, h.next(1));
    throw new Error("EXACT_APPROVAL_REQUIRED");
  }), /EXACT_APPROVAL_REQUIRED/);
  const rootRecords = [...h.tables.auditEvent.values()].filter(row => row.metadata?.recordType === "EXECUTION_LINEAGE");
  assert.equal(rootRecords.length, 0);
  assert.equal(await exactExecutionReservationTx(h.db, { proposalId: undefined, repair: { attempt: 0 } } as any), false);
});
