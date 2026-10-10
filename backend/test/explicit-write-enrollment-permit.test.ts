import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./task-consent.test";

test("explicit write enrollment and server-owned renewal unlock only exact approved permit admission", async () => {
  const h = await fixture(300, "TASK", true);
  const reads = ["filesystem.list", "filesystem.read", "filesystem.search"] as const;
  const scope = { runtimeId: h.device.runtimeId, projectId: "project-a", mode: "TRUSTED_MACHINE" };
  const first = await h.identity.configureCapabilities(h.claims, { ...scope, expectedRevision: 0, capabilities: [...reads] });
  const original = await h.identity.grant(h.claims, scope.runtimeId, scope.projectId, [...reads]);
  const retainedEnrollment = structuredClone(await h.ledger.read(h.db, "RUNTIME_REVISION", [first.enrollmentId, first.revision]));
  const retainedGrant = structuredClone(await h.ledger.read(h.db, "RUNTIME_REVISION", [original.grantId, original.version]));
  const consentKey = [h.claims.sub, h.claims.organizationId, scope.projectId, h.binding.workspaceId, h.binding.version];
  const consent = structuredClone(await h.ledger.read(h.db, "WORKSPACE_READ_CONSENT", consentKey));
  const approval = await h.approvals.request("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, requestId: "explicit-write-approval" });
  await h.approvals.decide("conversation-a", h.p.proposalId, h.claims, { ...h.approvalBody, approvalId: approval.approvalId,
    fingerprint: approval.binding.fingerprint, decision: "APPROVED" });
  const permitBody = { ...h.approvalBody, approvalId: approval.approvalId, requestId: "explicit-write-permit" };
  const issue = () => h.permits.issue("conversation-a", h.p.proposalId, h.claims, permitBody);
  await assert.rejects(issue, /EXACT_PERMIT_RUNTIME_CHANGED/);
  const renewal = { ...scope, requestId: "explicit-write-renewal", enrollmentRevision: first.revision,
    expectedGrantVersion: original.version, durationSeconds: 3600 };
  const { mode: _, ...renewalBody } = renewal;
  const readGrant = await h.identity.renewGrant(h.claims, renewalBody);
  assert.deepEqual(readGrant.capabilities, [...reads]);
  await assert.rejects(issue, /EXACT_PERMIT_RUNTIME_CHANGED/);
  const second = await h.identity.configureCapabilities(h.claims, { ...scope, expectedRevision: first.revision,
    capabilities: [...reads, "filesystem.write"] });
  assert.equal(second.revision, first.revision + 1);
  assert.deepEqual((await h.ledger.read<any>(h.db, "RUNTIME_GRANT", [scope.runtimeId, scope.projectId]))!.payload.capabilities, [...reads],
    "configuration alone never grants operational write access");
  await assert.rejects(() => h.identity.activeGrant(h.db, scope.runtimeId, scope.projectId), /RUNTIME_GRANT_INVALID/,
    "the old read grant cannot borrow a changed enrollment revision");
  const writeRenewal = { ...renewalBody, requestId: "explicit-write-renewal-2", enrollmentRevision: second.revision, expectedGrantVersion: readGrant.version };
  for (const capabilities of [["filesystem.write"], [...reads, "filesystem.write", "terminal.execute"], []]) {
    await assert.rejects(() => h.identity.renewGrant(h.claims, { ...writeRenewal, capabilities }), /RUNTIME_GRANT_RENEWAL_INVALID/);
  }
  const writeGrant = await h.identity.renewGrant(h.claims, writeRenewal);
  assert.deepEqual(writeGrant.capabilities, [...reads, "filesystem.write"]);
  assert.equal(writeGrant.version, readGrant.version + 1);
  assert.deepEqual(writeGrant.enrollment, { enrollmentId: second.enrollmentId, revision: second.revision, runtimeFingerprint: h.device.fingerprint });
  assert.deepEqual(await h.identity.renewGrant(h.claims, writeRenewal), writeGrant);
  assert.deepEqual(await h.ledger.read(h.db, "RUNTIME_REVISION", [first.enrollmentId, first.revision]), retainedEnrollment);
  assert.deepEqual(await h.ledger.read(h.db, "RUNTIME_REVISION", [original.grantId, original.version]), retainedGrant);
  for (const record of [retainedEnrollment, retainedGrant]) {
    assert.equal(record!.immutable, true);
    await assert.rejects(() => h.ledger.transaction(tx => h.ledger.update(tx, record!, {})), /RUNTIME_RECORD_IMMUTABLE/);
  }
  assert.deepEqual(await h.ledger.read(h.db, "WORKSPACE_READ_CONSENT", consentKey), consent);
  assert.equal(await h.ledger.read(h.db, "PLAN_EXECUTION", h.f.run.id), null);
  assert.equal(await h.ledger.read(h.db, "EXACT_PERMIT_HEAD", [h.claims.sub, "conversation-a", h.p.proposalId]), null,
    "enrollment and renewal never issue a permit");
  const permit = await issue(); // Test ledger only; no live permit or dispatch.
  assert.equal(permit.oneUse, true);
  assert.equal(permit.binding.grantVersion, writeGrant.version);
  assert.equal(permit.binding.approvalId, approval.approvalId, "valid exact human approval survives capability configuration");
  assert.equal(await h.ledger.read(h.db, "PLAN_EXECUTION", h.f.run.id), null);
  assert.equal(await h.ledger.read(h.db, "RUNTIME_PROPOSAL", h.f.run.id), null);
});
