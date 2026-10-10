import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { interpretContext, validatePlanningProposal, type AgentPlanningProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { packageVersionRequest } from "../src/agent-runtime/understanding/package-version-constraint";

const request = 'عدّل فقط قيمة version في package.json من "0.1.0" إلى "0.1.1". حافظ على كل المحتوى الآخر وترتيب وتنسيق الملف. اعرض التغيير للمراجعة وانتظر موافقتي قبل أي تعديل.';
const original = 'غيّر version في package.json من 0.1.0 إلى 0.1.1 مع الحفاظ على باقي الملف كما هو، راجع التغيير واستنى موافقتي.';
const review = 'غيّر version في package.json من 0.1.1 إلى 0.1.2، اعرض التغيير واستنى موافقتي.';
const source = '{\r\n  "name": "fixture",\r\n  "version": "0.1.0",\r\n  "private": true\r\n}\r\n';
const ref = "runtime:verified-package-receipt";
function fixture(instruction = request, text = source) {
  const service = new AgentUnderstandingService();
  const context = service.understand({ userId: "user", projectId: "project", instruction, workspaceAvailable: true, availableCapabilities: [] });
  context.userIntent = [...new Set([...context.userIntent, "PLAN" as const])];
  context.certifiedSourceReuse = true;
  context.evidence = [{ sourceType: "workspace", sourceId: "read-operation", relativePath: "package.json", provenance: ref,
    status: "COLLECTED", metadata: { operation: "filesystem.read" }, warnings: [],
    runtimeReference: { receiptId: "verified-package-receipt", relativePath: "package.json", truncated: false, verificationState: "VERIFIED" } as any,
    content: { text, detectedMime: "application/json", extractorId: "text", truncated: false } }];
  const visible = new Map([[ref, text]]), base = interpretContext(context, visible);
  const proposal: AgentPlanningProposal = { constraintIds: base.constraints.map(c => c.id),
    facts: [{ id: "version", text: '"version": "0.1.0"', evidenceRef: ref }], inferences: [], hypotheses: [], unknowns: [], steps: [
      { id: "change", type: "IMPLEMENT", purpose: "PROPOSE_CHANGE", effect: "WRITE", evidenceRefs: [ref], scopeRefs: ["scope-1"], dependencies: [], missingInformationIds: [],
        verificationCriterionIds: ["requested-outcome", "package-version-only"], dependencyStatus: "KNOWN", description: "Change only the version after fresh preimage validation and human approval.", verificationDescription: "Preserve all other bytes, order and formatting." },
      { id: "verify", type: "VERIFY", purpose: "CHECK_OUTCOME", effect: "READ_ONLY", evidenceRefs: [ref], scopeRefs: ["scope-1"], dependencies: ["change"], missingInformationIds: [],
        verificationCriterionIds: ["requested-outcome", "package-version-only"], dependencyStatus: "KNOWN", description: "Authorized read-back of the approved package change.", verificationDescription: "Verify version 0.1.1 and every preserved byte." }
    ] };
  return { service, context, visible, base, proposal };
}

for (const instruction of [review, review.replace("0.1.1", '"0.1.1"').replace("0.1.2", '"0.1.2"'),
  'Change version in package.json from 0.1.1 to 0.1.2, show the change and wait for my approval.',
  'Change version in package.json from "0.1.1" to "0.1.2", show the change and wait for my approval.'])
test(`MVP review-only version request is source-bound: ${instruction}`, async () => {
  const f = fixture(instruction, source.replace("0.1.0", "0.1.1"));
  assert.ok(f.context.userIntent.includes("MODIFY"));
  assert.equal(f.context.operationClass, "WRITE");
  assert.ok(!f.context.userIntent.includes("EXECUTE"));
  const change = f.base.constraints.find(c => c.rule === "PACKAGE_VERSION_ONLY")!;
  assert.equal(change.packageVersionChange?.before, "0.1.1");
  assert.equal(change.packageVersionChange?.after, "0.1.2");
  assert.equal(change.packageVersionChange?.evidenceRef, ref);
  assert.equal(f.base.constraints.find(c => c.id === "package-review-before-write")?.requestQuote, packageVersionRequest(instruction)!.approval);
  assert.match(f.base.successCriteria.find(c => c.id === "requested-outcome")!.description, /0\.1\.1.*0\.1\.2/);
  f.proposal.facts[0].text = '"version": "0.1.1"';
  const result = await f.service.createPlan(f.context, "verified source", f.visible,
    { requestStructuredReasoning: async () => JSON.stringify(f.proposal) }, true);
  assert.equal(result?.plan.readiness, "PLAN_READY");
  assert.equal(result?.plan.authorization, "NOT_GRANTED");
});

test("short version operands reject unmatched quotes and malformed versions", () => {
  for (const operand of ['"0.1.1', '0.1.1"', '"0.1"', '0.1.1-beta', '0.1.1.0']) {
    assert.equal(packageVersionRequest(review.replace("0.1.1", operand)), undefined);
    assert.equal(packageVersionRequest(`Change version in package.json from ${operand} to 0.1.2, show the change and wait for my approval.`), undefined);
  }
});

test("short review form cannot bypass verified old-value evidence or expand its scope", () => {
  assert.ok(fixture(review).base.unknowns.some(u => u.id === "success-criteria"));
  for (const objective of ["لا " + review, review + " غيّر scripts أيضًا.", review.replace("version", "name"), review.replace("package.json", "other.json")])
    assert.equal(packageVersionRequest(objective), undefined);
  const context = new AgentUnderstandingService().understand({ userId: "user", instruction: "لا " + review, workspaceAvailable: true, availableCapabilities: [] });
  assert.ok(!context.userIntent.includes("MODIFY"));
});

for (const objective of [request, original]) test(`bounded live request derives a source-bound outcome: ${objective.slice(0, 20)}`, async () => {
  const f = fixture(objective);
  const outcome = f.base.successCriteria.find(c => c.id === "requested-outcome")!;
  assert.equal(outcome.source, "USER"); assert.equal(outcome.requestQuote, objective);
  assert.match(outcome.description, /package\.json.*0\.1\.0.*0\.1\.1/);
  assert.equal(f.base.unknowns.some(u => u.id === "success-criteria"), false);
  let calls = 0;
  const result = await f.service.createPlan(f.context, "verified source", f.visible, { requestStructuredReasoning: async input => {
    calls++;
    const data = JSON.parse(input.question.split("[PLANNING CONTRACT DATA]\n")[1]);
    assert.ok(data.successCriteria.some((c: any) => c.id === "requested-outcome"));
    return JSON.stringify(f.proposal);
  } }, true);
  assert.equal(calls, 1); assert.equal(result?.plan.readiness, "PLAN_READY");
  assert.equal(result?.plan.authorization, "NOT_GRANTED");
});

test("preservation and wait-for-approval remain exact user constraints, never satisfied authority", () => {
  const f = fixture(), parsed = packageVersionRequest(request)!;
  const scope = f.base.constraints.find(c => c.rule === "PACKAGE_VERSION_ONLY")!;
  assert.ok(scope.requestQuotes!.includes(parsed.preservation));
  assert.equal(scope.packageVersionChange?.evidenceRef, ref);
  assert.equal(scope.packageVersionChange?.before, "0.1.0");
  assert.match(scope.packageVersionChange!.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(f.base.constraints.find(c => c.id === "package-review-before-write")!.requestQuote, parsed.approval);
  assert.equal(f.base.constraints.find(c => c.id === "package-review-before-write")!.rule, "PLANNING_ONLY");
  assert.equal(f.base.successCriteria.find(c => c.id === "package-version-only")!.requestQuote, parsed.preservation);
});

for (const [name, mutate] of [
  ["unverified receipt", (f: ReturnType<typeof fixture>) => { (f.context.evidence[0].runtimeReference as any).verificationState = "PENDING"; }],
  ["denied evidence", (f: ReturnType<typeof fixture>) => { f.context.evidence[0].status = "DENIED"; }],
  ["truncated read", (f: ReturnType<typeof fixture>) => { f.context.evidence[0].runtimeReference!.truncated = true; }],
  ["truncated content", (f: ReturnType<typeof fixture>) => { f.context.evidence[0].content!.truncated = true; }],
  ["missing truncation status", (f: ReturnType<typeof fixture>) => { delete (f.context.evidence[0].runtimeReference as any).truncated; }],
  ["missing source content", (f: ReturnType<typeof fixture>) => { delete f.context.evidence[0].content; f.visible.clear(); }],
  ["wrong path", (f: ReturnType<typeof fixture>) => { f.context.evidence[0].relativePath = "other.json"; }],
  ["search observation", (f: ReturnType<typeof fixture>) => { f.context.evidence[0].metadata.operation = "filesystem.search"; }],
  ["visible evidence mismatch", (f: ReturnType<typeof fixture>) => { f.visible.set(ref, "unadmitted content"); }]
] as const) test(`old version cannot be established by ${name}`, () => {
  const f = fixture(); mutate(f);
  const base = interpretContext(f.context, f.visible);
  assert.ok(base.unknowns.some(u => u.id === "success-criteria"));
  assert.ok(!base.constraints.some(c => c.rule === "PACKAGE_VERSION_ONLY"));
});

for (const text of [source.replace("0.1.0", "0.2.0"), '{"version":"0.1.0","version":"0.1.0"}',
  '{"version":"0.1.0","\\u0076ersion":"0.1.0"}', '{"nested":{"version":"0.1.0"}}', '{"version":"0.1.0"'])
  test(`wrong, duplicate, nested or malformed old-version evidence fails closed: ${text.length}`, () => {
    const f = fixture(request, text);
    assert.ok(f.base.unknowns.some(u => u.id === "success-criteria"));
  });

test("conflicting verified sources cannot establish the old version", () => {
  const f = fixture();
  f.context.evidence.push({ ...structuredClone(f.context.evidence[0]), provenance: "runtime:other", content: { ...f.context.evidence[0].content!, text: source.replace('"private": true', '"private": false') } });
  f.visible.set("runtime:other", f.context.evidence[1].content!.text);
  assert.ok(interpretContext(f.context, f.visible).unknowns.some(u => u.id === "success-criteria"));
});

for (const objective of ["Modify package.json.", request.replace("version", "name"), request.replace("package.json", "other.json"),
  request.replace('"0.1.1"', '" 0.1.1 "'), request + " Must disable authentication.", "Fix the authentication bug."])
  test(`unsupported modification remains PLAN_NOT_READY: ${objective.slice(0, 24)}`, async () => {
    const f = fixture(objective);
    const result = await f.service.createPlan(f.context, "source", f.visible, { requestStructuredReasoning: async () => assert.fail("must stop before planner") }, true);
    assert.equal(result?.plan.readiness, "PLAN_NOT_READY");
    assert.ok(result?.plan.missingInformation.some(u => u.id === "success-criteria"));
  });

test("future approval remains UNKNOWN/non-blocking, while missing source facts and verification still block", async () => {
  const f = fixture();
  f.proposal.unknowns = [{ id: "approval", description: "Future human approval", whyNeeded: "Before executing the reviewed proposal", severity: "HIGH", classification: "FUTURE_EXECUTION_PREREQUISITE" }];
  let result = (await f.service.createPlan(f.context, "verified source", f.visible,
    { requestStructuredReasoning: async () => JSON.stringify(f.proposal) }, true))!;
  assert.equal(result.plan.readiness, "PLAN_READY"); assert.equal(result.plan.authorization, "NOT_GRANTED");
  assert.equal(result.planningInformation!.find(i => i.id === "approval")!.state, "UNKNOWN");
  f.proposal.unknowns = [];
  f.proposal.facts[0].text = '"name": "fixture"';
  result = validatePlanningProposal(f.base, f.proposal, f.visible, true);
  assert.ok(result.plan.validation.issues.some(i => i.code === "PACKAGE_VERSION_SOURCE_REQUIRED"));
  f.proposal.facts[0].text = '"version": "0.1.0"'; f.proposal.steps[1].verificationCriterionIds = ["requested-outcome"];
  result = validatePlanningProposal(f.base, f.proposal, f.visible, true);
  assert.ok(result.plan.validation.issues.some(i => i.code === "PACKAGE_VERSION_VERIFICATION_REQUIRED"));
});

test("package planning cannot expand scope or replace preservation with a command", () => {
  for (const mutation of ["scope", "command"] as const) {
    const f = fixture();
    if (mutation === "scope") f.proposal.steps[0].scopeRefs.push("project");
    else f.proposal.steps[0].effect = "EXECUTE";
    const result = validatePlanningProposal(f.base, f.proposal, f.visible, true);
    assert.equal(result.plan.readiness, "PLAN_NOT_READY");
    assert.ok(result.plan.validation.issues.some(i => i.code === "PACKAGE_VERSION_SCOPE_VIOLATION"));
  }
});
