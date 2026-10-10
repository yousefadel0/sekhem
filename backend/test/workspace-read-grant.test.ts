import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { parseInspectionDecision } from "../src/agent-runtime/inspection/inspection.contract";
import { readCoverage, workspaceReadConsentTx } from "../src/trusted-runtime/workspace-read-coverage";
import type { RuntimeGrant, RuntimeTool } from "../src/trusted-runtime/runtime.contract";

type Harness = Awaited<ReturnType<typeof inspectionHarness>>;
const currentGrant = (h: Harness) => h.ledger.transaction(async tx => {
  const g = await h.identity.activeGrant(tx, h.device.runtimeId, "project-a");
  return { ...g, workspaceRead: await workspaceReadConsentTx(h.ledger, tx, { ...h.binding, bindingVersion: h.binding.version }, g) };
});
async function allow(h: Harness, minutes = 60) {
  const g = await currentGrant(h);
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: g.version, durationMinutes: minutes });
  return currentGrant(h);
}
const read = (h: Harness, requestId = "file-one", relativePath = "session.ts") => h.runtime.request(h.claims, "project-a", h.binding.workspaceId, "READ", { bindingVersion: h.binding.version, conversationId: "conversation-a", requestId, relativePath });

for (const kind of ["LIST", "SEARCH", "READ"] as const) test(`one consent covers multiple ${kind} operations with unique verified receipts`, async () => {
  const h = await inspectionHarness(), grant = await allow(h), ids = new Set<string>();
  assert.equal(grant.workspaceRead?.kind, "WORKSPACE_READ"); assert.ok(grant.workspaceRead!.expiresAt);
  for (let i = 0; i < 3; i++) {
    const v = await h.runtime.request(h.claims, "project-a", h.binding.workspaceId, kind, { bindingVersion: h.binding.version, conversationId: "conversation-a", requestId: `${kind}-${i}`, relativePath: kind === "READ" ? `file-${i}.ts` : "", ...(kind === "SEARCH" ? { query: "authenticate" } : {}) });
    assert.equal(v.state, "EXECUTING");
    const p = (await h.control.snapshot(h.claims, v.operation.runId))!.proposal;
    assert.equal(p.state, "APPROVED"); assert.equal(p.workspaceRead?.consent.fingerprint, grant.workspaceRead!.fingerprint);
    const approval = h.tables.agentApproval.get(p.approvalId!);
    assert.match(approval.notes, /inherits the recorded human consent/);
    const e = (await h.request("poll")).execution; assert.ok(e); ids.add(e.attribution.executionId);
    await h.complete(e);
    const observed = await h.runtime.operation(h.claims, "project-a", h.binding.workspaceId, h.binding.version, v.operation.operationId);
    assert.equal(observed.state, "READY"); assert.equal(observed.receipt!.receiptId, e.attribution.executionId);
  }
  assert.equal(ids.size, 3); assert.equal([...h.tables.agentApproval.values()].filter(a => a.status === "PENDING").length, 0);
  assert.equal((await currentGrant(h)).version, grant.version); assert.equal((await h.state()).references.length, 0);
});

test("Agent inspections reuse consent in one run and admit only verified evidence", async () => {
  const h = await inspectionHarness(); await allow(h); const count = h.tables.agentRun.size, receipts = new Set();
  for (const [tool, path, query] of [["filesystem.list", "", ""], ["filesystem.search", "", "authenticate"], ["filesystem.read", "session.ts", ""]]) {
    h.responses.push(h.inspect(tool, path, query)); await h.service.advance(h.run.id);
    let s = await h.state(); assert.equal(s.state, "APPROVED"); assert.ok(s.current!.workspaceRead);
    const e = (await h.request("poll")).execution; assert.ok(e); assert.equal(e.attribution.agentRunId, h.run.id);
    await h.complete(e); await h.service.advance(h.run.id); s = await h.state();
    assert.equal(s.state, "NEEDS_MORE_EVIDENCE"); receipts.add(s.references.at(-1)!.receiptId);
    assert.equal(s.references.at(-1)!.verificationState, "VERIFIED");
  }
  assert.equal(h.tables.agentRun.size, count); assert.equal(receipts.size, 3);
  assert.equal([...h.tables.agentApproval.values()].filter(a => a.status === "PENDING").length, 0);
});

test("revocation blocks fresh reads and pending dispatch; historical receipt stays an observation", async () => {
  const h = await inspectionHarness(), grant = await allow(h), v = await read(h);
  const e = (await h.request("poll")).execution; await h.complete(e);
  const historical = await h.runtime.operation(h.claims, "project-a", h.binding.workspaceId, h.binding.version, v.operation.operationId);
  await read(h, "pending");
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: grant.version }, true);
  await assert.rejects(() => read(h, "revoked"), /WORKSPACE_READ_GRANT_INVALID/);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal((await h.runtime.operation(h.claims, "project-a", h.binding.workspaceId, h.binding.version, v.operation.operationId)).receipt!.receiptId, historical.receipt!.receiptId);
});

