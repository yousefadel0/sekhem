import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { interpretContext, validateUnderstandingProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { groundInspectionConversation } from "../src/agent-runtime/inspection/inspection-grounding";
import { inspectUnderstanding } from "../src/agent-runtime/inspection/inspection-understanding";

const objective = "Read index.html from the currently bound sekhem_test workspace. Identify the actual Hero heading and verify whether the exact text 'Building simple digital experiences.' exists in the file. Ground the result in the fresh read with an evidence citation. Read-only only: do not create a modification plan or proposal, and do not modify any file.";
const source = "<h1>\n    Building\n    <span>simple</span>\n    digital experiences.\n</h1>";
const ref = "runtime:verified-hero-receipt";
const stageOneObjective = "Read and analyze index.html. Identify the actual Hero heading and cite its exact source lines. Complete grounded understanding only. Do not create a modification plan or proposal. Do not modify any file or execute any write.";
const reference = { userId: "user-1", projectId: "project-1", organizationId: "organization-1",
  conversationId: "conversation-1", workspaceId: "workspace-1", bindingVersion: 40,
  runtimeId: "runtime-1", runtimeFingerprint: "fingerprint-1", requestId: "request-1", operationId: "read-1",
  receiptId: "verified-hero-receipt", relativePath: "index.html", observationTime: "2026-10-01T12:03:27.822Z",
  truncated: false, verificationState: "VERIFIED", sourceType: "runtime-workspace", encoding: "utf-8-decoded",
  contentIdentity: { status: "UNAVAILABLE" } } as const;

function fixture(instruction: string) {
  const context = new AgentUnderstandingService().understand({ userId: "user-1", projectId: "project-1",
    conversationId: "conversation-1", instruction, workspaceAvailable: true, availableCapabilities: ["workspace_reader"] });
  context.evidence = [{ sourceId: "read-1", sourceType: "workspace", relativePath: "index.html",
    provenance: ref, status: "COLLECTED", runtimeReference: reference,
    metadata: { operation: "filesystem.read", runtimeEvidence: reference },
    content: { text: source, truncated: false, extractorId: "verified-runtime-read", detectedMime: "text/html" }, warnings: [] }];
  const visible = new Map([[ref, source]]);
  const base = interpretContext(context, visible);
  const proposal = { constraintIds: base.constraints.map(c => c.id),
    facts: [{ id: "hero", text: source, evidenceRef: ref }], inferences: [], hypotheses: [], unknowns: [] };
  const checked = validateUnderstandingProposal(base, proposal, visible);
  return { context, base, checked, proposal, visible };
}

test("Stage 1 bounded restrictions permit a certified cited understanding without operational intents", () => {
  const { context, base, visible } = fixture(stageOneObjective);
  assert.equal(context.operationClass, "READ");
  assert.ok(!context.userIntent.some(i => ["PLAN", "MODIFY", "EXECUTE", "VERIFY"].includes(i)));
  assert.ok(base.constraints.every(c => c.rule !== "UNRESOLVED"));
  assert.ok(base.constraints.some(c => c.rule === "NO_EXECUTE"));
  const cited = groundInspectionConversation('The Hero heading is "Building simple digital experiences." [index.html:L1-L5](evidence:S0000000000000000).',
    [{ token: "S0000000000000000", path: "index.html", body: source, operation: "filesystem.read", evidenceRef: ref, reference }], base);
  assert.equal(cited.grounding.complete, true);
  const checkpoint = inspectUnderstanding(context, base, cited.proposal, visible, 1, true);
  assert.equal(checkpoint.status, "GROUNDED");
  assert.equal(checkpoint.understanding.readiness, "UNDERSTANDING_READY");
});

test("unknown qualifiers on Stage 1 restrictions remain unresolved", () => {
  for (const clause of ["Complete grounded understanding only if convenient", "Do not create a modification plan or proposal unless needed",
    "Do not modify any file or execute any write except safe writes"]) {
    const { base, checked } = fixture(`Read index.html. ${clause}.`);
    assert.ok(base.constraints.some(c => c.rule === "UNRESOLVED"));
    assert.ok(checked.issues.some(i => i.code === "CONSTRAINT_UNRESOLVED"));
  }
});

test("a positive action after a bounded coordinated prohibition remains positive", () => {
  assert.ok(fixture("Do not modify any file or execute any write. Modify index.html.").context.userIntent.includes("MODIFY"));
  assert.ok(fixture("Do not create a modification plan or proposal. Create a plan.").context.userIntent.includes("PLAN"));
});

test("the persisted read-only objective accepts source facts without false PLAN/WRITE intent", () => {
  const { context, base, checked } = fixture(objective);
  assert.equal(context.operationClass, "READ");
  assert.ok(!context.userIntent.includes("MODIFY"));
  assert.ok(!context.userIntent.includes("PLAN"));
  assert.ok(!context.userIntent.includes("VERIFY"));
  assert.ok(context.userIntent.includes("UNDERSTAND"));
  assert.deepEqual(checked.issues, []);
  assert.equal(checked.understanding.readiness, "UNDERSTANDING_READY");
  assert.equal(base.constraints.find(c => c.rule === "NO_WRITE")?.requestQuote,
    "Read-only only: do not create a modification plan or proposal, and do not modify any file");
});

test("the exact persisted objective reaches GROUNDED through the existing citation and checkpoint gates", () => {
  const { context, base, visible } = fixture(objective);
  const cited = groundInspectionConversation('The Hero h1 displays "Building simple digital experiences." [index.html:L1-L5](evidence:S0000000000000000).',
    [{ token: "S0000000000000000", path: "index.html", body: source, operation: "filesystem.read", evidenceRef: ref, reference }], base);
  assert.equal(cited.grounding.complete, true);
  const checkpoint = inspectUnderstanding(context, base, cited.proposal, visible, 1, true);
  assert.equal(checkpoint.status, "GROUNDED");
  assert.equal(checkpoint.understanding.readiness, "UNDERSTANDING_READY");
  assert.equal(checkpoint.evidence[0].selected, true);
  assert.equal(checkpoint.evidence[0].truncated, false);
});

for (const request of ["Run the tests for index.html", "Verify the command output", "Check runtime health",
  "Verify the Hero behavior in the browser", "After editing, verify whether the exact text 'Hello' exists in the file",
  "Read index.html and verify whether the exact text 'Hello' exists in the file. Check its behavior",
  "Verify index.html", "Check whether the heading is correct",
  "Verify whether the exact text 'Hello' exists in the file and everything works"]) {
  test(`operational or ambiguous verification stays outstanding: ${request}`, () => {
    const { context, base, proposal, visible } = fixture(request);
    assert.ok(context.userIntent.includes("VERIFY"));
    assert.equal(inspectUnderstanding(context, base, proposal, visible, 1, true).status, "PARTIAL");
  });
}

test("a standalone explicit source-content existence check selects understanding", () => {
  const { context, base, proposal, visible } = fixture("Check whether the exact text 'Hello' exists in the file");
  assert.ok(context.userIntent.includes("UNDERSTAND"));
  assert.ok(!context.userIntent.includes("VERIFY"));
  assert.equal(inspectUnderstanding(context, base, proposal, visible, 1, true).status, "GROUNDED");
});

for (const restriction of ["Do not create a plan", "Don't modify any file", "Never write a plan",
  "Analyze index.html without creating a plan", "Read index.html without modifying any file", "No writes", "No plans"]) {
  test(`explicit negation does not produce PLAN/WRITE: ${restriction}`, () => {
    const { context } = fixture(restriction);
    assert.equal(context.operationClass, "READ");
    assert.ok(!context.userIntent.includes("PLAN"));
    assert.ok(!context.userIntent.includes("MODIFY"));
  });
}

test("positive write and plan requests retain their intent and enable no execution", () => {
  for (const request of ["Modify index.html", "Do not create a plan, but modify index.html",
    "Do not modify the title and change the footer", "Do not modify the title, write the footer"]) {
    const { context } = fixture(request);
    assert.equal(context.operationClass, "WRITE");
    assert.ok(context.userIntent.includes("MODIFY"));
    assert.ok(context.missingContext.includes("CAPABILITY_NOT_ENABLED"));
    assert.ok(context.selectedCapabilities.every(capability => capability === "workspace_reader"));
  }
  for (const request of ["Create an implementation plan", "Do not modify index.html; create a plan"]) {
    assert.ok(fixture(request).context.userIntent.includes("PLAN"));
  }
});

test("ambiguous restrictions and conditional exceptions remain fail-closed", () => {
  for (const request of ["Read-only: do not modify any file unless necessary",
    "Read-only: do not create a plan and preserve whatever is needed", "Do not only modify index.html"]) {
    const { checked } = fixture(request);
    assert.ok(checked.issues.some(i => i.code === "CONSTRAINT_UNRESOLVED"));
    assert.notEqual(checked.understanding.readiness, "UNDERSTANDING_READY");
  }
  assert.equal(fixture("Do not modify index.html unless we need to modify the heading").context.operationClass, "WRITE");
});
