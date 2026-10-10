import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { INSPECTION_CANONICAL_SCHEMA } from "../src/agent-runtime/inspection/inspection.contract";
import { interpretContext, validateUnderstandingProposal, type AgentUnderstandingProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { RequestTimeoutException } from "@nestjs/common";
import { inspectionValidationError, inspectionValidationDiagnostic } from "../src/agent-runtime/inspection/inspection-understanding";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";

const source = '<h1>\n    Building\n    <span>simple</span>\n    digital experiences.\n</h1>';
async function headingRead(tool = "filesystem.read", objective = "Read and analyze the Hero heading in index.html.", observedSource = source) {
  const h = await inspectionHarness();
  const run = await h.db.agentRun.create({ data: { ...h.run, id: "heading-run" } });
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding, objective));
  h.responses.push(h.inspectStructured(tool, "index.html"));
  await h.service.advance(run.id);
  assert.equal(h.calls.at(-1).structured, true);
  assert.equal(h.calls.at(-1).purpose, "STRUCTURED_INSPECTION");
  assert.deepEqual(h.calls.at(-1).schema, INSPECTION_CANONICAL_SCHEMA);
  const instruction = h.calls.at(-1).systemInstruction;
  if (objective === "Read and analyze the Hero heading in index.html.") {
    assert.match(instruction, /bounded verbatim heading source excerpt/);
    assert.match(instruction, /current evidenceRef as the source citation/);
    assert.match(instruction, /short rendered-heading observation belongs in inferences/);
  } else {
    assert.match(instruction, /bounded source-read\/analysis request|bounded verbatim heading source excerpt/);
    assert.match(instruction, /server-owned presentation, not HTML source facts|short rendered-heading observation belongs in inferences/);
  }
  assert.match(instruction, /Omit unsupported claims rather than guess/);
  const state = () => h.ledger.transaction(async tx => (await h.ledger.read<any>(tx, "AGENT_INSPECTION", run.id))!.payload);
  const pending = await state();
  await h.service.approve(run.id, h.claims, { planVersion: pending.current.planVersion, fingerprint: pending.current.fingerprint, decision: "APPROVED" });
  await h.complete((await h.request("poll")).execution, observedSource);
  await h.service.advance(run.id);
  const read = await state();
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role,
    organizationId: h.claims.organizationId, sessionClaims: h.claims, projectId: run.projectId,
    conversationId: run.conversationId, agentRunId: run.id, instruction: objective, runtimeEvidence: read.references,
    availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible);
  const base = interpretContext(context, visible);
  const report: AgentUnderstandingProposal = { constraintIds: base.constraints.map(c => c.id),
    facts: [{ id: "hero", text: visible.get(base.evidenceRefs[0])!, evidenceRef: base.evidenceRefs[0] }],
    inferences: [{ id: "heading", text: "The Hero heading is Building simple digital experiences.", factIds: ["hero"], uncertainty: "Rendered-text interpretation of the cited source excerpt." }],
    hypotheses: [], unknowns: [] };
  return { ...h, run, state, report, base, visible };
}

const arabicFileRead = "اقرأ index.html بالكامل، وحلل محتواه من الملف نفسه. اذكر الـHero heading حرفيًا، ولا تخمّن أي شيء غير موجود في القراءة.";
test("live Arabic source review with bounded negated execution dispatches structured inspection", async () => {
  const objective = "Read and analyze index.html. Current review request: راجعلي الـindex وقولي رأيك فيه، وهل في طريقة نطوره؟ اقرأ الملف الفعلي من مساحة العمل الحالية فقط، وقدّم حقائق موثقة واستنتاجات وتوصيات منفصلة. لا تنفذ أي تعديل أو أمر ولا تنشئ موافقة أو تصريح تنفيذ.";
  const context = new AgentUnderstandingService().understand({ userId: "user", instruction: objective,
    availableCapabilities: ["workspace_reader"], workspaceAvailable: true });
  assert.equal(context.operationClass, "READ");
  assert.ok(!context.userIntent.includes("EXECUTE"));
  const h = await inspectionHarness();
  const run = await h.db.agentRun.create({ data: { ...h.run, id: "arabic-negated-review" } });
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding, objective));
  h.responses.push(h.inspectStructured("filesystem.read", "index.html"));
  await h.service.advance(run.id);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].structured, true);
  assert.equal(h.calls[0].purpose, "STRUCTURED_INSPECTION");
});

const liveSourceRead = `Read and analyze index.html from the current workspace.

Use the file itself as the only source.

Report:
1. The exact Hero heading.
2. The exact <h1> structure.
3. The exact <span> wrapping around "intelligent".
4. The relevant surrounding Hero structure.

Do not modify anything.
Do not create a proposal.
Do not execute anything.
Do not infer anything that is not present in the file.`;

