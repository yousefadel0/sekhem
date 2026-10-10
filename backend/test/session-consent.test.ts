import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./task-consent.test";
import { executionRecord } from "../src/agent-runtime/execution/plan-execution-state";
import { createHash } from "node:crypto";

test("SESSION creation, replay and reload are bounded to one original durable session and produce no downstream operation", async () => {
  const h = await fixture(900, "SESSION"), p = (await h.ledger.read<any>(h.db, "TASK_CONSENT", h.ref.policyId))!;
  assert.equal(p.immutable, true); assert.equal(h.ref.scope, "SESSION");
  assert.deepEqual(h.ref.session, { id: h.claims.sessionId, issuedAt: h.claims.iat, expiresAt: h.claims.exp });
  assert.deepEqual(await h.create(), h.ref); assert.deepEqual(await h.match(), h.ref);
  const view = await h.approvals.readTaskConsent("conversation-a", h.ref.policyId, h.claims);
  assert.equal(view.status, "ACTIVE"); assert.deepEqual(view.session, h.ref.session);
  assert.ok(Date.parse(p.payload.expiresAt) - Date.parse(p.payload.consentedAt) <= 900000);
  assert.ok(Date.parse(p.payload.expiresAt) <= h.claims.exp * 1000);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", h.f.run.id), null);
  assert.equal(await h.ledger.read(h.db, "EXACT_PERMIT_HEAD", [h.claims.sub, "conversation-a", h.p.proposalId]), null);
  assert.equal([...h.tables.agentApproval.values()].filter(a => a.agentRunId === h.f.run.id).length, 0);
});

test("SESSION lifetime is capped by the durable row and never extends authentication", async () => {
  const h = await fixture(900, "SESSION"); await h.revoke();
  const expiresAt = new Date(Date.now() + 30000);
  h.tables.userSession.get(h.claims.sessionId).expiresAt = expiresAt;
  const next = await h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "short-session" }, "SESSION");
  assert.equal(Date.parse(next.expiresAt), expiresAt.getTime());
  assert.equal(+h.tables.userSession.get(h.claims.sessionId).expiresAt, +expiresAt);
});

for (const change of ["session", "issuedAt", "expiry"]) test(`new or changed ${change} cannot inherit SESSION consent`, async () => {
  const h = await fixture(300, "SESSION"), claims = { ...h.claims };
  if (change === "session") {
    claims.sessionId = "new-session";
    await h.db.userSession.create({ data: { id: claims.sessionId, userId: claims.sub, expiresAt: new Date(claims.exp * 1000), revokedAt: null } });
  }
  if (change === "issuedAt") claims.iat++;
  if (change === "expiry") claims.exp++;
  await assert.rejects(h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, claims, { ...h.approvalBody, consent: h.ref }), /SESSION_CONSENT_SESSION_CHANGED/);
  await assert.rejects(h.approvals.readTaskConsent("conversation-a", h.ref.policyId, claims), /SESSION_CONSENT_SESSION_CHANGED/);
  assert.equal(await executionRecord(h.db, h.f.run.id), null);
});

test("TASK and SESSION coexist without union; implicit overlap is ambiguous and explicit selection is pinned", async () => {
  const h = await fixture(300, "SESSION");
  const task = await h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "task-policy" });
  await assert.rejects(h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, h.approvalBody), /CONSENT_POLICY_AMBIGUOUS/);
  for (const consent of [null, false, "unknown"]) await assert.rejects(h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, consent }), /TASK_CONSENT_REQUEST_INVALID/);
  const approval = await h.approve(); assert.deepEqual((approval.binding as any).taskConsent, h.ref);
  await h.revoke();
  await assert.rejects(h.approve(), /TASK_CONSENT_REVOKED/);
  await assert.rejects(h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, requestId: "implicit-fallback" }), /TASK_CONSENT_REVOKED/);
  // Explicit selection is a new consent application, with its own generation.
  const next = await h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, requestId: "selected-task", consent: task });
  assert.equal(next.generation, 2); assert.deepEqual((next.binding as any).taskConsent, task);
});

for (const field of ["userId", "organizationId", "projectId", "conversationId", "planId", "planVersion", "planDigest", "sourceDigest", "workspace"]) {
  test(`SESSION rejects changed ${field} and requires independent certified artifact admission`, async () => {
    const h = await fixture(300, "SESSION");
    const context = { ...h.p, session: h.ref.session, [field]: field === "workspace" ? { ...h.p.workspace, runtimeFingerprint: "other" } : "other" };
    await assert.rejects(h.ledger.transaction(tx => h.policies.checkTx(tx, h.ref, context)), /TASK_CONSENT_SCOPE_CHANGED/);
    const before = h.f.fresh.digest; h.f.fresh.digest = "uncertified";
    await assert.rejects(h.approve(), /PLAN_SOURCE_CHANGED/); h.f.fresh.digest = before;
  });
}

test("SESSION cannot expand exact actions, capabilities or conservative effect eligibility", async () => {
  const h = await fixture(300, "SESSION");
  await assert.rejects(h.ledger.transaction(tx => h.policies.checkTx(tx, h.ref, { ...h.p, session: h.ref.session },
    { ...h.p.actions[0], input: { ...h.p.actions[0].input, content: "changed" } })), /TASK_CONSENT_ACTION_DENIED/);
  for (const tool of ["filesystem.delete", "terminal.execute", "browser.open", "git.write", "package.install", "unknown"]) {
    await assert.rejects(h.ledger.transaction(tx => h.policies.selectTx(tx, { ...h.p, actions: [{ ...h.p.actions[0], tool }] }, h.claims, h.ref)), /TASK_CONSENT_EXPLICIT_ACTION_REQUIRED/);
  }
  await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.read"]);
  await assert.rejects(h.match(), /TASK_CONSENT_CAPABILITY_DENIED/);
});

