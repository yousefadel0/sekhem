import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { nextExplicitInspection } from "../src/agent-runtime/inspection/explicit-inspection";
import { INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION } from "../src/agent-runtime/inspection/inspection.contract";
import { citationSources } from "../src/agent-runtime/inspection/inspection-grounding";
import { INSPECTION_RESOURCE_LIMITS } from "../src/agent-runtime/understanding/agent-understanding.types";

const objective = "Review this project read-only. Read README.md and package.json. Give me a development plan.";
async function setObjective(h: Awaited<ReturnType<typeof inspectionHarness>>, text: string) {
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: text }, "active");
  });
}
test("explicit reads use existing approvals and verified receipts without per-file model calls or replay", async () => {
  const h = await inspectionHarness(); await setObjective(h, objective);
  for (const path of ["README.md", "package.json"]) {
    await h.service.advance(h.run.id);
    assert.equal((await h.state()).current?.action.relativePath, path);
    assert.equal(h.calls.length, 0);
    assert.equal((await h.request("poll")).execution, null); // no read consent in this fixture
    await h.approve(); const execution = (await h.request("poll")).execution; assert.ok(execution);
    await h.newService().advance(h.run.id); assert.equal((await h.state()).operations.length, path === "README.md" ? 1 : 2);
    await h.complete(execution, "verified source"); await h.service.advance(h.run.id);
  }
  assert.equal((await h.state()).references.length, 2);
  assert.equal(nextExplicitInspection(await h.state()), undefined);
});
test("explicit worklist is bounded, deduplicated and preserves all eight requested files", async () => {
  const h = await inspectionHarness(), state = await h.state();
  state.objective = "افحص مشروع TEST قراءة فقط. ابدأ باستعراض الجذر وsrc ثم اقرأ README.md وpackage.json وsrc/App.tsx وsrc/Providers.tsx وsrc/services/api.ts وsrc/store/useAppStore.ts وsrc/components/layout/Sidebar.tsx وsrc/components/layout/Header.tsx إذا كانت موجودة.";
  const paths: string[] = [];
  for (let i = 0; i < 10; i++) {
    const action = nextExplicitInspection(state)!; assert.ok(action); paths.push(action.relativePath);
    state.operations.push({ action, state: "SUCCEEDED", verification: "VERIFIED" } as any); state.iterations++;
  }
  assert.deepEqual(paths, ["", "src", "README.md", "package.json", "src/App.tsx", "src/Providers.tsx", "src/services/api.ts", "src/store/useAppStore.ts", "src/components/layout/Sidebar.tsx", "src/components/layout/Header.tsx"]);
  assert.equal(nextExplicitInspection(state), undefined);
  state.iterations = state.maxIterations; assert.equal(nextExplicitInspection(state), undefined);
});
test("explicit unsafe paths still fail strict validation without dispatch", async () => {
  const h = await inspectionHarness(); await setObjective(h, "Review this project read-only. Read ../../outside.json and package.json.");
  await h.service.advance(h.run.id); assert.equal((await h.state()).state, "FAILED");
  assert.equal((await h.state()).operations.length, 0); assert.equal(h.calls.length, 0);
});