test("exact live source-only request stays READ and resolves only supported boundaries", () => {
  const context = new AgentUnderstandingService().understand({ userId: "user", instruction: liveSourceRead, projectId: "project", availableCapabilities: ["workspace_reader"], workspaceAvailable: true });
  assert.equal(context.operationClass, "READ"); assert.ok(!context.userIntent.includes("EXECUTE"));
  const base = interpretContext(context, new Map());
  for (const quote of ["Use the file itself as the only source", "Do not modify anything", "Do not create a proposal", "Do not infer anything that is not present in the file"])
    assert.equal(base.constraints.find(c => c.requestQuote === quote)?.rule, "NO_WRITE");
  const unknown = interpretContext({ ...context, objective: liveSourceRead + "\nPreserve all network permissions." }, new Map());
  assert.equal(unknown.constraints.find(c => c.requestQuote === "Preserve all network permissions")?.rule, "UNRESOLVED");
  const planning = interpretContext({ ...context, userIntent: [...context.userIntent, "PLAN"] }, new Map());
  assert.equal(planning.constraints.find(c => c.requestQuote === "Do not create a proposal")?.rule, "UNRESOLVED");
  const service = new AgentUnderstandingService();
  for (const instruction of ["Do not execute anything.", "Read index.html. Do not execute anything."])
    assert.ok(!service.understand({ userId: "user", instruction, availableCapabilities: [] }).userIntent.includes("EXECUTE"));
  assert.ok(service.understand({ userId: "user", instruction: "Do not execute anything. Execute the command.", availableCapabilities: [] }).userIntent.includes("EXECUTE"));
});

