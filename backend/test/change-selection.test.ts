import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ConversationController } from "../src/conversation/conversation.controller";
import { fixture } from "./helpers/change-set-harness";
import { prepareChangeSet } from "../src/conversation/change-set";
import { decideChange, selectionHead, changeReviewState, readExactProposal, readChangeDecisionRevision } from "../src/conversation/change-selection";
import { ExactProposalService, validateExactProposal } from "../src/agent-runtime/execution/exact-proposal.service";
import { ExactProposalApprovalService } from "../src/agent-runtime/execution/exact-proposal-approval.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";

async function setup(multi = false, replacement = "products") {
  const h = await fixture();
  const p = h.plan.steps[0].parameters;
  p.planning.understanding = { scope: [{ id: "file", kind: "EVIDENCE", reference: "index.html" }] };
  p.planning.plan.steps = [{ id: "write", type: "IMPLEMENT", effect: "WRITE", scopeRefs: ["file"], dependencies: [] },
    { id: "verify", type: "VERIFY", effect: "READ_ONLY", scopeRefs: ["file"], dependencies: ["write"] }];
  h.fresh.references[0].relativePath = "index.html"; h.fresh.references[0].truncated = false;
  p.engineeringPlan.evidenceReferences = h.fresh.references;
  h.certified.source = structuredClone(h.fresh);
  if (multi) p.planning.plan.constraints = [];
  const { digest, ...base } = p.engineeringPlan;
  p.engineeringPlan.digest = toolDigest({ ...base, summary: h.plan.summary, result: p.planning }); h.body.planDigest = p.engineeringPlan.digest;
  await h.db.agentPlan.update({ where: { id: h.plan.id }, data: { steps: h.plan.steps } });
  let historical: any;
  if (multi) {
    const source = h.certified.context.evidence[0].content.text, hash = (s: string) => createHash("sha256").update(s).digest("hex");
    const base = { version: 1, proposalId: "historical-proposal", status: "EXACT_PROPOSAL_READY", conversationId: h.run.conversationId,
      userId: h.claims.sub, organizationId: h.claims.organizationId, projectId: h.run.projectId, planId: h.plan.id, planVersion: h.plan.version,
      planDigest: h.body.planDigest, requestDigest: "prior", sourceRunId: h.fresh.sourceRunId, sourceSequence: 1, sourceDigest: h.fresh.digest,
      workspace: p.engineeringPlan.workspace, evidenceReferences: h.fresh.references, actions: [], artifacts: [],
      changes: [["experiences", replacement], ["Building", "Creating"]].map(([before, after]) => ({ path: "index.html", before, after, originalHash: hash(source), updatedHash: hash(source.replace(before, after)) })),
      authorization: "NOT_GRANTED", executionEnabled: false };
    historical = { ...base, digest: toolDigest(base) };
    await h.ledger.transaction(tx => h.ledger.create(tx, "EXACT_PROPOSAL", [h.claims.sub, h.run.conversationId, h.plan.id], historical, { immutable: true }));
  }
  const set = await prepareChangeSet(h.deps, h.run.conversationId, h.claims, h.body);
  const request = (decision: "KEEP" | "REJECT" | "PENDING", revision = 0, requestId = "decision") => ({ changeSetId: set.id, changeSetVersion: set.version,
    changeSetDigest: set.digest, changeId: set.changes[0].id, decision, expectedRevision: revision, requestId });
  const decide = (body: any, claims = h.claims, conversation = h.run.conversationId) => decideChange(h.deps, conversation, claims, body);
  const gateway: any = { requestStructuredReasoning: async () => { throw new Error("NO_MODEL_OPERATION_ALLOWED"); } };
  const evidence: any = { admit: async () => ({ operation: { tool: "filesystem.read" }, reference: h.fresh.references[0], file: { text: h.certified.context.evidence[0].content.text } }) };
  const service = new ExactProposalService(h.ledger, h.deps.inspections as any, gateway, evidence);
  const proposalBody = () => ({ ...h.body, requestId: "selected-proposal" });
  return { ...h, set, request, decide, service, proposalBody, historical, approvalCount: h.tables.agentApproval.size, authorityRows: [...h.tables.auditEvent.values()].filter(r => /PERMIT|EXECUTION/.test(r.metadata?.recordType ?? "")).map(r => r.id) };
}
for (const decision of ["KEEP", "REJECT", "PENDING"] as const) test(`${decision} persists immutable audited revision and exact provenance`, async () => {
  const h = await setup(), before = structuredClone(h.set);
  const selection = await h.decide(h.request(decision));
  assert.equal(selection.revision, 1); assert.equal(selection.decisions[h.set.changes[0].id], decision);
  assert.deepEqual(selection.keptChangeIds, decision === "KEEP" ? [h.set.changes[0].id] : []);
  assert.deepEqual(selection.workspace, h.set.workspace); assert.deepEqual(selection.source, h.set.source); assert.deepEqual(selection.plan, h.set.plan);
  assert.equal(selection.actor.sessionId, h.claims.sessionId); assert.equal(selection.actor.userId, h.claims.sub);
  const row = await h.ledger.transaction(tx => h.ledger.read(tx, "CHANGE_SELECTION_REVISION", [h.claims.sub, h.run.conversationId, h.set.id, 1]));
  assert.equal(row!.immutable, true); assert.deepEqual(row!.payload, selection);
  assert.equal(selection.executionEnabled, false); assert.equal(selection.authorization, "NOT_GRANTED");
  assert.ok(selection.selectedChanges.every(c => c.status === "KEPT"));
  assert.equal(selection.selectedChanges.length, decision === "KEEP" ? 1 : 0);
  assert.deepEqual((await h.db.conversationMessage.findUnique({ where: { id: h.set.id } })).metadata.changeSet, before);
  assert.equal(h.tables.agentApproval.size, h.approvalCount);
});