test("explicit multi-file read does not require a project keyword and still awaits authority", async () => {
  const h = await inspectionHarness();
  await setObjective(h, "اختبار قبول: اقرأ src/pages/Dashboard.tsx وsrc/pages/Applications.tsx. راجع هذين الملفين فقط قراءة دون تعديل.");
  await h.service.advance(h.run.id);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.state()).operations[0].action.relativePath, "src/pages/Dashboard.tsx");
  assert.equal((await h.state()).state, "AWAITING_APPROVAL");
  assert.equal((await h.request("poll")).execution, null);
  const state = await h.state();
  for (const objective of ["Explain how to read a.ts and b.ts.", "لا تقرأ a.ts ولا b.ts", "Recommend reading a.ts and b.ts", "Read index.html and describe its rendered/browser appearance."])
    assert.equal(nextExplicitInspection({ ...state, objective }), undefined);
});
for (const replacement of ["valid", "invalid", "unsupported", "action"] as const)
test(`recommendation enum correction is durable, bounded and ${replacement}`, async () => {
  const h = await inspectionHarness(); await setObjective(h, "Read package.json.");
  h.responses.push(h.inspectStructured("filesystem.read", "package.json"));
  await h.service.advance(h.run.id); await h.approve(); await h.complete((await h.request("poll")).execution, '{"version":"0.1.0"}');
  await h.service.advance(h.run.id);
  const output = (bad: boolean, unsupported = false) => (input: any) => {
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]), source = state.sourceCitations[0];
    if (!bad) assert.equal(state.reportCorrection.field, "$.recommendation.changeKind");
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Review source",
      report: { constraintIds: state.planningContract.constraints.map((c: any) => c.id), facts: [{ id: "version", text: unsupported ? "invented" : source.excerpt, evidenceRef: source.evidenceRef }], inferences: [], hypotheses: [], unknowns: [] },
      recommendation: { title: "Improve project", objective: "Review version handling", changeKind: bad ? "ANALYSIS" : "TEXT", strategy: "CONTENT", preservation: "UNSPECIFIED" } });
  };
  h.responses.push(output(true)); await h.service.advance(h.run.id);
  assert.equal((await h.state()).code, "REPORT_FORMAT_CORRECTION"); assert.ok(!(await h.state()).understanding);
  assert.equal((await h.state()).operations.length, 1); assert.equal((await h.request("poll")).execution, null);
  h.responses.push(replacement === "action" ? h.inspectStructured("filesystem.read", "second.ts") : output(replacement === "invalid", replacement === "unsupported"));
  await h.newService().advance(h.run.id);
  const state = await h.state(); assert.equal(state.operations.length, 1);
  assert.equal(state.reportCorrection?.attempts, 1);
  assert.equal(state.state === "COMPLETED", replacement === "valid");
  const calls = h.calls.length; await h.newService().advance(h.run.id); assert.equal(h.calls.length, calls);
});
test("recommendation guidance advertises the actual changeKind and preservation enums", () => {
  assert.match(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, /\["REDESIGN","TEXT","ADDITION","REMOVAL"\]/);
  assert.match(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, /\["SPECIFIED","UNSPECIFIED"\]/);
});
for (const repeats of [false, true]) test(`oversized source excerpts receive one strict correction, repeated=${repeats}`, async () => {
  const h = await inspectionHarness(); await setObjective(h, "Read package.json.");
  h.responses.push(h.inspectStructured("filesystem.read", "package.json"));
  await h.service.advance(h.run.id); await h.approve(); await h.complete((await h.request("poll")).execution, "a".repeat(800)); await h.service.advance(h.run.id);
  const report = (long: boolean) => (input: any) => {
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]), source = state.sourceCitations[0];
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Observed source",
      report: { constraintIds: state.planningContract.constraints.map((c: any) => c.id), facts: [{ id: "source", text: source.excerpt.slice(0, long ? 700 : 100), evidenceRef: source.evidenceRef }], inferences: [], hypotheses: [], unknowns: [] }, recommendation: null });
  };
  h.responses.push(report(true)); await h.service.advance(h.run.id);
  const correction = (await h.state()).reportCorrection;
  assert.deepEqual(correction?.issues, [{ path: "$.report.facts[0].text", reason: "MAX_LENGTH", maxLength: 512 }]);
  assert.ok(!(await h.state()).understanding);
  h.responses.push(report(repeats)); await h.newService().advance(h.run.id);
  assert.equal((await h.state()).state === "COMPLETED", !repeats); assert.equal((await h.state()).operations.length, 1);
  const calls = h.calls.length; await h.newService().advance(h.run.id); assert.equal(h.calls.length, calls);
});
test("multi-file inspection retains the newest verified read without charging duplicate Runtime headers", async () => {
  const h = await inspectionHarness();
  await setObjective(h, "Review this project read-only. Read one.ts and two.ts and three.ts and four.ts and five.ts and six.ts and seven.ts and eight.ts and nine.ts.");
  for (let i = 0; i < 9; i++) {
    await h.service.advance(h.run.id); await h.approve(); await h.complete((await h.request("poll")).execution, `export const source${i} = '${"x".repeat(4900)}';`); await h.service.advance(h.run.id);
  }
  const state = await h.state();
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId,
    sessionClaims: h.claims, projectId: h.run.projectId, conversationId: h.run.conversationId, agentRunId: h.run.id,
    instruction: "Review the currently bound workspace project.", runtimeEvidence: state.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible, true);
  assert.equal(context.truncated, false); assert.equal(visible.size, 9);
  assert.ok([...visible.values()].every(body => body.length > 4900));
  assert.equal(citationSources(context, visible, h.binding).length, 9);
  assert.ok([...visible.values()].reduce((sum, body) => sum + body.length, 0) < INSPECTION_RESOURCE_LIMITS.MAX_CONTEXT_CHARS);
  const ordinary = structuredClone(context); h.contexts.toReasoningPrompt(ordinary, new Map()); assert.equal(ordinary.truncated, true);
});
test("required-source partial reports continue boundedly without dispatching invented actions", async () => {
  const h = await inspectionHarness(); await setObjective(h, "Review this project read-only. Read package.json.");
  h.responses.push(h.inspectStructured("filesystem.read", "package.json")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, "verified source"); await h.service.advance(h.run.id);
  const partial = (input: any) => {
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]), source = state.sourceCitations[0];
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Partial source review",
      report: { constraintIds: state.planningContract.constraints.map((c: any) => c.id), facts: [{ id: "source", text: source.excerpt, evidenceRef: source.evidenceRef }], inferences: [], hypotheses: [],
        unknowns: [{ id: "missing_page", description: "Required page source is unread", whyNeeded: "Needed for the requested loading review", severity: "HIGH", evidenceCategory: "REQUIRED_INFORMATION" }] }, recommendation: null });
  };
  for (let i = 1; i <= 3; i++) {
    h.responses.push(partial); await h.newService().advance(h.run.id);
    assert.equal((await h.state()).operations.length, 1); assert.equal((await h.request("poll")).execution, null);
    assert.equal((await h.state()).reviewContinuation?.attempts, Math.min(i, 2));
    assert.equal((await h.state()).state, i <= 2 ? "NEEDS_MORE_EVIDENCE" : "PARTIAL");
  }
});
test("a successfully reformatted partial report can continue source inspection without another format allowance", async () => {
  const h = await inspectionHarness(); await setObjective(h, "Review this project read-only. Read package.json.");
  h.responses.push(h.inspectStructured("filesystem.read", "package.json")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, "verified source"); await h.service.advance(h.run.id);
  await h.ledger.transaction(async tx => { const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    row.payload.reportCorrection = { field: "$.recommendation.changeKind", attempts: 1, pending: true };
    await h.ledger.update(tx, row, row.payload, "active"); });
  h.responses.push(input => { const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]), source = state.sourceCitations[0];
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Corrected partial report", recommendation: null,
      report: { constraintIds: state.planningContract.constraints.map((c: any) => c.id), facts: [{ id: "source", text: source.excerpt, evidenceRef: source.evidenceRef }], inferences: [], hypotheses: [],
        unknowns: [{ id: "page", description: "Page source is required", whyNeeded: "Needed for loading review", severity: "HIGH", evidenceCategory: "REQUIRED_INFORMATION" }] } }); });
  await h.service.advance(h.run.id); assert.equal((await h.state()).reportCorrection?.pending, false);
  assert.equal((await h.state()).reportCorrection?.attempts, 1);
  h.responses.push(h.inspectStructured("filesystem.read", "src/page.ts")); await h.newService().advance(h.run.id);
  assert.equal((await h.state()).current?.action.relativePath, "src/page.ts");
  assert.equal((await h.request("poll")).execution, null); // still awaits its own authorization
});