test("settled grounding failure retains verified Hero evidence and cannot replay the same run", async () => {
  const h = await headingRead("filesystem.read", liveSourceRead), before = structuredClone(await h.state());
  const invalid = { ...h.report, facts: [{ ...h.report.facts[0], evidenceRef: "not-admitted" }] };
  const reply = (report: AgentUnderstandingProposal) => JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report verified source", report });
  h.responses.push(reply(invalid)); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "PARTIAL"); assert.equal((await h.state()).understanding, undefined);
  await assert.rejects(h.service.message(h.run.id, h.claims, h.run.conversationId,
    "Continue inspection using the existing source evidence.", "source-recovery"), /INSPECTION_ALREADY_SETTLED/);
  const calls = h.calls.length;
  await h.service.advance(h.run.id);
  const after = await h.state();
  assert.equal(after.state, "PARTIAL"); assert.equal(after.understanding, undefined);
  assert.equal(h.calls.length, calls);
  assert.deepEqual(after.references, before.references); assert.equal(after.operations.length, 1);
  assert.deepEqual(after.operations, before.operations); assert.equal((await h.request("poll")).execution, null);
  assert.ok(h.calls.every(c => c.structured === true));
});
const fidelitySource = '<h1>\r\n\tCafe\u0301 &amp; <span>“intelligent”</span>  digital experiences.\r\n</h1>';
for (const [name, transform] of [
  ["exact source", (s: string) => s],
  ["paraphrase", () => "The heading describes intelligent digital experiences."],
  ["CRLF to LF", (s: string) => s.replace(/\r\n/g, "\n")],
  ["collapsed whitespace", (s: string) => s.replace(/\s+/g, " ")],
  ["Unicode NFC", (s: string) => s.normalize("NFC")],
  ["HTML entity decoding", (s: string) => s.replace("&amp;", "&")],
  ["HTML tag removal", (s: string) => s.replace(/<[^>]*>/g, "")],
  ["quote normalization", (s: string) => s.replace(/[“”]/g, '"')]
] as const) test(`admitted source remains exact across prompt and fact validation: ${name}`, async () => {
  const h = await headingRead("filesystem.read", arabicFileRead, fidelitySource);
  const ref = (await h.state()).references[0];
  assert.equal(ref.verificationState, "VERIFIED");
  assert.equal(ref.truncated, false);
  assert.equal(h.visible.get(`runtime:${ref.receiptId}`), fidelitySource);
  const report = { ...h.report, facts: [{ ...h.report.facts[0], text: transform(fidelitySource) }] };
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report }));
  await h.service.advance(h.run.id);
  const request = h.calls.at(-1);
  const data = JSON.parse(request.question.split("\n[INSPECTION STATE]\n")[1]);
  const source = data.sourceCitations[0];
  const anchor = source.anchors.find((a: any) => source.excerpt.slice(a.start, a.end).includes("<h1>"));
  assert.equal(source.excerpt.slice(anchor.start, anchor.end), fidelitySource);
  assert.equal(source.evidenceRef, `runtime:${ref.receiptId}`);
  assert.match(request.systemInstruction, /bounded contiguous substring of sourceCitations\[\]\.excerpt/);
  assert.match(request.systemInstruction, /Never replace CRLF with LF, decode HTML entities, normalize Unicode or quotes, collapse whitespace/);
  const state = await h.state();
  if (name === "exact source") {
    assert.equal(state.understanding.status, "GROUNDED");
    assert.equal(state.understanding.understanding.facts[0].text, fidelitySource);
  } else {
    assert.equal(state.understanding, undefined);
    assert.equal(state.state, "PARTIAL");
    const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
    const issues = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC").payload.validation.issues;
    assert.partialDeepStrictEqual(issues.find((i: any) => i.code === "UNSUPPORTED_FACT").groundingDiagnostic,
      { evidenceReferenceAdmitted: true, exactSubstringMatch: false });
    assert.partialDeepStrictEqual(issues.find((i: any) => i.code === "UNSUPPORTED_INFERENCE").groundingDiagnostic, { factIdsValid: false });
  }
});
for (const id of ["rendered_appearance", "rendered_view_not_observed", "browser_layout_observation_missing"]) {
  test(`optional visual category controls source-only readiness independently of gap ID: ${id}`, async () => {
    const h = await headingRead("filesystem.read", arabicFileRead);
    assert.match(h.calls.at(-1).systemInstruction, /declare evidenceCategory: OPTIONAL_VISUAL/);
    assert.match(h.calls.at(-1).systemInstruction, /REQUIRED_INFORMATION for any missing information needed to answer the request/);
    h.report.unknowns.push({ id, description: "Browser rendering has not been observed", whyNeeded: "Optional appearance context only",
      severity: "LOW", evidenceCategory: "OPTIONAL_VISUAL" });
    h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report: h.report }));
    await h.service.advance(h.run.id);
    const checkpoint = (await h.state()).understanding;
    assert.equal(checkpoint.status, "GROUNDED");
    assert.equal(checkpoint.understanding.readiness, "UNDERSTANDING_READY");
    assert.deepEqual(checkpoint.understanding.unknowns[0], { ...h.report.unknowns[0], state: "UNKNOWN" });
    assert.equal(checkpoint.understanding.facts[0].text, source);
  });
}
for (const category of [undefined, "REQUIRED_INFORMATION"] as const) {
  test(`visual-looking gap ID cannot bypass required or unclassified information: ${category ?? "legacy omitted"}`, async () => {
    const h = await headingRead("filesystem.read", arabicFileRead);
    h.report.unknowns.push({ id: "rendered_appearance", description: "Missing information required by the request", whyNeeded: "Needed to answer",
      severity: "LOW", ...(category ? { evidenceCategory: category } : {}) });
    h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report: h.report }));
    await h.service.advance(h.run.id);
    assert.equal((await h.state()).understanding.status, "PARTIAL");
    assert.equal((await h.state()).understanding.understanding.readiness, "NEEDS_CLARIFICATION");
  });
}
test("unsupported gap categories fail strict schema validation", async () => {
  const h = await headingRead("filesystem.read", arabicFileRead);
  h.report.unknowns.push({ id: "visual", description: "Unobserved", whyNeeded: "Optional", severity: "LOW", evidenceCategory: "OPTIONAL_ANYTHING" } as any);
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report: h.report }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).code, "INVALID_MODEL_PROPOSAL");
  assert.equal((await h.state()).understanding, undefined);
});
for (const [objective, appearanceRequired] of [
  [arabicFileRead, false],
  ["Read and analyze the Hero heading in index.html.", false],
  ["Read index.html. What does the page look like?", true],
  ["Read index.html and describe its rendered/browser appearance.", true],
  ["اقرأ index.html واذكر شكل الصفحة في المتصفح.", true]
] as const) test(`structured appearance uncertainty remains unknown with request-scoped readiness: ${objective}`, async () => {
  const h = await headingRead("filesystem.read", objective);
  h.report.unknowns.push({ id: "rendered_appearance", description: "Browser appearance was not observed.",
    whyNeeded: "Actual visual evidence would be needed to describe browser appearance.", severity: "LOW", evidenceCategory: "OPTIONAL_VISUAL" });
  const before = [...h.tables.auditEvent.values()].map((r: any) => [r.id, r.metadata?.recordType]);
  const operations = (await h.state()).operations.length, calls = h.calls.length;
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report source observations", report: h.report }));
  await h.service.advance(h.run.id);
  const state = await h.state(), checkpoint = state.understanding;
  assert.equal(checkpoint.status, appearanceRequired ? "PARTIAL" : "GROUNDED");
  assert.equal(checkpoint.understanding.readiness, appearanceRequired ? "NEEDS_CLARIFICATION" : "UNDERSTANDING_READY");
  assert.equal(checkpoint.understanding.unknowns.find((u: any) => u.id === "rendered_appearance").state, "UNKNOWN");
  assert.equal(checkpoint.understanding.facts[0].text, source);
  assert.equal(checkpoint.evidence.filter((e: any) => e.read).length, 1);
  assert.equal(checkpoint.evidence[0].truncated, false);
  assert.equal(state.references[0].verificationState, "VERIFIED");
  assert.equal(state.operations.length, operations);
  assert.equal(h.calls.length, calls + 1);
  // Certification adds no new operation, approval, permit or execution.
  const authorityTypes = ["RUNTIME_PROPOSAL", "RUNTIME_EXECUTION", "EXACT_PROPOSAL", "EXACT_APPROVAL_HEAD", "EXACT_APPROVAL_GENERATION", "EXACT_EXECUTION_PERMIT", "EXACT_PERMIT_CONSUMPTION", "PLAN_EXECUTION", "RUNTIME_PERMIT_CONSUMPTION", "TASK_CONSENT"];
  assert.deepEqual([...h.tables.auditEvent.values()].filter((r: any) => authorityTypes.includes(r.metadata?.recordType)).map((r: any) => [r.id, r.metadata.recordType]),
    before.filter(([, type]) => authorityTypes.includes(type)));
});

