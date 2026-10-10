import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { prepareChangeSet, reviewChange, proposalReviewChange } from "../src/conversation/change-set";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { fixture, source } from "./helpers/change-set-harness";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const hunk = { path: "index.html", scope: "section.hero h1", start: 0, end: 3, before: "abc", after: "xyz", evidenceRef: "receipt", reason: "Reason", what: "What", how: "How" };
for (const [before, after, type] of [["abc", "xyz", "MODIFIED"], ["", "xyz", "ADDED"], ["abc", "", "REMOVED"]])
  test(`exact ${type} content is classified and Why/What/How retained`, () => {
    const c = reviewChange({ ...hunk, before, after, end: before.length }, "abcdef", sha("abcdef"))!;
    assert.equal(c.type, type); assert.equal(c.status, "PENDING"); assert.equal(c.reason, "Reason"); assert.equal(c.what, "What"); assert.equal(c.how, "How");
    assert.deepEqual(c, reviewChange({ ...hunk, before, after, end: before.length }, "abcdef", sha("abcdef")));
  });
test("unchanged content is omitted", () => assert.equal(reviewChange({ ...hunk, after: "abc" }, "abcdef", sha("abcdef")), null));
test("unchanged anchors in a persisted proposal are excluded from added/removed content", () => {
  const base = { path: "index.html", before: "abc", originalHash: sha("abcdef") };
  const added = proposalReviewChange("abcdef", { ...base, after: "abcXYZ", updatedHash: sha("abcXYZdef") }, "receipt")!;
  assert.equal(added.type, "ADDED"); assert.equal(added.before, ""); assert.equal(added.after, "XYZ");
  const removed = proposalReviewChange("abcdef", { ...base, after: "a", updatedHash: sha("adef") }, "receipt")!;
  assert.equal(removed.type, "REMOVED"); assert.equal(removed.before, "bc"); assert.equal(removed.after, "");
});
test("fabricated before-state, normalized whitespace, stale hash and escaping paths fail closed", () => {
  for (const input of [{ before: "ABC" }, { before: "a bc" }, { path: "../index.html" }, { start: -1 }])
    assert.throws(() => reviewChange({ ...hunk, ...input }, "abcdef", sha("abcdef")), /EXACT_EVIDENCE_REQUIRED/);
  assert.throws(() => reviewChange(hunk, "abcdef", sha("old")), /EXACT_EVIDENCE_REQUIRED/);
});

async function proposal(h: Awaited<ReturnType<typeof fixture>>, replacement = "products") {
  const before = "experiences", after = source.replace(before, replacement);
  const base = { version: 1, proposalId: "exact-proposal", status: "EXACT_PROPOSAL_READY", conversationId: h.run.conversationId,
    userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: h.run.projectId, planId: h.plan.id, planVersion: h.plan.version,
    planDigest: h.body.planDigest, requestDigest: "request-digest", sourceRunId: h.fresh.sourceRunId, sourceSequence: 1, sourceDigest: h.fresh.digest,
    workspace: h.plan.steps[0].parameters.engineeringPlan.workspace, evidenceReferences: h.fresh.references, actions: [], artifacts: [],
    changes: [{ path: "index.html", before, after: replacement, originalHash: sha(source), updatedHash: sha(after) }], authorization: "NOT_GRANTED", executionEnabled: false };
  return h.ledger.transaction(tx => h.ledger.create(tx, "EXACT_PROPOSAL", [h.claims.sub, h.run.conversationId, h.plan.id], { ...base, digest: toolDigest(base) }, { immutable: true }));
}
for (const [replacement, type] of [["products", "MODIFIED"], ["experiences plus", "ADDED"], ["", "REMOVED"]])
  test(`existing exact proposal produces grounded ${type} review with proposal lineage`, async () => {
    const h = await fixture(), p = h.plan.steps[0].parameters;
    p.planning.plan.constraints = [];
    const { digest, ...base } = p.engineeringPlan;
    p.engineeringPlan.digest = toolDigest({ ...base, summary: h.plan.summary, result: p.planning }); h.body.planDigest = p.engineeringPlan.digest;
    await h.db.agentPlan.update({ where: { id: h.plan.id }, data: { steps: h.plan.steps } });
    const saved = await proposal(h, replacement);
    const review = await prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body);
    assert.equal(review.changes[0].type, type); assert.equal(review.proposal!.id, saved.payload.proposalId);
    assert.equal(review.changes[0].afterSha256, saved.payload.changes[0].updatedHash);
    assert.deepEqual(await prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), review);
  });
