import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { projectOverview, overviewActionIssue, conversationalFindings, FINDING_EXCERPT_INSTRUCTION } from "../src/agent-runtime/inspection/conversational-inspection";
import { runtimeReadReceipt } from "../src/agent-runtime/understanding/agent-presentation";

for (const [objective, additional] of [["تمام المشروع ده بيتكلم عن ايه", false], ["What is this project about?", false], ["What is this project about?", true]] as const) test(`overview under consent, additional=${additional}: ${objective}`, async () => {
  assert.equal(projectOverview(objective, "READ"), true); assert.equal(projectOverview(objective, "WRITE"), false);
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!; await h.ledger.update(tx, row, { ...row.payload, objective }); });
  const grant = await h.ledger.transaction(tx => h.identity.activeGrant(tx, h.device.runtimeId, "project-a"));
  await h.runtime.readGrant(h.claims, "project-a", h.binding.workspaceId, { bindingVersion: h.binding.version, expectedGrantVersion: grant.version, durationMinutes: 60 });
  h.responses.push('هقرأ README. محتاج موافقتك.\n```sekhem-action\n{"tool":"filesystem.read","relativePath":"README.md","query":"","purpose":"Understand project purpose"}\n```');
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "APPROVED");
  assert.equal([...h.tables.agentApproval.values()].filter(a => a.status === "PENDING").length, 0);
  await h.complete((await h.request("poll")).execution, additional ? "Project purpose is documented in docs/current-state.md." : "SEKHEM is an engineering workspace."); await h.service.advance(h.run.id);
  if (additional) {
    h.responses.push('Uncertain: README does not describe the project purpose.\n\n```sekhem-action\n{"tool":"filesystem.read","relativePath":"docs/current-state.md","query":"","purpose":"Find the missing project purpose"}\n```'); await h.newService().advance(h.run.id);
    await h.complete((await h.request("poll")).execution, "SEKHEM is an engineering workspace."); await h.service.advance(h.run.id);
  }
  h.responses.push(input => {
    assert.match(input.systemInstruction, /prefer README.md/); assert.match(input.systemInstruction, /at most one additional targeted source/);
    assert.match(input.systemInstruction, /Never reuse handles from history/);
    assert.ok(input.systemInstruction.includes(FINDING_EXCERPT_INSTRUCTION));
    assert.match(input.systemInstruction, /Never expand or merge ranges/);
    assert.match(input.systemInstruction, /Do not emit an uncited table or bold pseudo-heading/);
    assert.match(input.systemInstruction, /selected excerpt must also be at most 512 characters/);
    assert.match(input.systemInstruction, /ONE current sourceCitations anchor only/);
    assert.match(input.systemInstruction, /Do not add facts from memory, prior conversation/);
    assert.match(input.systemInstruction, /Do not combine details from separate excerpts/);
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]); const source = state.sourceCitations.find((s: any) => s.path === (additional ? "docs/current-state.md" : "README.md"));
    return `SEKHEM is an engineering workspace. ${source.anchors[0].citation}`;
  });
  await h.service.advance(h.run.id); const state = await h.state();
  assert.equal(state.state, "COMPLETED"); assert.equal(state.understanding?.status, "GROUNDED");
  assert.equal(state.operations.length, additional ? 2 : 1); assert.equal(state.understanding?.evidence.filter(e => e.read).length, additional ? 2 : 1);
  const calls = h.calls.length; await h.newService().advance(h.run.id); assert.equal(h.calls.length, calls); assert.equal((await h.request("poll")).execution, null);
  const messages = [...h.tables.conversationMessage.values()].filter(m => m.senderType === "assistant");
  assert.ok(messages.some(m => m.metadata?.inspectionReport));
  assert.ok(messages.every(m => !/محتاج موافقتك|SEKHEM evidence check|EXCERPT_BOUND/.test(m.content)));
});

test("unsupported claims stay excluded with explicit uncertainty; structural diagnostics stay out of answer", () => {
  const grounding: any = { complete: false, claims: [{ status: "SOURCE_EXCERPT" }, { status: "UNGROUNDED", reason: "EVIDENCE_REFERENCE_MISMATCH" }] };
  const answer = conversationalFindings("Supported fact\n\nInvented claim", grounding, "What is this project about?");
  assert.match(answer, /Supported fact/); assert.match(answer, /not supported/); assert.doesNotMatch(answer, /Invented|EVIDENCE_REFERENCE_MISMATCH/);
});

