import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { workspaceFileReferences } from "../src/agent-runtime/workspace-intent";
import { planningInspectionInstruction } from "../src/conversation/conversation-prerequisite";
import { resolveConversationIntent, type ConversationWorkflowSummary } from "../src/conversation/conversation-intent-resolver";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { persistSubmissionFailure } from "../src/conversation/submission-failure";

const context: ConversationWorkflowSummary = { workspace: { workspaceId: "w", bindingVersion: 44, runtimeId: "r", runtimeFingerprint: "f" },
  activeInspections: [], certifiedUnderstanding: null, latestPlan: null, execution: null, pendingApprovals: [], references: [], recentConcepts: [] };
const versionRequest = 'عدّل فقط قيمة version في package.json من "0.1.0" إلى "0.1.1".\nحافظ على كل المحتوى الآخر وترتيب وتنسيق الملف.\nاعرض التغيير للمراجعة وانتظر موافقتي قبل أي تعديل.';
const liveVersionRequest = "غيّر version في package.json من 0.1.0 إلى 0.1.1 مع الحفاظ على باقي الملف كما هو، راجع التغيير واستنى موافقتي.";
test("F-03 explicit package.json with bare version operands resolves one prerequisite target", () => {
  assert.deepEqual(workspaceFileReferences(liveVersionRequest), ["package.json"]);
  assert.equal(resolveConversationIntent(liveVersionRequest, context).route, "PLANNING");
  assert.match(planningInspectionInstruction(liveVersionRequest), /^Read and analyze package.json\./);
});

test("F-03 bare version exclusion preserves genuine multiple files and paths", () => {
  for (const extra of [' Read other.json.', ' Read "src/package.json".', ' Read "0.1.0".', ' Read releases/0.1.1.']) {
    assert.equal(workspaceFileReferences(liveVersionRequest + extra).length, 2);
    assert.throws(() => planningInspectionInstruction(liveVersionRequest + extra), /INSPECTION_TARGET_AMBIGUOUS/);
  }
  assert.deepEqual(workspaceFileReferences('Change version in package.json from 0.1.0 to 0.1.1.json'), ["package.json", "0.1.0", "0.1.1.json"]);
  assert.deepEqual(workspaceFileReferences('Copy from 0.1.0 to 0.1.1'), ["0.1.0", "0.1.1"]);
  assert.deepEqual(workspaceFileReferences(liveVersionRequest + ' Read ../../outside.json'), ["package.json", "../../outside.json"]);
  assert.throws(() => planningInspectionInstruction(liveVersionRequest + ' Read ../../outside.json'), /INSPECTION_TARGET_AMBIGUOUS/);
});
test("BB-07 exact numeric replacement values are not file targets", () => {
  assert.deepEqual(workspaceFileReferences(versionRequest), ["package.json"]);
  assert.match(planningInspectionInstruction(versionRequest), /^Read and analyze package.json/);
});
test("actual quoted files and paths remain targets", () => {
  assert.deepEqual(workspaceFileReferences('Read "src/package.json" and "README.md"'), ["src/package.json", "README.md"]);
  assert.deepEqual(workspaceFileReferences('Read "0.1.0"'), ["0.1.0"]);
  assert.deepEqual(workspaceFileReferences('Copy from "0.1.0" to "0.1.1"'), ["0.1.0", "0.1.1"]);
});
test("genuine multiple targets remain fail closed", () => {
  assert.throws(() => planningInspectionInstruction(versionRequest + " Read other.json."), /INSPECTION_TARGET_AMBIGUOUS/);
});
for (const message of ["اقرأ المشروع ده وافهم هو عبارة عن إيه، وقولي إيه أهم الأجزاء والوظائف اللي فيه.", "اقرأ المشروع", "افهم المشروع", "راجع المشروع", "Understand this workspace"])
  test(`bound project root discovery: ${message}`, () => {
    const result = resolveConversationIntent(message, context);
    assert.equal(result.route, "INSPECTION"); assert.equal(result.reason, "bound-project-discovery");
    assert.match(result.inspectionInstruction!, /authorized root discovery/);
    assert.equal(resolveConversationIntent(message, { ...context, workspace: null }).route, "UNAVAILABLE");
  });