test("decision replay is idempotent and request identity cannot change decision/session", async () => {
  const h = await setup(), body = h.request("KEEP"), first = await h.decide(body), count = h.tables.auditEvent.size;
  assert.deepEqual(await h.decide(body), first); assert.equal(h.tables.auditEvent.size, count);
  await assert.rejects(h.decide({ ...body, decision: "REJECT" }), /REPLAY_CONFLICT/);
  await assert.rejects(h.decide(body, { ...h.claims, sessionId: "other-session" }), /REPLAY_CONFLICT/);
});
test("historical decision revisions remain immutable while the head advances", async () => {
  const h = await setup(), first = await h.decide(h.request("KEEP"));
  const second = await h.decide(h.request("REJECT", 1, "second"));
  assert.equal(second.revision, 2); assert.deepEqual(second.keptChangeIds, []);
  const old = await h.ledger.transaction(tx => h.ledger.read(tx, "CHANGE_SELECTION_REVISION", [h.claims.sub, h.run.conversationId, h.set.id, 1]));
  assert.deepEqual(old!.payload, first); assert.equal(old!.immutable, true);
  const projection = await changeReviewState(h.deps, h.run.conversationId, h.claims, h.set);
  assert.equal(projection.revision, 2); assert.equal(projection.history!.length, 2); assert.deepEqual(projection.selectedChanges, []);
});
for (const field of ["changeSetVersion", "changeSetDigest", "changeId", "expectedRevision"]) test(`stale ${field} fails closed`, async () => {
  const h = await setup(), body: any = h.request("KEEP"); body[field] = field === "changeSetVersion" || field === "expectedRevision" ? 99 : "wrong";
  await assert.rejects(h.decide(body), /INVALID|CHANGED|STALE/);
  assert.equal(await h.ledger.transaction(tx => selectionHead(h.ledger, tx, h.set)), null);
});
for (const field of ["workspaceId", "version", "runtimeId", "runtimeFingerprint"]) test(`changed source ${field} rejects decisions and disables restored controls`, async () => {
  const h = await setup(); h.fresh.binding = { ...h.fresh.binding, [field]: field === "version" ? 999 : "other" };
  await assert.rejects(h.decide(h.request("KEEP")), /SOURCE_CHANGED/);
  assert.equal((await changeReviewState(h.deps, h.run.conversationId, h.claims, h.set)).available, false);
});
for (const [name, change] of [["user", { sub: "other" }], ["organization", { organizationId: "other" }], ["expired session", { exp: 1 }]]) test(`unauthorized ${name} cannot decide`, async () => {
  const h = await setup(); await assert.rejects(h.decide(h.request("KEEP"), { ...h.claims, ...change } as any), /INVALID|CHANGED/);
});
test("cross-conversation decisions are rejected", async () => {
  const h = await setup(); await assert.rejects(h.decide(h.request("KEEP"), h.claims, "other-conversation"), /CHANGED/);
});
test("pending/rejected changes cannot create or fall back to an existing Exact Proposal", async () => {
  const h = await setup(true);
  assert.equal(await h.ledger.transaction(tx => readExactProposal(h.ledger, tx, h.claims.sub, h.run.conversationId, h.plan.id)), null);
  await assert.rejects(h.service.prepare(h.run.conversationId, h.claims, h.proposalBody()), /KEEP_REQUIRED/);
  await h.decide(h.request("REJECT"));
  await assert.rejects(h.service.prepare(h.run.conversationId, h.claims, h.proposalBody()), /KEEP_REQUIRED/);
  assert.equal(h.tables.agentApproval.size, h.approvalCount);
});
test("only KEPT changes enter a new immutable proposal; rejected change and old proposal stay unchanged", async () => {
  const h = await setup(true), before = h.certified.context.evidence[0].content.text;
  const first = await h.decide(h.request("KEEP"));
  assert.equal(first.decisions[h.set.changes[1].id], "PENDING");
  await h.decide({ ...h.request("REJECT", 1, "reject-other"), changeId: h.set.changes[1].id });
  const review = await changeReviewState(h.deps, h.run.conversationId, h.claims, h.set);
  assert.deepEqual(review.selectedChanges!.map(c => c.id), [h.set.changes[0].id]);
  const proposal = await h.service.prepare(h.run.conversationId, h.claims, h.proposalBody());
  assert.notEqual(proposal.proposalId, h.historical.proposalId); assert.equal(proposal.changeReview!.previousProposalId, h.historical.proposalId);
  assert.deepEqual(proposal.changeReview!.changeIds, [h.set.changes[0].id]); assert.equal(proposal.changeReview!.selectedRevision, 2);
  assert.equal(proposal.changeReview!.changeSetDigest, h.set.digest); assert.deepEqual(proposal.workspace, h.set.workspace);
  assert.equal(proposal.actions[0].input.content, before.replace("experiences", "products"));
  assert.match(String(proposal.actions[0].input.content), /Building/); assert.doesNotMatch(String(proposal.actions[0].input.content), /Creating/);
  assert.equal(proposal.authorization, "NOT_GRANTED"); assert.equal(proposal.executionEnabled, false);
  validateExactProposal(proposal, h.plan, h.fresh, h.claims, h.run.conversationId);
  assert.deepEqual(await h.service.prepare(h.run.conversationId, h.claims, h.proposalBody()), proposal);
  const old = await h.ledger.transaction(tx => h.ledger.read(tx, "EXACT_PROPOSAL", [h.claims.sub, h.run.conversationId, h.plan.id]));
  assert.deepEqual(old!.payload, h.historical);
  assert.equal(h.tables.agentApproval.size, h.approvalCount);
  assert.deepEqual([...h.tables.auditEvent.values()].filter(r => /PERMIT|EXECUTION/.test(r.metadata?.recordType ?? "")).map(r => r.id), h.authorityRows);
  assert.equal((await changeReviewState(h.deps, h.run.conversationId, h.claims, h.set)).locked, true);
  await assert.rejects(h.decide(h.request("REJECT", 2, "late")), /LOCKED/);
});
test("a single kept Hero change preserves certified constraints and proposal replay", async () => {
  const h = await setup(); await h.decide(h.request("KEEP"));
  const proposal = await h.service.prepare(h.run.conversationId, h.claims, h.proposalBody());
  assert.equal(proposal.changes[0].before, "experiences"); assert.equal(proposal.changes[0].after, "products");
  assert.deepEqual(await h.service.continuePlan(h.run.conversationId, h.claims, h.proposalBody()), proposal);
});
test("recommendation rejection prevents decisions and selected-proposal resolution", async () => {
  const h = await setup(); await h.decide(h.request("KEEP"));
  await h.service.prepare(h.run.conversationId, h.claims, h.proposalBody());
  await h.db.conversationMessage.create({ data: { id: "reject-recommendation", conversationId: h.run.conversationId, senderType: "user", senderId: h.claims.sub,
    metadata: { recommendationId: "recommendation", recommendationResponse: "REJECT" } } });
  await assert.rejects(h.decide(h.request("KEEP", 1, "other")), /RECOMMENDATION_REJECTED/);
  await assert.rejects(h.ledger.transaction(tx => readExactProposal(h.ledger, tx, h.claims.sub, h.run.conversationId, h.plan.id)), /RECOMMENDATION_REJECTED/);
});
test("source admission failures produce no selected proposal, approval, or permit", async () => {
  const h = await setup(); await h.decide(h.request("KEEP"));
  h.certified.context.evidence[0].content.text = "fabricated";
  await assert.rejects(h.service.prepare(h.run.conversationId, h.claims, h.proposalBody()), /EXACT_EVIDENCE_REQUIRED/);
  assert.equal(await h.ledger.transaction(tx => readExactProposal(h.ledger, tx, h.claims.sub, h.run.conversationId, h.plan.id)), null);
  assert.equal(h.tables.agentApproval.size, h.approvalCount);
});

