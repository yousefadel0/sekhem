import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeReviewCard } from "../components/chat/change-review-card";
import { restoredChangeSet, type ChangeSet } from "../lib/change-review";
import { reconcileConversationSnapshot } from "../lib/conversation-restoration";
import { ChatMessageItem } from "../components/chat/chat-message-item";
const set: ChangeSet = { version: 1, id: "review", digest: "digest", conversationId: "conversation", userId: "owner", organizationId: "org", projectId: "project",
  workspace: { workspaceId: "workspace", bindingVersion: 41, runtimeId: "runtime", runtimeFingerprint: "fingerprint" },
  source: { runId: "source", sequence: 1, version: 1, digest: "source-digest" }, recommendation: { id: "recommendation", generation: 1, acceptanceId: "accept" },
  plan: { id: "plan", version: 2, digest: "plan-digest" }, authorization: "NOT_GRANTED", executionEnabled: false,
  changes: (["ADDED", "MODIFIED", "REMOVED"] as const).map((type, i) => ({ id: `change-${i}`, path: "index.html", scope: "section.hero h1", type,
    reason: `Reason ${i}`, what: `What ${i}`, how: `How ${i}`, before: type === "ADDED" ? "" : "old", after: type === "REMOVED" ? "" : "new", start: 1, end: 4,
    evidenceRef: "receipt", beforeSha256: "before-hash", afterSha256: "after-hash", status: "PENDING" })) };
test("Change Review groups Added/Modified/Removed with Why/What/How and exact scope", () => {
  const html = renderToStaticMarkup(<ChangeReviewCard changeSet={set} />);
  for (const text of ["Change Review", "Added", "Modified", "Removed", "Why", "What", "How", "index.html", "section.hero h1", "Reason 2", "Proposed after", "approval and execution controls still apply"]) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /Execute now|Undo/); assert.equal((html.match(/disabled=""/g) || []).length, 6);
});
test("empty review omits unchanged content", () => {
  const html = renderToStaticMarkup(<ChangeReviewCard changeSet={{ ...set, changes: [] }} />);
  assert.match(html, /No changes. Unchanged content is omitted/); assert.doesNotMatch(html, /Added \(/);
});
test("reload/replay restores one persisted review without enabling stale controls", () => {
  const snapshot: any = { id: "conversation", projectId: "project", agentRuns: [], messages: [{ id: set.id, conversationId: "conversation", senderType: "assistant", content: "Review", metadata: { changeSet: set } }] };
  const first = reconcileConversationSnapshot(undefined, structuredClone(snapshot));
  const replay = reconcileConversationSnapshot(first, structuredClone(snapshot));
  assert.equal(replay.messages.length, 1); assert.deepEqual(restoredChangeSet(replay.messages[0].metadata?.changeSet, "conversation"), set);
});
test("other conversation and invalid review cannot restore a card", () => {
  assert.equal(restoredChangeSet(set, "other"), null);
  for (const value of [{ ...set, executionEnabled: true }, { ...set, changes: [{ ...set.changes[0], after: "" }] }, { ...set, changes: [...set.changes, set.changes[0]] }])
    assert.equal(restoredChangeSet(value, "conversation"), null);
});
test("timeline renders only the saved assistant review for its own conversation", () => {
  const message: any = { id: "review-message", conversationId: "conversation", senderType: "assistant", content: "Review", metadata: { changeSet: set } };
  assert.match(renderToStaticMarkup(<ChatMessageItem message={message} />), /aria-label="Change Review"/);
  for (const modified of [{ ...message, senderType: "user" }, { ...message, conversationId: "other" }])
    assert.doesNotMatch(renderToStaticMarkup(<ChatMessageItem message={modified} />), /aria-label="Change Review"/);
});