test("source-only optional appearance does not hide a genuine missing-source gap", async () => {
  const h = await headingRead("filesystem.read", arabicFileRead);
  h.report.unknowns.push(
    { id: "rendered_appearance", description: "Unknown appearance", whyNeeded: "No browser observation", severity: "LOW", evidenceCategory: "OPTIONAL_VISUAL" },
    { id: "required_source_evidence", description: "Missing requested source", whyNeeded: "Source understanding is incomplete", severity: "HIGH" });
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report: h.report }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).understanding.status, "PARTIAL");
  assert.equal((await h.state()).understanding.understanding.readiness, "NEEDS_EVIDENCE");
});

test("source-only readiness keeps server-required appearance gaps and default validation unchanged", async () => {
  const h = await headingRead("filesystem.read", arabicFileRead);
  const gap = { id: "rendered_appearance", description: "Appearance has not been observed", whyNeeded: "Visual evidence required", severity: "LOW" as const, evidenceCategory: "OPTIONAL_VISUAL" as const };
  h.report.unknowns.push(gap);
  const defaultResult = validateUnderstandingProposal(h.base, h.report, h.visible);
  assert.equal(defaultResult.understanding.readiness, "NEEDS_CLARIFICATION");
  const requiredBase = { ...h.base, unknowns: [{ ...gap, state: "UNKNOWN" as const }] };
  const requiredResult = validateUnderstandingProposal(requiredBase, { ...h.report, unknowns: [] }, h.visible, true);
  assert.equal(requiredResult.understanding.readiness, "NEEDS_CLARIFICATION");
  assert.equal(requiredResult.understanding.unknowns[0].state, "UNKNOWN");
});

for (const verbatim of [true, false]) test(`bounded file facts ${verbatim ? "accept a verbatim source substring" : "reject a paraphrase of observed source"}`, async () => {
  const h = await headingRead("filesystem.read", arabicFileRead);
  assert.match(h.calls.at(-1).systemInstruction, /Copy every facts\[\]\.text verbatim from the single source excerpt identified by its facts\[\]\.evidenceRef/);
  assert.match(h.calls.at(-1).systemInstruction, /Do not paraphrase, rewrite, normalize, add context, or combine separate excerpts/);
  h.report.facts[0].text = verbatim ? "<span>simple</span>" : "The heading contains the word simple in a span.";
  h.report.inferences = [];
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report: h.report }));
  await h.service.advance(h.run.id);
  const state = await h.state();
  if (verbatim) {
    assert.equal(state.state, "COMPLETED");
    assert.equal(state.understanding.status, "GROUNDED");
    assert.equal(state.understanding.understanding.facts[0].text, "<span>simple</span>");
  } else {
    assert.equal(state.state, "PARTIAL");
    assert.equal(state.understanding, undefined);
    const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
    const diagnostic = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
    assert.partialDeepStrictEqual(diagnostic.payload.validation.issues.find((i: any) => i.path === "$.facts[0]"), {
      code: "UNSUPPORTED_FACT", path: "$.facts[0]", groundingDiagnostic: { evidenceReferenceAdmitted: true, exactSubstringMatch: false }
    });
  }
});