test("selected proposal uses the existing approval gate and excludes the historical proposal", async () => {
  const h = await setup(true); await h.decide(h.request("KEEP"));
  const p = await h.service.prepare(h.run.conversationId, h.claims, h.proposalBody());
  const evidence: any = { admit: async () => {} };
  const approvals = new ExactProposalApprovalService(h.ledger, h.deps.inspections as any, evidence, h.identity,
    new ResourceAuthorizationService(h.db), { recordWithClaimsTx: async () => {} } as any);
  const body = { planId: p.planId, proposalVersion: p.version, proposalDigest: p.digest };
  const pending = await approvals.request(h.run.conversationId, p.proposalId, h.claims, body);
  assert.equal(pending.status, "PENDING"); assert.equal(pending.binding.proposalId, p.proposalId); assert.equal(pending.binding.proposalDigest, p.digest);
  assert.deepEqual(pending.binding.workspace, h.set.workspace); assert.equal(pending.binding.planDigest, h.set.plan.digest);
  await assert.rejects(approvals.request(h.run.conversationId, h.historical.proposalId, h.claims,
    { ...body, proposalDigest: h.historical.digest }), /SOURCE_CHANGED/);
  await assert.rejects(approvals.decide(h.run.conversationId, p.proposalId, h.claims,
    { ...body, approvalId: pending.approvalId, fingerprint: "0".repeat(64), decision: "APPROVED" }), /EXACT_APPROVAL_CHANGED/);
});