test("standalone verified runtime read projects one source with receipt and binding; failed or non-read never does", () => {
  const snapshot: any = { proposal: { proposalId: "p", runtimeId: "r", toolId: "filesystem.read", validatedInput: { path: "D:\\Fixture\\README.md" }, workspaceOperation: { rootPath: "D:\\Fixture", workspaceId: "w", bindingVersion: 44 } }, execution: { state: "SUCCEEDED", verificationState: "VERIFIED", result: { truncated: false }, attribution: { executionId: "receipt", proposalId: "p", runtimeId: "r", tool: "filesystem.read", validatedInput: { path: "D:\\Fixture\\README.md" } } } };
  const receipt = runtimeReadReceipt(snapshot)!;
  assert.equal(receipt.read, true); assert.equal(receipt.label, "README.md"); assert.equal(receipt.id, "runtime:receipt"); assert.equal(receipt.observedWorkspace?.bindingVersion, 44); assert.equal(receipt.selected, false);
  for (const verificationState of ["FAILED", "PENDING"]) assert.equal(runtimeReadReceipt({ ...snapshot, execution: { ...snapshot.execution, verificationState } }), null);
  assert.equal(runtimeReadReceipt({ ...snapshot, proposal: { ...snapshot.proposal, toolId: "terminal.execute" } }), null);
});

test("overview target admission requires README before targeted follow-ups and never traverses unrelated trees", () => {
  const read = (relativePath: string): any => ({ tool: "filesystem.read", relativePath, purpose: "Understand purpose" });
  const root: any = { tool: "filesystem.list", relativePath: "", purpose: "Locate README" };
  assert.equal(projectOverview("اقرأ المشروع ده وافهم هو عبارة عن إيه، وقولي إيه أهم الأجزاء والوظائف اللي فيه.", "READ"), true);
  assert.equal(projectOverview("Inspect .cursor configuration", "READ"), false);
  assert.equal(overviewActionIssue(root, [], []), undefined);
  assert.equal(overviewActionIssue(read("README.md"), [], []), undefined);
  assert.equal(overviewActionIssue(read("package.json"), [], []), "INSPECTION_OVERVIEW_README_REQUIRED");
  const operations: any[] = [{ action: read("README.md"), verification: "VERIFIED" }];
  for (const path of ["package.json", "pyproject.toml", "docs/architecture.md", "src/index.ts", "tsconfig.json"])
    assert.equal(overviewActionIssue(read(path), operations, []), undefined);
  for (const path of [".cursor/rules.md", ".git/config", ".next/cache/data.json", "node_modules/a/index.js", ".pnpm-store/package.json", "dist/index.js", "build/index.js", ".cache/data.json", "public/photo.png"])
    assert.equal(overviewActionIssue(read(path), operations, []), "INSPECTION_OVERVIEW_TARGET_REQUIRED");
  assert.equal(overviewActionIssue({ ...root, relativePath: ".cursor" }, [], []), "INSPECTION_OVERVIEW_TARGET_REQUIRED");
  assert.equal(overviewActionIssue(root, [{ action: root }] as any, []), "INSPECTION_OVERVIEW_TARGET_REQUIRED");
  assert.equal(overviewActionIssue({ ...root, tool: "filesystem.search", query: "project" }, [], []), "INSPECTION_OVERVIEW_TARGET_REQUIRED");
  assert.equal(overviewActionIssue(read("README.md"), operations, []), "INSPECTION_OVERVIEW_TARGET_REQUIRED");
  const listing: any = { operation: "filesystem.list", path: ".", reference: { truncated: false }, body: JSON.stringify({ operation: "filesystem.list", path: "", entries: [{ type: "file", path: "package.json" }] }) };
  assert.equal(overviewActionIssue(read("package.json"), [], [listing]), undefined);
  assert.equal(overviewActionIssue(read("cargo.toml"), [], [listing]), "INSPECTION_OVERVIEW_README_REQUIRED");
  assert.equal(overviewActionIssue(read("package.json"), [], [{ ...listing, reference: { truncated: true } }]), "INSPECTION_OVERVIEW_README_REQUIRED");
  assert.equal(overviewActionIssue(read("package.json"), [], [{ ...listing, body: "incomplete JSON" }]), "INSPECTION_OVERVIEW_README_REQUIRED");
});

test("an overview model request to traverse .cursor stops incomplete without an operation or permit", async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!; await h.ledger.update(tx, row, { ...row.payload, objective: "المشروع ده بيتكلم عن ايه؟" }); });
  h.responses.push(h.inspect("filesystem.list", ".cursor"));
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "PARTIAL");
  assert.deepEqual(state.operations, []);
  assert.ok(state.history?.at(-1)?.content);
  assert.equal((await h.request("poll")).execution, null);
  assert.equal([...h.tables.agentRunEvent.values()].filter(e => e.agentRunId === h.run.id && e.eventType === "EXECUTION_PERMIT_CREATED").length, 0);
});