test("unresolved element references still clarify and explicit files retain priority", () => {
  assert.equal(resolveConversationIntent("Read it", context).route, "AMBIGUOUS");
  assert.equal(resolveConversationIntent("اقرأ المشروع src/package.json", context).reason, "new-workspace-inspection");
});
for (const path of ["C:\\Windows\\win.ini", "../../outside.json", "/etc/passwd"])
  test(`outside scope is blocked before model dispatch: ${path}`, () => {
    const result = resolveConversationIntent(`Read ${path}`, context);
    assert.equal(result.route, "UNAVAILABLE"); assert.equal(result.reason, "workspace-relative-scope-required");
  });
test("model outside-scope action fails with explicit scope state and zero operations", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect("filesystem.read", "../outside.json"));
  await h.service.advance(h.run.id); const state = await h.state();
  assert.equal(state.code, "INSPECTION_SCOPE_DENIED"); assert.equal(state.operations.length, 0);
  assert.equal((await h.request("poll")).execution, null);
});
test("stale grant admission rejected; fresh official admission preserves old pin", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect()); await h.service.advance(h.run.id); await h.approve();
  const old = (await h.control.snapshot(h.claims, h.run.id, (await h.state()).current!.planVersion))!.proposal;
  const immutable = { grantVersion: old.grantVersion, proposalDigest: old.proposalDigest, inputDigest: old.inputDigest };
  const grant = await h.identity.grant(h.claims, h.device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "filesystem.search"]);
  assert.equal((await h.request("poll")).rejected, true);
  const after = (await h.control.snapshot(h.claims, h.run.id, old.planVersion))!.proposal;
  assert.deepEqual({ grantVersion: after.grantVersion, proposalDigest: after.proposalDigest, inputDigest: after.inputDigest }, immutable);
  assert.ok([...h.tables.agentRunEvent.values()].some(e => e.eventType === "EXECUTION_BLOCKED" && e.payload.reason === "RUNTIME_GRANT_INVALID" && e.payload.recovery === "FRESH_ADMISSION_REQUIRED"));
  const fresh = await h.runtime.request(h.claims, "project-a", h.binding.workspaceId, "LIST", { bindingVersion: h.binding.version, relativePath: "", conversationId: "conversation-a", requestId: "fresh-read" });
  const snapshot = (await h.control.snapshot(h.claims, fresh.operation.runId))!;
  assert.equal(snapshot.proposal.grantVersion, grant.version);
  await h.control.approve(h.claims, fresh.operation.runId, snapshot.proposal.approvalFingerprint!, "APPROVED");
  const poll = await h.request("poll"); assert.equal(poll.execution.attribution.grantVersion, grant.version);
});
test("failed submission outcome is durable, bounded, and replay safe", async () => {
  const h = await inspectionHarness(); const c = h.tables.conversation.get("conversation-a");
  const first = await persistSubmissionFailure(h.db, c, h.claims.sub, "failure", "User request", new Error("PRIVATE_PROVIDER_BODY"));
  const count = h.tables.conversationMessage.size;
  const replay = await persistSubmissionFailure(h.db, c, h.claims.sub, "failure", "User request", new Error("PRIVATE_PROVIDER_BODY"));
  assert.equal(first.id, replay.id); assert.equal(h.tables.conversationMessage.size, count);
  assert.equal(first.metadata.code, "REQUEST_FAILED"); assert.ok(!JSON.stringify(first).includes("PRIVATE_PROVIDER_BODY"));
  await assert.rejects(() => persistSubmissionFailure(h.db, c, h.claims.sub, "failure", "Different request", new Error()), /MESSAGE_CONFLICT/);
});

test("failure after a committed submission without a client ID does not duplicate the user message", async () => {
  const h = await inspectionHarness();
  await h.db.conversationMessage.create({ data: { id: "accepted-message", conversationId: "conversation-a", senderId: h.claims.sub,
    senderType: "user", content: "User request", metadata: {} } });
  await persistSubmissionFailure(h.db, h.tables.conversation.get("conversation-a"), h.claims.sub, "server-request", "User request", new Error(), "accepted-message");
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.senderType === "user" && m.content === "User request").length, 1);
});