test("historical revisions remain readable after stale workspace authority; other actors stay isolated", async () => {
  const h = await setup(), first = await h.decide(h.request("KEEP"));
  h.fresh.binding = { ...h.fresh.binding, version: 999 };
  const state = await changeReviewState(h.deps, h.run.conversationId, h.claims, h.set);
  assert.equal(state.available, false); assert.equal(state.decisions![h.set.changes[0].id], "KEEP");
  assert.deepEqual(await readChangeDecisionRevision(h.ledger, h.run.conversationId, h.claims, h.set.id, 1), first);
  await assert.rejects(readChangeDecisionRevision(h.ledger, h.run.conversationId, { ...h.claims, sub: "other" }, h.set.id, 1), /CHANGED/);
  await assert.rejects(readChangeDecisionRevision(h.ledger, h.run.conversationId, h.claims, h.set.id, 2), /UNAVAILABLE/);
});
test("failed decision persistence rolls back head/revision atomically", async () => {
  const h = await setup(), create = h.ledger.create.bind(h.ledger), before = h.tables.auditEvent.size;
  h.ledger.create = async (...args: any[]) => { if (args[1] === "CHANGE_DECISION") throw new Error("persist-failed"); return (create as any)(...args); };
  await assert.rejects(h.decide(h.request("KEEP")), /persist-failed/);
  assert.equal(h.tables.auditEvent.size, before);
  assert.equal(await h.ledger.transaction(tx => selectionHead(h.ledger, tx, h.set)), null);
});
test("concurrent decisions serialize against expected selection revision", async () => {
  const h = await setup(true);
  const results = await Promise.allSettled([h.decide(h.request("KEEP")), h.decide({ ...h.request("REJECT", 0, "concurrent"), changeId: h.set.changes[1].id })]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.match(rejected.reason.message, /STALE/);
});

for (const [replacement, type] of [["experiences plus", "ADDED"], ["", "REMOVED"]]) test(`kept ${type} change reaches proposal without its rejected sibling`, async () => {
  const h = await setup(true, replacement), source = h.certified.context.evidence[0].content.text;
  assert.equal(h.set.changes[0].type, type);
  await h.decide(h.request("KEEP"));
  await h.decide({ ...h.request("REJECT", 1, "reject-sibling"), changeId: h.set.changes[1].id });
  const p = await h.service.prepare(h.run.conversationId, h.claims, h.proposalBody());
  assert.equal(p.actions[0].input.content, source.replace("experiences", replacement));
  assert.deepEqual(p.changeReview!.changeIds, [h.set.changes[0].id]);
});
test("decision and historical-read endpoints require a durable authenticated session and delegate no authority", async () => {
  const calls: any[] = [], claims: any = { sub: "owner" }, body = { decision: "KEEP" };
  const controller = new ConversationController({ decideChange: async (...args: any[]) => { calls.push(args); return { revision: 1 }; },
    changeDecisionRevision: async (...args: any[]) => { calls.push(args); return { revision: 1 }; } } as any,
    { validateDurableSession: async (cookie: string) => { assert.equal(cookie, "session"); return claims; } } as any);
  await controller.decideChange("conversation", "session", body);
  await controller.changeDecisionRevision("conversation", "set", "1", "session");
  assert.deepEqual(calls, [["conversation", claims, body], ["conversation", claims, "set", 1]]);
  const denied = new ConversationController({ decideChange: async () => { throw new Error("DISPATCHED"); } } as any,
    { validateDurableSession: async () => { throw new Error("UNAUTHENTICATED"); } } as any);
  await assert.rejects(denied.decideChange("conversation", undefined, body), /UNAUTHENTICATED/);
});

test("malformed/coerced decisions and authority-bearing extra fields are rejected before persistence", async () => {
  const h = await setup();
  for (const change of [{ decision: ["KEEP"] }, { decision: {} }, { decision: "APPROVED" }, { approval: true }, { execute: true }])
    await assert.rejects(h.decide({ ...h.request("KEEP"), ...change }), /CHANGE_DECISION_INVALID/);
  assert.equal(await h.ledger.transaction(tx => selectionHead(h.ledger, tx, h.set)), null);
});