test("expiry blocks requests without falling back or renewing", async () => {
  const h = await inspectionHarness(); const grant = await allow(h, 1), realNow = Date.now;
  await h.ledger.transaction(async tx => { const d = await h.identity.device(tx, h.device.runtimeId); await h.ledger.update(tx, d, { ...d.payload, lastSeenAt: new Date(Date.parse(grant.workspaceRead!.expiresAt) + 1).toISOString() }); });
  try { Date.now = () => Date.parse(grant.workspaceRead!.expiresAt) + 1;
    await assert.rejects(() => read(h), /WORKSPACE_READ_GRANT_INVALID/);
    assert.throws(() => readCoverage(grant, grant.workspaceRead!, "filesystem.read", "D:\\Fixture\\session.ts"), /WORKSPACE_READ_GRANT_INVALID/);
  } finally { Date.now = realNow; }
  assert.equal((await currentGrant(h)).version, grant.version);
});

test("stale binding and workspace switch block already-authorized dispatch", async () => {
  const h = await inspectionHarness(); await allow(h); await read(h);
  await h.runtime.createBinding(h.claims, "project-a", { runtimeId: h.device.runtimeId, rootPath: "D:\\Other", displayName: "Other", requestId: "switch" });
  await assert.rejects(() => read(h, "stale"), /WORKSPACE_BINDING_STALE/);
  const polled = await h.request("poll"); assert.equal(polled.execution, null); assert.equal(polled.rejected, true);
});
test("revoked runtime denies operations and authenticated transport", async () => {
  const h = await inspectionHarness(); await allow(h); await read(h);
  await h.identity.setDeviceStatus(h.claims, h.device.runtimeId, "REVOKED");
  await assert.rejects(() => read(h, "revoked-runtime")); await assert.rejects(() => h.request("poll"));
});
test("scope includes exact actor, org, project, runtime fingerprint and root", async () => {
  const h = await inspectionHarness(), g = await allow(h), c = g.workspaceRead!;
  for (const key of ["rootPath", "runtimeId", "runtimeFingerprint", "userId", "organizationId", "projectId"] as const) assert.throws(() => readCoverage(g, { ...c, [key]: "foreign" }, "filesystem.read", "D:\\Fixture\\session.ts"));
  assert.equal(readCoverage(g, { ...c, workspaceId: "other" }, "filesystem.read", "D:\\Fixture\\session.ts"), undefined);
  assert.equal(readCoverage(g, { ...c, bindingVersion: c.bindingVersion + 1 }, "filesystem.read", "D:\\Fixture\\session.ts"), undefined);
  await assert.rejects(() => h.runtime.request(h.claims, "foreign-project", h.binding.workspaceId, "READ", { bindingVersion: h.binding.version, conversationId: "conversation-a", requestId: "foreign", relativePath: "session.ts" }));
});
for (const path of ["../outside.ts", "D:\\Elsewhere\\file.ts", ".env", ".git/config", "node_modules/lib/index.js"]) test(`read grant does not authorize protected/foreign path ${path}`, async () => {
  const h = await inspectionHarness(); await allow(h); await assert.rejects(() => read(h, "bad-path", path));
  assert.equal((await h.request("poll")).execution, null);
});
for (const tool of ["filesystem.write", "filesystem.create", "filesystem.delete", "filesystem.move", "filesystem.copy", "terminal.execute"] as RuntimeTool[]) test(`read consent cannot cover ${tool}`, async () => {
  const h = await inspectionHarness(), g = await allow(h);
  const agentConversationId = await linkedAgent(h);
  assert.throws(() => readCoverage(g, g.workspaceRead!, tool, "D:\\Fixture\\session.ts"));
  const input = tool === "terminal.execute" ? { executable: "node", args: ["--version"], cwd: "D:\\Fixture", timeoutMs: 1000 } : ["filesystem.move", "filesystem.copy"].includes(tool) ? { source: "D:\\Fixture\\a", destination: "D:\\Fixture\\b" } : { path: "D:\\Fixture\\file.ts", ...(["filesystem.write", "filesystem.create"].includes(tool) ? { content: "test" } : {}) };
  await assert.rejects(() => h.control.propose(h.claims, { projectId: "project-a", conversationId: agentConversationId, runtimeId: h.device.runtimeId, requestId: "mutation", tool, input, purpose: "Mutation requires separate authority" }), /RUNTIME_CAPABILITY_NOT_GRANTED/);
});
test("existing mutation capability still requires exact-action approval after read consent", async () => {
  const h = await inspectionHarness(); await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.read", "filesystem.list", "filesystem.search", "filesystem.write"]); await allow(h);
  const agentConversationId = await linkedAgent(h);
  const p = await h.control.propose(h.claims, { projectId: "project-a", conversationId: agentConversationId, runtimeId: h.device.runtimeId, requestId: "write", tool: "filesystem.write", input: { path: "D:\\Fixture\\a.txt", content: "unexecuted" }, purpose: "Exact mutation" });
  assert.equal(p.proposal.state, "AWAITING_APPROVAL"); assert.equal(p.proposal.workspaceRead, undefined); assert.equal((await h.request("poll")).execution, null);
});
test("model/client cannot supply scope, capabilities, expiry or grant authority", async () => {
  const h = await inspectionHarness();
  for (const extra of [{ rootPath: "D:\\Other" }, { capabilities: ["terminal.execute"] }, { expiresAt: null }, { approvedBy: "model" }, { workspaceRead: {} }]) {
    await assert.rejects(() => h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: 1, durationMinutes: 60, ...extra }), /WORKSPACE_READ_GRANT_INVALID/);
  }
  for (const durationMinutes of [0, 61, null, Infinity]) await assert.rejects(() => h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: 1, durationMinutes }), /WORKSPACE_READ_DURATION_INVALID|RUNTIME_PAYLOAD_INVALID/);
  assert.throws(() => parseInspectionDecision(JSON.stringify({ decision: "INSPECT", tool: "filesystem.read", relativePath: "session.ts", query: "", purpose: "read", report: null, workspaceRead: { approved: true } }), h.binding));
});
test("legacy grants and public standalone reads still require exact-action approval", async () => {
  const h = await inspectionHarness(), before = await read(h);
  const agentConversationId = await linkedAgent(h);
  assert.equal(before.state, "APPROVAL_REQUIRED"); assert.equal((await h.request("poll")).execution, null);
  await allow(h);
  const p = await h.control.propose(h.claims, { projectId: "project-a", conversationId: agentConversationId, runtimeId: h.device.runtimeId, tool: "filesystem.read", input: { path: "D:\\Fixture\\session.ts" }, purpose: "Standalone read", requestId: "standalone" });
  assert.equal(p.proposal.state, "AWAITING_APPROVAL"); assert.equal(p.proposal.workspaceRead, undefined);
});
test("concurrent identical requests produce one proposal, intent and permit", async () => {
  const h = await inspectionHarness(); await allow(h);
  const views = await Promise.all([read(h), read(h)]); assert.equal(views[0].operation.operationId, views[1].operation.operationId);
  const [a, b] = await Promise.all([h.request("poll"), h.request("poll")]); assert.equal([a, b].filter(p => p.execution).length, 1);
});
test("revocation between dispatch and start prevents execution", async () => {
  const h = await inspectionHarness(), g = await allow(h); await read(h);
  const e = (await h.request("poll")).execution; assert.ok(e);
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: g.version }, true);
  const started = await h.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest }); assert.equal(started.execute, false);
});

