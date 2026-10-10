import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const page = readFileSync("app/page.tsx", "utf8");
test("normal conversation has no mode selector or separate plan-generation action", () => {
  assert.doesNotMatch(page, /openConversationMode|Other saved conversation modes|resolveWorkspaceConversation|generateConversationPlan|planningInFlight|activeMode/);
  assert.match(page, /SEKHEM · Conversation/);
  assert.match(page, /<CommandComposer/);
  assert.match(page, /postConversationMessage/);
});
test("historical conversations, run review and explicit authorization controls remain accessible", () => {
  assert.match(page, /<SessionList/); assert.match(page, /handleSelectSession/);
  assert.match(page, /<AgentControlCard/); assert.match(page, /<AgentWorkspace/);
  assert.match(page, /runState.history/); assert.match(page, /conversation=/);
});