test("a later proposal cannot mutate an existing immutable review", async () => {
  const h = await fixture(), first = await prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body);
  await proposal(h);
  assert.deepEqual(await prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), first);
});
test("ChangeSet persists immutably with exact binding, lineage and replay; no permit/execution effects", async () => {
  const h = await fixture(), before = h.tables.auditEvent.size, runs = h.tables.agentRun.size;
  const first = await prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body);
  const second = await prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body);
  assert.deepEqual(first, second); assert.equal(h.tables.auditEvent.size, before + 1); assert.equal(h.tables.agentRun.size, runs);
  assert.equal(first.source.runId, "grounded"); assert.equal(first.workspace.bindingVersion, h.binding.version); assert.equal(first.plan.id, h.plan.id);
  assert.equal(first.recommendation.acceptanceId, "accept"); assert.equal(first.changes[0].before, "experiences"); assert.equal(first.changes[0].after, "products");
  assert.equal(first.changes[0].beforeSha256, sha(source)); assert.equal(first.executionEnabled, false);
  const saved = await h.ledger.transaction(tx => h.ledger.read<any>(tx, "CHANGE_SET", [h.claims.sub, h.run.conversationId, h.plan.id, "recommendation"]));
  assert.equal(saved!.immutable, true); assert.deepEqual(saved!.payload, first);
  assert.deepEqual((await h.db.conversationMessage.findUnique({ where: { id: first.id } })).metadata.changeSet, first);
  assert.equal((await h.request("poll")).execution, null);
});
for (const field of ["workspaceId", "version", "runtimeId", "runtimeFingerprint", "rootPath"])
  test(`stale ${field} is rejected before persistence`, async () => {
    const h = await fixture(); h.fresh.binding = { ...h.fresh.binding, [field]: field === "version" ? 999 : "different" };
    await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), /SOURCE_CHANGED/);
    assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.changeSet));
  });
test("other conversation and owner cannot use the plan", async () => {
  const h = await fixture();
  await assert.rejects(prepareChangeSet(h.deps, "other-conversation", h.claims, h.body), /PROVENANCE_CHANGED/);
  await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, { ...h.claims, sub: "other" }, h.body), /PROVENANCE_CHANGED/);
});
test("rejected recommendation cannot create a ChangeSet", async () => {
  const h = await fixture(); await h.db.conversationMessage.create({ data: { id: "reject", conversationId: h.run.conversationId, senderType: "user", metadata: { recommendationResponse: "REJECT", recommendationId: "recommendation" } } });
  await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), /ACCEPTED_RECOMMENDATION_REQUIRED/);
});
test("no acceptance fails closed", async () => {
  const h = await fixture(); h.tables.conversationMessage.delete("accept");
  await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), /ACCEPTED_RECOMMENDATION_REQUIRED/);
});
test("accepted broad recommendation without deterministic exact patch fails closed", async () => {
  const h = await fixture();
  const result = h.plan.steps[0].parameters.planning; result.plan.constraints = [];
  const identity = h.plan.steps[0].parameters.engineeringPlan, { digest, ...base } = identity;
  identity.digest = toolDigest({ ...base, summary: h.plan.summary, result }); h.body.planDigest = identity.digest;
  await h.db.agentPlan.update({ where: { id: h.plan.id }, data: { steps: h.plan.steps } });
  await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), /EXACT_CHANGE_REQUIRED/);
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.changeSet));
});
test("failed message persistence rolls back the review ledger", async () => {
  const h = await fixture(), before = h.tables.auditEvent.size;
  h.db.conversationMessage.create = async () => { throw new Error("PERSISTENCE_UNAVAILABLE"); };
  await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), /PERSISTENCE_UNAVAILABLE/);
  assert.equal(h.tables.auditEvent.size, before);
});
test("changed plan version/digest and acceptance generation remain rejected", async () => {
  const h = await fixture();
  for (const body of [{ ...h.body, planVersion: 2 }, { ...h.body, planDigest: "a".repeat(64) }])
    await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, body), /PLAN_CHANGED/);
  await h.db.conversationMessage.update({ where: { id: "accept" }, data: { metadata: { recommendationResponse: "ACCEPT", recommendationId: "recommendation", recommendationGeneration: 2 } } });
  await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), /ACCEPTED_RECOMMENDATION_REQUIRED/);
});
for (const alteration of ["source", "reference", "truncation", "verification"])
  test(`ungrounded ${alteration} cannot create ChangeSet`, async () => {
    const h = await fixture(), e = h.certified.context.evidence[0];
    if (alteration === "source") e.content.text = "fabricated";
    if (alteration === "reference") e.provenance = "other-receipt";
    if (alteration === "truncation") e.content.truncated = true;
    if (alteration === "verification") e.runtimeReference.verificationState = "UNVERIFIED";
    await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body), /EXACT_EVIDENCE_REQUIRED/);
  });
test("client-proposed content cannot enter server-owned ChangeSet", async () => {
  const h = await fixture();
  await assert.rejects(prepareChangeSet(h.deps, h.run.conversationId, h.claims, { ...h.body, after: "arbitrary" }), /REQUEST_INVALID/);
});