test("explicit file inspection instruction requires exact constraint-ID copying", async () => {
  const h = await headingRead("filesystem.read", arabicFileRead);
  for (const request of h.calls) {
    assert.equal(request.structured, true);
    assert.match(request.systemInstruction, /Populate report\.constraintIds by copying every planningContract\.constraints\[\]\.id exactly once/);
    assert.match(request.systemInstruction, /Use exact IDs only: no omissions, additions, duplicates, or rewritten IDs/);
    const data = JSON.parse(request.question.split("\n[INSPECTION STATE]\n")[1]);
    assert.deepEqual(data.planningContract.constraints.map((c: any) => c.id), ["runtime-planning-only"]);
  }
});
test("explicit Arabic file analysis certifies structured observations without additional operations", async () => {
  const h = await headingRead("filesystem.read", arabicFileRead);
  const calls = h.calls.length, operations = (await h.state()).operations.length;
  const approvals = h.tables.agentApproval.size;
  const executions = [...h.tables.auditEvent.values()].filter((r: any) => r.metadata?.recordType === "RUNTIME_EXECUTION").length;
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "",
    purpose: "Uncited display prose must not become a source finding.", report: h.report }));
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "COMPLETED");
  assert.equal(state.understanding.status, "GROUNDED");
  assert.equal(state.understanding.understanding.readiness, "UNDERSTANDING_READY");
  assert.equal(state.operations.length, operations);
  assert.equal(h.tables.agentApproval.size, approvals);
  assert.equal([...h.tables.auditEvent.values()].filter((r: any) => r.metadata?.recordType === "RUNTIME_EXECUTION").length, executions);
  assert.equal(h.calls.length, calls + 1);
  assert.ok(h.calls.every(c => c.structured === true));
  const request = h.calls.at(-1);
  const catalog = JSON.parse(request.question.split("\n[INSPECTION STATE]\n")[1]).sourceCitations;
  assert.equal(catalog[0].evidenceRef, h.report.facts[0].evidenceRef);
  assert.ok(!Object.hasOwn(catalog[0].anchors[0], "evidenceRef"));
  const messages = await h.db.conversationMessage.findMany({ where: { conversationId: h.run.conversationId } });
  assert.ok(messages.some((m: any) => m.metadata.inspectionReport && m.content.includes("Source:")));
  assert.ok(!messages.some((m: any) => m.content.includes("Uncited display prose")));
});

for (const invalid of ["runtime metadata", "source fact", "reference", "inference"]) test(`explicit file structured ${invalid} remains fail-closed`, async () => {
  const h = await headingRead("filesystem.read", arabicFileRead);
  if (invalid === "runtime metadata") h.report.facts[0].text = "filesystem.read VERIFIED truncated: false";
  if (invalid === "source fact") h.report.facts[0].text = '<div class="invented">Not observed</div>';
  if (invalid === "reference") h.report.facts[0].evidenceRef = "runtime:invented-receipt";
  if (invalid === "inference") h.report.inferences[0].factIds = ["missing-fact"];
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report", report: h.report }));
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "PARTIAL");
  assert.equal(state.understanding, undefined);
  assert.equal(state.operations.length, 1);
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  assert.ok(events.some((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC" && e.payload.codes.includes("GROUNDING_NOT_VERIFIED")));
});

for (const objective of ["Analyze this entire workspace", "حلل المشروع بالكامل", "Read index.html and app.ts", "Read all HTML files"]) test(`broad or multi-file inspection keeps free-form behavior: ${objective}`, async () => {
  const h = await inspectionHarness();
  const run = await h.db.agentRun.create({ data: { ...h.run, id: "broad-run" } });
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding, objective));
  h.responses.push(h.inspectStructured("filesystem.read", "index.html"));
  await h.service.advance(run.id);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].structured, undefined);
});

test("bounded read/analyze heading uses one structured call per turn and certifies verified source", async () => {
  const h = await headingRead();
  const callsBefore = h.calls.length;
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "",
    purpose: "The .hero-card is unrelated. [index.html:L600](evidence:S0000000000000000). Uncited concluding prose.", report: h.report }));
  await h.service.advance(h.run.id);
  assert.equal(h.calls.length, callsBefore + 1);
  const request = h.calls.at(-1);
  const inspectionState = JSON.parse(request.question.split("\n[INSPECTION STATE]\n")[1]);
  const citation = inspectionState.sourceCitations.find((c: any) => c.path === "index.html");
  assert.equal(citation.evidenceRef, `runtime:${(await h.state()).references[0].receiptId}`);
  const heading = citation.anchors.find((a: any) => citation.excerpt.slice(a.start, a.end).includes("<h1>"));
  assert.ok(!Object.hasOwn(heading, "evidenceRef"));
  assert.ok(citation.excerpt.slice(heading.start, heading.end).includes(source));
  assert.equal(h.report.facts[0].evidenceRef, citation.evidenceRef);
  assert.match(request.systemInstruction, /facts\[\]\.text must be an exact verbatim substring from the supplied excerpt/);
  assert.match(request.systemInstruction, /facts\[\]\.evidenceRef must copy the exact full evidenceRef supplied with that excerpt/);
  assert.match(request.systemInstruction, /Do not invent or rewrite evidence references/);
  assert.ok(h.calls.every(c => c.structured === true));
  const state = await h.state();
  assert.equal(state.state, "COMPLETED");
  assert.equal(state.understanding.status, "GROUNDED");
  assert.equal(state.understanding.understanding.readiness, "UNDERSTANDING_READY");
  assert.equal(state.references[0].verificationState, "VERIFIED");
  assert.equal(state.understanding.understanding.facts[0].text, source);
  const messages = await h.db.conversationMessage.findMany({ where: { conversationId: h.run.conversationId } });
  const final = messages.find((m: any) => m.metadata?.inspectionReport);
  assert.match(final.content, /Building/);
  assert.match(final.content, /Source:/);
  assert.ok(!messages.some((m: any) => m.content.includes(".hero-card")));
});

