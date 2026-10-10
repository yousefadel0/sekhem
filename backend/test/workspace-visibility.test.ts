import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { ConversationService } from "../src/conversation/conversation.service";
import { ExecutionModeDetectorService } from "../src/agent-runtime/execution-mode-detector.service";
import { requestsWorkspace, requestsWorkspaceVisibility } from "../src/agent-runtime/workspace-intent";
import type { ConversationMessageDto } from "../src/conversation/conversation.dto";

for (const question of ["شايف المشروع؟", "شايف الملفات؟", "شايف ملفات المشروع؟", "إيه الموجود هنا؟", "what files are here?", "can you see the project?", "Can you see my project?", "Can you see the files?"]) {
  test(`visibility uses verified metadata without a model call or inspection: ${question}`, async () => {
    const h = await inspectionHarness();
    const service = new ConversationService(h.db, {} as ConstructorParameters<typeof ConversationService>[1], undefined, undefined, undefined, undefined, undefined,
      new ExecutionModeDetectorService(), undefined, undefined, h.store);
    const before = [...h.tables.agentRun.keys()], state = await h.state(), ledger = JSON.stringify([...h.tables.auditEvent]), plans = h.tables.agentPlan.size;
    const result = await service.postMessage("conversation-a", h.claims, { content: question, metadata: { clientMessageId: "visibility" } }) as ConversationMessageDto;
    assert.match(result.content, /session\.ts/);
    assert.match(result.content, /Fixture/);
    assert.equal(requestsWorkspaceVisibility(question), true);
    assert.equal(requestsWorkspace(question), false);
    assert.deepEqual([...h.tables.agentRun.keys()], before);
    assert.deepEqual(await h.state(), state);
    assert.equal(h.calls.length, 0);
    assert.equal(h.tables.agentPlan.size, plans);
    assert.equal(JSON.stringify([...h.tables.auditEvent]), ledger);
    assert.match(result.content, /ما بدأش قراءة محتوى|did not start a file-content read/);
    assert.equal((await h.request("poll")).execution, null);
    assert.equal((await service.postMessage("conversation-a", h.claims, { content: question, metadata: { clientMessageId: "visibility" } }) as ConversationMessageDto).id, result.id);
  });
}
test("visibility cannot swallow an explicit operation, or disclose another user's binding", async () => {
  assert.equal(requestsWorkspaceVisibility("شايف المشروع؟ اقرأ auth.ts"), false);
  assert.equal(requestsWorkspaceVisibility("Can you see my project? Modify auth.ts"), false);
  for (const text of ["شايف المشروع؟ غير عنوان الـHero", "What files are here? Read index.html", "Can you see the project? Analyze it", "Can you see the project? delete index.html"]) assert.equal(requestsWorkspaceVisibility(text), false);
  const h = await inspectionHarness();
  assert.deepEqual(await h.store.visibility("other", "project-a", "org-a"), { binding: null, listing: null });
});

test("workspace context exposes only current read coverage and historical listing, without dispatch", async () => {
  const h = await inspectionHarness();
  const grant = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: grant.version, durationMinutes: 60 });
  const before = JSON.stringify([...h.tables.auditEvent]);
  const context = await h.runtime.context(h.claims, "project-a");
  assert.equal(context.binding?.workspaceId, h.binding.workspaceId);
  assert.equal(context.runtime?.runtimeId, h.device.runtimeId);
  assert.equal(context.availability, "READY");
  assert.deepEqual(context.readCapabilities.sort(), ["filesystem.list", "filesystem.read", "filesystem.search"]);
  assert.equal(context.listing?.entries[0].name, "session.ts");
  assert.equal(JSON.stringify([...h.tables.auditEvent]), before);
  assert.equal((await h.request("poll")).execution, null);
});

test("corrupt workspace visibility fails closed rather than returning an empty successful workspace", async () => {
  const h = await inspectionHarness();
  const head = [...h.tables.auditEvent.values()].find(row => row.id.startsWith("ws1_active_"));
  head.metadata.payloadDigest = "0".repeat(64);
  await assert.rejects(h.runtime.context(h.claims, "project-a"), /WORKSPACE_STORE_CORRUPT/);
  assert.equal(h.calls.length, 0);
});

test("expired read access retains historical visibility without claiming available read capabilities", async () => {
  const h = await inspectionHarness(), realNow = Date.now;
  const grant = await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "filesystem.search"], new Date(Date.now() + 60000).toISOString());
  try {
    Date.now = () => Date.parse(grant.expiresAt!) + 1;
    const context = await h.runtime.context(h.claims, "project-a");
    assert.equal(context.availability, "EXPIRED_GRANT"); assert.deepEqual(context.readCapabilities, []);
    assert.equal(context.listing?.entries[0].name, "session.ts");
  } finally { Date.now = realNow; }
});