for (const failure of ["logout", "expired-session", "global-revocation", "reviewer-loss", "policy-revocation", "policy-expiry"]) {
  for (const stage of ["admission", "permit", "consumption", "dispatch", "start"]) {
    test(`${failure} invalidates SESSION at ${stage} without a write receipt`, async () => {
      const h = await fixture(failure === "policy-expiry" ? 1 : 300, "SESSION");
      let issued: Awaited<ReturnType<typeof h.issue>> | undefined, write: any;
      if (stage === "permit") await h.approve();
      if (["consumption", "dispatch", "start"].includes(stage)) issued = await h.issue();
      if (["dispatch", "start"].includes(stage)) assert.equal((await issued!.execute()).metadata.status, "RUNNING");
      if (stage === "start") { write = (await h.request("poll")).execution; assert.ok(write); }
      if (failure === "logout") h.tables.userSession.get(h.claims.sessionId).revokedAt = new Date();
      if (failure === "expired-session") h.tables.userSession.get(h.claims.sessionId).expiresAt = new Date(Date.now() - 1);
      if (failure === "global-revocation") h.tables.user.get(h.claims.sub).sessionRevokedAt = new Date();
      if (failure === "reviewer-loss") h.tables.user.get(h.claims.sub).roles = [{ role: { key: "Viewer" } }];
      if (failure === "policy-revocation") await h.revoke();
      if (failure === "policy-expiry") await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(h.ref.expiresAt) - Date.now() + 10)));
      if (stage === "admission") await assert.rejects(h.approve());
      if (stage === "permit") {
        const a = [...h.tables.agentApproval.values()].find(a => a.agentRunId === h.f.run.id && a.approvalType === "EXACT_PROPOSAL")!;
        await assert.rejects(h.permits.issue("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, approvalId: a.id, requestId: "permit" }));
      }
      if (stage === "consumption") await assert.rejects(issued!.execute());
      if (stage === "dispatch") assert.equal((await h.request("poll")).execution, null);
      if (stage === "start") assert.equal((await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest })).execute, false);
      assert.equal(await h.ledger.read(h.db, "RUNTIME_RECEIPT", h.f.run.id), null);
    });
  }
}

test("SESSION generations and their approval/permit provenance remain immutable on renewal", async () => {
  const h = await fixture(300, "SESSION"), first = await h.issue();
  const old = await h.ledger.read(h.db, "TASK_CONSENT", h.ref.policyId), oldApproval = structuredClone(h.tables.agentApproval.get(first.approval.approvalId));
  await h.revoke();
  const next = await h.approvals.taskConsent("conversation-a", h.p.proposalId, h.claims, { ...h.body, requestId: "new-generation" }, "SESSION");
  const body = { ...h.approvalBody, requestId: "new-approval", consent: next };
  const a = await h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, body);
  assert.equal(next.generation, 2); assert.equal(a.status, "APPROVED");
  assert.deepEqual((a.binding as any).taskConsent, next);
  assert.equal((await h.approvals.requestTaskApproval("conversation-a", h.p.proposalId, h.claims, body)).approvalId, a.approvalId);
  assert.deepEqual(await h.ledger.read(h.db, "TASK_CONSENT", h.ref.policyId), old);
  assert.deepEqual(h.tables.agentApproval.get(first.approval.approvalId), oldApproval);
  assert.deepEqual(first.permit.binding.taskConsent, h.ref);
});

test("concurrent SESSION revoke/admit and revoke/start have deterministic fail-closed ordering", async () => {
  const h = await fixture(300, "SESSION"), issued = await h.issue(); await issued.execute();
  const write = (await h.request("poll")).execution;
  const results = await Promise.allSettled([h.revoke(), h.match(), h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest })]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled"); assert.equal((results[2] as PromiseFulfilledResult<any>).value.execute, false);
});

test("committed signed fixture receipts survive SESSION revocation and cannot redispatch", async () => {
  const h = await fixture(300, "SESSION"), issued = await h.issue(); await issued.execute();
  const write = (await h.request("poll")).execution;
  assert.equal((await h.request("started", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest })).execute, true);
  await h.revoke();
  const now = new Date().toISOString(), content = String(write.attribution.validatedInput.content);
  await h.request("result", { executionId: write.attribution.executionId, operationDigest: write.attribution.operationDigest, state: "SUCCEEDED",
    startedAt: now, finishedAt: now, durationMs: 1, pid: null, exitCode: 0, stdout: "written", stderr: "", error: null, truncated: false,
    result: { path: write.attribution.validatedInput.path, bytesWritten: Buffer.byteLength(content) }, verificationState: "VERIFIED",
    verificationResult: { exists: true, sha256: createHash("sha256").update(content).digest("hex") } });
  const s = (await executionRecord(h.db, h.f.run.id))!.payload;
  assert.equal(s.completed.change.receiptId, write.attribution.executionId); assert.deepEqual(s.exactPermit!.binding.taskConsent, h.ref);
  assert.equal((await h.request("poll")).execution, null);
});