test("unsupported structured source claims cannot certify heading understanding", async () => {
  const h = await headingRead();
  h.report.facts[0].text = '<div class="hero-card">Invented content</div>';
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report heading", report: h.report }));
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "PARTIAL");
  assert.equal(state.understanding, undefined);
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  assert.match(JSON.stringify(events), /GROUNDING_NOT_VERIFIED/);
  const diagnostic = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.equal(diagnostic.payload.validation.code, "INVALID_MODEL_PROPOSAL");
  assert.ok(diagnostic.payload.validation.issues.some((i: any) => i.code === "UNSUPPORTED_FACT" && i.path === "$.facts[0]"));
  assert.partialDeepStrictEqual(diagnostic.payload.validation.issues.find((i: any) => i.code === "UNSUPPORTED_FACT").groundingDiagnostic,
    { evidenceReferenceAdmitted: true, exactSubstringMatch: false });
  assert.ok(diagnostic.payload.validation.issues.every((i: any) => Object.keys(i).every(key => ["code", "path", "category", "structure", "groundingDiagnostic"].includes(key))));
  const persisted = JSON.stringify([...h.tables.auditEvent.values(), ...h.tables.agentRunEvent.values(), ...h.tables.conversationMessage.values()]);
  assert.ok(!persisted.includes("Invented content"));
  assert.ok(!persisted.includes(JSON.stringify(h.report)));
});

for (const branch of ["unadmitted reference", "substring mismatch", "empty factIds", "unknown factIds", "valid factIds"] as const) {
  test(`persisted structured grounding diagnostic distinguishes ${branch} without raw values`, async () => {
    const h = await headingRead();
    if (branch === "unadmitted reference") h.report.facts[0].evidenceRef = "unadmitted-private-reference";
    if (branch === "substring mismatch") h.report.facts[0].text = "private-unsupported-source-text";
    if (branch === "empty factIds") h.report.inferences[0].factIds = [];
    if (branch === "unknown factIds") h.report.inferences[0].factIds = ["private-unknown-fact"];
    if (branch === "valid factIds") h.report.facts.push({ id: "other", text: "private-unsupported-source-text", evidenceRef: h.report.facts[0].evidenceRef });
    h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report heading", report: h.report }));
    await h.service.advance(h.run.id);
    assert.equal((await h.state()).state, "PARTIAL");
    assert.equal((await h.state()).understanding, undefined);
    const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
    const issues = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC").payload.validation.issues;
    const fact = issues.find((i: any) => i.code === "UNSUPPORTED_FACT");
    const inference = issues.find((i: any) => i.code === "UNSUPPORTED_INFERENCE");
    if (branch === "unadmitted reference") assert.partialDeepStrictEqual(fact.groundingDiagnostic, { evidenceReferenceAdmitted: false, exactSubstringMatch: false });
    if (branch === "substring mismatch" || branch === "valid factIds") assert.partialDeepStrictEqual(fact.groundingDiagnostic, { evidenceReferenceAdmitted: true, exactSubstringMatch: false });
    if (branch === "valid factIds") assert.equal(inference, undefined);
    else assert.partialDeepStrictEqual(inference.groundingDiagnostic, { factIdsValid: false });
    if (fact) {
      assert.equal(fact.groundingDiagnostic.comparison.classification,
        branch === "unadmitted reference" ? "REFERENCE_NOT_ADMITTED" : "NON_VERBATIM");
      assert.match(fact.groundingDiagnostic.comparison.factFingerprint, /^[a-f0-9]{64}$/);
    }
    if (inference) assert.deepEqual(inference.groundingDiagnostic.support, {
      accepted: 0, rejected: ["unadmitted reference", "substring mismatch"].includes(branch) ? 1 : 0,
      nonexistent: branch === "unknown factIds" ? 1 : 0, empty: branch === "empty factIds"
    });
    const persisted = JSON.stringify([...h.tables.auditEvent.values(), ...h.tables.agentRunEvent.values(), ...h.tables.conversationMessage.values()]);
    for (const marker of ["unadmitted-private-reference", "private-unsupported-source-text", "private-unknown-fact"]) assert.ok(!persisted.includes(marker));
    assert.ok(!persisted.includes(JSON.stringify(h.report)));
  });
}

