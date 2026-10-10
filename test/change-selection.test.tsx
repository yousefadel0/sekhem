import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeReviewCard } from "../components/chat/change-review-card";
import { restoredChangeReviewState, changeDecisionBody, submitChangeReviewDecision, type ChangeSet } from "../lib/change-review";
import { reconcileConversationSnapshot } from "../lib/conversation-restoration";
import { readFileSync } from "node:fs";
const set: ChangeSet = { version: 1, id: "review", digest: "digest", conversationId: "conversation", userId: "owner", organizationId: "org", projectId: "project",
  workspace: { workspaceId: "workspace", bindingVersion: 41, runtimeId: "runtime", runtimeFingerprint: "fp" },
  source: { runId: "source", sequence: 1, version: 1, digest: "source" }, recommendation: { id: "rec", generation: 1, acceptanceId: "accept" },
  plan: { id: "plan", version: 2, digest: "plan" }, authorization: "NOT_GRANTED", executionEnabled: false,
  changes: (["ADDED", "MODIFIED", "REMOVED"] as const).map((type, i) => ({ id: `c${i}`, path: "index.html", scope: "hero", type,
    reason: "Reason", what: "What", how: "How", before: type === "ADDED" ? "" : "old", after: type === "REMOVED" ? "" : "new", start: 1, end: 4,
    evidenceRef: "receipt", beforeSha256: "hash", afterSha256: "hash", status: "PENDING" })) };
const state = { available: true, locked: false, changeSetId: set.id, changeSetDigest: set.digest, revision: 3,
  decisions: { c0: "PENDING", c1: "KEEP", c2: "REJECT" } as const };
test("Keep/Reject controls preserve grouping, explanations, before/after and independent states", () => {
  const html = renderToStaticMarkup(<ChangeReviewCard changeSet={set} state={state} onDecision={() => {}} />);
  for (const text of ["Added", "Modified", "Removed", "Why", "What", "How", "Before", "Proposed after", "pending", "kept", "rejected"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/>Keep<\/button>/g) || []).length, 3); assert.equal((html.match(/>Reject<\/button>/g) || []).length, 3);
  assert.doesNotMatch(html, /disabled=""/); assert.match(html, /it never reverses or executes anything/);
});
test("decision request is bounded to one change and authoritative expected revision", () => {
  assert.deepEqual(changeDecisionBody(set, state, "c1", "REJECT", "request"), { changeSetId: "review", changeSetVersion: 1, changeSetDigest: "digest", changeId: "c1", decision: "REJECT", expectedRevision: 3, requestId: "request" });
  assert.throws(() => changeDecisionBody(set, state, "other", "KEEP", "request"), /unavailable/);
});
test("old/invalid/cross-review snapshots cannot restore actionable controls", () => {
  for (const saved of [undefined, { ...state, available: "yes" }, { ...state, changeSetId: "other" }, { ...state, changeSetDigest: "old" }, { ...state, decisions: { c0: "KEEP" } }, { ...state, revision: -1 }]) {
    const restored = restoredChangeReviewState(saved, set); assert.equal(restored.available, false);
    assert.throws(() => changeDecisionBody(set, restored, "c0", "KEEP", "request"), /unavailable/);
  }
});
test("authoritative reload/replay restores one card and the same kept/rejected/pending decisions", () => {
  const snapshot: any = { id: set.conversationId, projectId: "project", agentRuns: [], messages: [{ id: set.id, conversationId: set.conversationId, senderType: "assistant", content: "Review", metadata: { changeSet: set, changeReviewState: state } }] };
  const first = reconcileConversationSnapshot(undefined, structuredClone(snapshot)), replay = reconcileConversationSnapshot(first, structuredClone(snapshot));
  assert.equal(replay.messages.length, 1); assert.deepEqual(restoredChangeReviewState(replay.messages[0].metadata.changeReviewState, set), state);
});
test("locked review and pending request disable all decision controls", () => {
  for (const props of [{ state: { ...state, available: false, locked: true } }, { state, busy: true }]) {
    const html = renderToStaticMarkup(<ChangeReviewCard changeSet={set} {...props} onDecision={() => {}} />);
    assert.equal((html.match(/disabled=""/g) || []).length, 6);
  }
  assert.throws(() => changeDecisionBody(set, { ...state, locked: true }, "c0", "KEEP", "r"), /unavailable/);
});
test("review submission uses only decisions followed by authoritative refresh; no execution API", () => {
  const client = readFileSync("components/chat/change-review.tsx", "utf8");
  assert.match(client, /await submitChangeReviewDecision/); assert.match(client, /getConversation/);
  assert.match(client, /if \(!live.current \|\| !next\) return/); assert.match(client, /if \(inFlight.current \|\| !available\) return/);
  assert.doesNotMatch(client, /issuePermit|executePlan|filesystem.write|localStorage|prepareExactProposal/);
});

test("unavailable authority preserves historical decisions while disabling action", () => {
  const restored = restoredChangeReviewState({ ...state, available: false, reason: "CHANGE_SET_SOURCE_CHANGED" }, set);
  assert.equal(restored.available, false); assert.equal(restored.decisions!.c1, "KEEP");
  const html = renderToStaticMarkup(<ChangeReviewCard changeSet={set} state={restored} onDecision={() => {}} />);
  assert.match(html, /kept/); assert.match(html, /rejected/); assert.equal((html.match(/disabled=""/g) || []).length, 6);
});

test("decision submission/replay uses the same request binding and only POST decision then GET state", async () => {
  const calls: any[] = [], deps = { current: () => true,
    decide: async (conversationId: string, body: any) => { calls.push(["decision", conversationId, body]); return { revision: 3 }; },
    read: async (conversationId: string) => { calls.push(["read", conversationId]); return { id: set.conversationId, messages: [{ id: set.id, metadata: { changeReviewState: state } }] }; } };
  assert.deepEqual(await submitChangeReviewDecision(set, state, "c1", "KEEP", "same-request", deps), state);
  assert.deepEqual(await submitChangeReviewDecision(set, state, "c1", "KEEP", "same-request", deps), state);
  assert.deepEqual(calls.map(c => c[0]), ["decision", "read", "decision", "read"]); assert.deepEqual(calls[0], calls[2]);
});
test("conversation switch before/during decision prevents old state restoration and downstream reads", async () => {
  let current = false, calls = 0;
  const deps = { current: () => current, decide: async () => { calls++; current = false; }, read: async () => { throw new Error("OLD_CONVERSATION_READ"); } };
  assert.equal(await submitChangeReviewDecision(set, state, "c0", "KEEP", "request", deps), null); assert.equal(calls, 0);
  current = true;
  assert.equal(await submitChangeReviewDecision(set, state, "c0", "KEEP", "request", deps), null); assert.equal(calls, 1);
});
test("late snapshot, wrong conversation and rejected decision never restore action or fall back", async () => {
  let current = true, reads = 0;
  const deps = { current: () => current, decide: async () => {}, read: async () => { reads++; current = false; return { id: "other", messages: [] }; } };
  assert.equal(await submitChangeReviewDecision(set, state, "c0", "REJECT", "request", deps), null);
  current = true;
  const wrong = await submitChangeReviewDecision(set, state, "c0", "REJECT", "request", { ...deps, read: async () => ({ id: "other", messages: [] }) });
  assert.equal(wrong!.available, false);
  await assert.rejects(submitChangeReviewDecision(set, state, "c0", "KEEP", "request", { ...deps, decide: async () => { throw new Error("STALE"); } }), /STALE/);
  assert.equal(reads, 1);
});
