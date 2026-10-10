import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceHarness } from "./helpers/workspace-runtime-harness";

for (const scenario of ["expired", "grant-changed", "current"] as const) {
  test(`pending workspace approval projection: ${scenario}`, async () => {
    const h = workspaceHarness(), b = await h.create(), view = await h.request(b, "VERIFY");
    const approval = { status: "PENDING", dueAt: new Date(Date.now() + (scenario === "expired" ? -1000 : 900000)) };
    h.db.agentApproval.findUnique = async () => structuredClone(approval);
    h.db.agentApproval.update = h.db.agentApproval.updateMany = h.db.agentApproval.delete = async () => { throw new Error("Presentation must not mutate approval state"); };
    if (scenario === "grant-changed") h.grant.version++;
    const before = structuredClone({ rows: [...h.rows], snapshots: [...h.snapshots], approval, grant: h.grant });
    const calls = h.calls.filter(c => c.tool).length;
    const projected = await h.service.latest(h.claims, "project-a", b.workspaceId, b.version, "", "filesystem.list");
    assert.equal(projected?.state, scenario === "current" ? "APPROVAL_REQUIRED" : "STALE");
    if (scenario !== "current") assert.match(projected!.message!, scenario === "expired" ? /expired/ : /grant changed/);
    assert.deepEqual({ rows: [...h.rows], snapshots: [...h.snapshots], approval, grant: h.grant }, before);
    assert.equal(h.calls.filter(c => c.tool).length, calls, "projection creates no new operation or approval");
  });
}