test("grounding diagnostic projection whitelists booleans and discards raw issue properties", () => {
  const error = inspectionValidationError([{ code: "UNSUPPORTED_FACT", path: "$.facts[0]",
    groundingDiagnostic: { evidenceReferenceAdmitted: false, exactSubstringMatch: true, raw: "private-model-value" },
    rawResponse: "private-model-value" } as any]);
  assert.deepEqual(inspectionValidationDiagnostic(error), { code: "INVALID_MODEL_PROPOSAL", issues: [{
    code: "UNSUPPORTED_FACT", path: "$.facts[0]", category: "INVALID_FACT_REFERENCE", groundingDiagnostic: { evidenceReferenceAdmitted: false, exactSubstringMatch: true }
  }] });
});

test("heading inference without a supporting fact remains rejected", async () => {
  const h = await headingRead();
  h.report.inferences[0].text = "The site collects payment credentials and stores them remotely.";
  h.report.inferences[0].factIds = ["missing-fact"];
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report heading", report: h.report }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "PARTIAL");
  assert.equal((await h.state()).understanding, undefined);
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  const diagnostic = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.ok(diagnostic.payload.validation.issues.some((i: any) => i.code === "UNSUPPORTED_INFERENCE" && i.path === "$.inferences[0]"));
});

test("source-read certification gate retains its exact code in the diagnostic", async () => {
  const h = await headingRead("filesystem.list");
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report heading", report: h.report }));
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "PARTIAL");
  assert.equal(state.understanding, undefined);
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  const diagnostic = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.deepEqual(diagnostic.payload.validation, { code: "INSPECTION_SOURCE_READ_REQUIRED", issues: [] });
  assert.deepEqual(diagnostic.payload.codes, ["GROUNDING_NOT_VERIFIED"]);
});

test("malformed structured output fails closed instead of falling back to prose", async () => {
  const h = await headingRead();
  h.responses.push('The heading is "Building simple digital experiences." [index.html:L1-L5](evidence:S0000000000000000).');
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "FAILED");
  assert.equal(state.code, "INVALID_MODEL_PROPOSAL");
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  const diagnostic = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.deepEqual(diagnostic.payload.validation, { code: "INVALID_MODEL_PROPOSAL", issues: [{ code: "INVALID_JSON", path: "$", category: "INVALID_JSON" }] });
});

test("parser report schema diagnostics survive terminal rejection without raw values", async () => {
  const h = await headingRead();
  const marker = "RAW_PARSER_VALUE_MUST_NOT_PERSIST";
  (h.report.facts[0] as any).text = { raw: marker };
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: marker, report: h.report }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).code, "INVALID_MODEL_PROPOSAL");
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  const diagnostic = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.partialDeepStrictEqual(diagnostic.payload.validation, { code: "INVALID_MODEL_PROPOSAL", issues: [{ code: "SCHEMA_STRING", path: "$.report.facts[0].text", category: "INVALID_FIELD", structure: { expectedType: "string", actualType: "object" } }] });
  assert.ok(!JSON.stringify([...h.tables.auditEvent.values(), ...h.tables.agentRunEvent.values(), ...h.tables.conversationMessage.values()]).includes(marker));
});

test("explicit structured legacy report rejection retains its bounded reason", async () => {
  const h = await headingRead();
  h.responses.push(JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report heading", report: { ...h.report, steps: [] } }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).code, "INVALID_MODEL_PROPOSAL");
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  assert.deepEqual(events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC").payload.validation,
    { code: "INVALID_MODEL_PROPOSAL", issues: [{ code: "LEGACY_REPORT_NOT_ALLOWED", path: "$.report", category: "OTHER_CONTRACT_VIOLATION" }] });
});

test("successful structured request persists bounded timing without changing grounding", async () => {
  const h = await headingRead();
  h.responses.push((input: any) => {
    input.onDiagnostic({ correlationId: "correlation", providerId: "provider", providerType: "vllm", modelId: "model",
      httpClassification: "SUCCESS", durationMs: 50, requestTiming: { dispatchedAt: 1000, responseHeadersAt: 1040, requestBytes: 2000 } });
    return JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Heading", report: h.report });
  });
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "COMPLETED");
  assert.equal((await h.state()).understanding.status, "GROUNDED");
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  const timing = events.filter((e: any) => e.eventType === "PROVIDER_REQUEST_DIAGNOSTIC");
  assert.equal(timing.length, 1);
  assert.equal(timing[0].payload.requestBytes, 2000);
  assert.equal(timing[0].payload.responseHeadersAt, 1040);
  assert.equal(timing[0].payload.classification, "SUCCESS");
});