test("an older worker cannot receive consent-covered execution", async () => {
  const h = await inspectionHarness();
  await h.request("connect", {}); await allow(h); await read(h);
  const polled = await h.request("poll");
  assert.equal(polled.execution, null); assert.equal(polled.rejected, true);
});

test("revocation cancels active read authority at heartbeat without replay", async () => {
  const h = await inspectionHarness(), g = await allow(h); await read(h);
  const e = (await h.request("poll")).execution;
  const body = { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest };
  assert.equal((await h.request("started", body)).execute, true);
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: g.version }, true);
  assert.equal((await h.request("heartbeat", body)).cancel, true);
  await h.request("connect", { workspaceReadProtocol: 1 });
  assert.equal((await h.request("poll")).execution, null);
});

async function linkedAgent(h: Awaited<ReturnType<typeof inspectionHarness>>) {
  // A persisted legacy Agent fixture: unified conversation transfer no longer creates a child Agent chat.
  const id = "legacy-agent-conversation";
  await h.db.conversation.create({ data: { id, userId: h.claims.sub, projectId: "project-a", metadata: { modeContext: {
    version: 1, mode: "AGENT", organizationId: h.claims.organizationId,
    workspace: { workspaceId: h.binding.workspaceId, bindingVersion: h.binding.version,
      runtimeId: h.binding.runtimeId, runtimeFingerprint: h.binding.runtimeFingerprint }
  } } } });
  return id;
}