test("provider timeout preserves only bounded diagnostic fields with unchanged terminal failure", async () => {
  const h = await headingRead();
  const marker = "RAW_RESPONSE_AND_STACK_MUST_NOT_PERSIST";
  const error = new RequestTimeoutException(marker);
  error.stack = marker;
  Object.assign(error, { providerDiagnostic: { httpClassification: "TIMEOUT", failureStage: "REQUEST",
    failureCode: "CLIENT_DEADLINE", correlationId: "correlation", providerId: "provider", providerType: "vllm", modelId: "model",
    durationMs: 300001, requestTiming: { dispatchedAt: 1000, responseHeadersAt: null, requestBytes: 1200, rawPrompt: marker },
    rawResponse: marker, stack: marker }, rawResponse: marker });
  h.responses.push(() => { throw error; });
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "FAILED");
  assert.equal(state.code, "INSPECTION_FAILED");
  assert.equal(state.understanding, undefined);
  const run = await h.db.agentRun.findUnique({ where: { id: h.run.id } });
  assert.equal(run.status, "FAILED");
  assert.equal(run.failureReason, "INSPECTION_FAILED");
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  const diagnostics = events.filter((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.equal(diagnostics.length, 1);
  assert.deepEqual(diagnostics[0].payload, { codes: ["INSPECTION_FAILED"], provider: {
    classification: "TIMEOUT", stage: "REQUEST", code: "CLIENT_DEADLINE", request: {
      correlationId: "correlation", providerId: "provider", providerType: "vllm", modelId: "model",
      dispatchedAt: 1000, responseHeadersAt: null, requestBytes: 1200, durationMs: 300001,
      providerOrigin: null, deadlineAt: null, responseCompleteAt: null, httpStatus: null,
      classification: "TIMEOUT", stage: "REQUEST", code: "CLIENT_DEADLINE"
    } } });
  assert.ok(events.findIndex((e: any) => e === diagnostics[0]) < events.findIndex((e: any) => e.eventType === "INSPECTION_STATE_CHANGED" && e.payload.state === "FAILED"));
  assert.ok(!JSON.stringify([...h.tables.auditEvent.values(), ...h.tables.agentRunEvent.values(), ...h.tables.conversationMessage.values()]).includes(marker));
});

test("non-heading inspection retains free-form generation", async () => {
  const h = await inspectionHarness();
  h.responses.push(h.inspectStructured("filesystem.read", "auth.ts"));
  await h.service.advance(h.run.id);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].structured, undefined);
  assert.ok(!h.calls[0].systemInstruction.includes("bounded verbatim heading source excerpt"));
  const inspectionState = JSON.parse(h.calls[0].question.split("\n[INSPECTION STATE]\n")[1]);
  assert.ok(inspectionState.sourceCitations.every((c: any) => Object.hasOwn(c, "evidenceRef") && Object.hasOwn(c, "excerpt")));
});

test("invalid decision field persists actionable category/path without raw values", async () => {
  const h = await headingRead();
  const marker = "PRIVATE_INVALID_TOOL";
  h.responses.push(JSON.stringify({ decision: "INSPECT", recommendation: null, tool: marker, relativePath: "index.html", query: "", purpose: "Inspect", report: null }));
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "FAILED");
  const events = await h.db.agentRunEvent.findMany({ where: { agentRunId: h.run.id } });
  const diagnostic = events.find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
  assert.partialDeepStrictEqual(diagnostic.payload.validation, { code: "INVALID_MODEL_PROPOSAL", issues: [{ code: "INVALID_ENUM", path: "$.tool", category: "INVALID_ENUM", structure: { expectedType: "string", actualType: "string" } }] });
  assert.ok(!JSON.stringify([...h.tables.auditEvent.values(), ...h.tables.agentRunEvent.values()]).includes(marker));
});

test("structured dispatch uses the canonical transport schema and isolates legacy correction shape", async () => {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json.", correctiveAttempts: 1 }, "active");
  });
  h.responses.push(h.inspectStructured("filesystem.read", "package.json"));
  await h.service.advance(h.run.id);
  const request = h.calls.at(-1);
  assert.deepEqual(request.schema, INSPECTION_CANONICAL_SCHEMA);
  assert.match(request.systemInstruction, /All seven top-level fields are required/);
  assert.match(request.systemInstruction, /decision is required/);
  assert.match(request.systemInstruction, /purpose is required/);
  assert.ok(!request.systemInstruction.includes("sekhem-action"));
  assert.ok(!request.question.includes("sekhem-action"));
  assert.deepEqual(request.schema.properties.tool.enum, ["filesystem.list", "filesystem.read", "filesystem.search", "none"]);
  assert.match(request.systemInstruction, /The only tool values are \["filesystem.list","filesystem.read","filesystem.search","none"\]/);
  for (const name of ["read_file", "list_directory", "filesystem.write", "shell.exec", "allowed read tools"])
    assert.ok(!JSON.stringify({ instruction: request.systemInstruction, schema: request.schema }).includes(name));
  const state = await h.state();
  assert.equal(state.current.action.relativePath, "package.json");
  assert.equal(state.operations.length, 1);
});
