import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { inspectionFailureDiagnostic } from "../src/agent-runtime/inspection/inspection-failure-diagnostic";
import type { ProviderDiagnostic } from "../src/ai-gateway/provider-diagnostic";
import type { InspectionLoop } from "../src/agent-runtime/inspection/inspection.contract";

const provider = { correlationId: "ai-reasoning-123b80a9-b503-40e9-bd73-819e925beedb", httpStatus: 200, httpClassification: "SUCCESS" } as ProviderDiagnostic;
test("bounded Prisma codes survive diagnostics without database values", () => {
  const failure = Object.assign(new Error("PRIVATE_CONNECTION_AND_QUERY"), { code: "P2010", meta: { password: "PRIVATE_SECRET" } });
  const diagnostic = inspectionFailureDiagnostic("run", failure, { stage: "persistence" });
  assert.equal(diagnostic.code, "P2010");
  assert.equal(diagnostic.category, "PERSISTENCE");
  assert.ok(!JSON.stringify(diagnostic).includes("PRIVATE"));
  const unknown = Object.assign(new Error("PRIVATE"), { code: "PRIVATE_TOKEN" });
  assert.equal(inspectionFailureDiagnostic("run", unknown, { stage: "persistence" }).code, "UNEXPECTED_EXCEPTION");
});
test("known runtime failure classifications remain visible without arbitrary error disclosure", () => {
  for (const code of ["FAILED", "RUNTIME_OFFLINE", "RUNTIME_AUTHORIZING_SESSION_INVALID", "OUTCOME_UNKNOWN"]) {
    assert.equal(inspectionFailureDiagnostic("run", new Error(code), { stage: "authorization" }).code, code);
  }
  assert.equal(inspectionFailureDiagnostic("run", new Error("PRIVATE_SECRET_ERROR"), { stage: "authorization" }).code, "UNEXPECTED_EXCEPTION");
});
type Harness = Awaited<ReturnType<typeof inspectionHarness>>;
const events = (h: Harness, type: string) => [...h.tables.agentRunEvent.values()].filter(e => e.eventType === type);
async function fixture() {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<InspectionLoop>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json." }, "active");
  });
  return h;
}
test("received provider success followed by invalid JSON persists parsing category and correlation", async () => {
  const h = await fixture();
  h.responses.push(input => { input.onDiagnostic(provider); return "PRIVATE_RAW_INVALID_JSON"; });
  await h.service.advance(h.run.id);
  const d = events(h, "INSPECTION_FAILURE_DIAGNOSTIC")[0].payload;
  assert.equal(d.stage, "parsing"); assert.equal(d.code, "INVALID_JSON"); assert.equal(d.responseReceived, true);
  assert.equal(d.correlationId, provider.correlationId); assert.equal(d.httpStatus, 200);
  assert.ok(!JSON.stringify(d).includes("PRIVATE_RAW"));
  assert.equal((await h.state()).state, "FAILED");
  await h.newService().advance(h.run.id);
  assert.equal(h.calls.length, 1); assert.equal(events(h, "INSPECTION_FAILURE_DIAGNOSTIC").length, 1);
});
test("reporting insert failure cannot roll back original terminal failure or diagnostics", async () => {
  const h = await fixture();
  h.responses.push("{");
  h.db.conversationMessage.create = async () => { throw Object.assign(new Error("PRIVATE_DATABASE_VALUES"), { code: "P2002" }); };
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "FAILED");
  assert.equal(events(h, "INSPECTION_FAILURE_DIAGNOSTIC")[0].payload.code, "INVALID_JSON");
  const d = events(h, "INSPECTION_REPORTING_DIAGNOSTIC")[0].payload;
  assert.equal(d.stage, "persistence"); assert.equal(d.code, "P2002");
  assert.ok(!JSON.stringify(d).includes("PRIVATE_DATABASE"));
});
test("post-response persistence failure stays failed without redispatch", async () => {
  const h = await fixture();
  h.responses.push(input => { input.onDiagnostic(provider); return h.inspectStructured("filesystem.read", "package.json"); });
  const create = h.db.conversationMessage.create;
  let first = true;
  h.db.conversationMessage.create = async (input: unknown) => {
    if (first) { first = false; throw Object.assign(new Error("PRIVATE"), { code: "P2028" }); }
    return create(input);
  };
  await h.service.advance(h.run.id);
  const d = events(h, "INSPECTION_FAILURE_DIAGNOSTIC")[0].payload;
  assert.equal(d.stage, "persistence"); assert.equal(d.code, "P2028"); assert.equal(d.responseReceived, true);
  assert.equal((await h.state()).state, "FAILED"); assert.equal((await h.state()).operations.length, 0);
  await h.service.advance(h.run.id); assert.equal(h.calls.length, 1);
});
test("grounding exception is retained without certifying unsupported source facts", async () => {
  const h = await fixture();
  h.responses.push(input => { input.onDiagnostic(provider); return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report",
    report: { constraintIds: [], facts: [{ id: "f", text: "PRIVATE_UNVERIFIED_FACT", evidenceRef: "missing" }], inferences: [], hypotheses: [], unknowns: [] }, recommendation: null }); });
  await h.service.advance(h.run.id);
  assert.ok(!(await h.state()).understanding);
  const d = events(h, "MODEL_OUTPUT_DIAGNOSTIC").find(e => e.payload.failure)?.payload.failure;
  assert.ok(d); assert.equal(d.stage, "grounding"); assert.equal(d.responseReceived, true);
  assert.ok(!JSON.stringify(d).includes("PRIVATE_UNVERIFIED_FACT"));
});
test("checkpoint persistence failure rolls back certification and retains exact stage", async () => {
  const h = await fixture();
  h.responses.push(h.inspectStructured("filesystem.read", "package.json"));
  await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, '{"version":"0.1.0"}');
  await h.service.advance(h.run.id);
  h.responses.push(input => {
    input.onDiagnostic(provider);
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]);
    const source = state.sourceCitations[0];
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report",
      report: { constraintIds: state.planningContract.constraints.map((c: { id: string }) => c.id),
        facts: [{ id: "version", text: source.excerpt, evidenceRef: source.evidenceRef }], inferences: [], hypotheses: [], unknowns: [] }, recommendation: null });
  });
  const event = h.control.event.bind(h.control);
  h.control.event = async (...args: Parameters<typeof h.control.event>) => {
    const [, , type] = args;
    if (type === "UNDERSTANDING_CHECKPOINT") throw Object.assign(new Error("PRIVATE_DATABASE_VALUES"), { code: "P2028" });
    return event(...args);
  };
  await h.service.advance(h.run.id);
  const d = events(h, "INSPECTION_FAILURE_DIAGNOSTIC")[0].payload;
  assert.equal(d.stage, "checkpoint"); assert.equal(d.code, "P2028");
  assert.equal((await h.state()).state, "FAILED"); assert.ok(!(await h.state()).understanding);
  assert.equal(events(h, "UNDERSTANDING_CHECKPOINT").length, 0);
  assert.equal((await h.state()).operations.length, 1);
});
for (const [message, stage] of [["USER_CANCELLED", "cancellation"], ["INSPECTION_REASONING_TIMEOUT", "deadline"]] as const)
  test(`${stage} remains distinguishable from contract rejection`, async () => {
    const h = await fixture(); h.responses.push(() => { throw new Error(message); });
    await h.service.advance(h.run.id);
    assert.equal(events(h, "INSPECTION_FAILURE_DIAGNOSTIC")[0].payload.stage, stage);
    assert.equal((await h.state()).state, stage === "cancellation" ? "CANCELLED" : "FAILED");
  });
test("unknown exceptions never persist arbitrary messages, properties or stacks", () => {
  const d = inspectionFailureDiagnostic("run-fixture", Object.assign(new Error("SECRET_TOKEN=private"), { secret: "PRIVATE", code: "SECRET" }), { stage: "checkpoint" });
  assert.equal(d.stage, "checkpoint"); assert.equal(d.code, "UNEXPECTED_EXCEPTION");
  assert.ok(!JSON.stringify(d).includes("private")); assert.ok(!JSON.stringify(d).includes("SECRET"));
});
for (const [classification, stage, code] of [["INVALID_JSON", "parsing", "INVALID_JSON"], ["INVALID_SCHEMA", "contract_validation", "INVALID_CONTENT"]] as const)
  test(`gateway ${classification} retains its safe failure code before returning to inspection`, () => {
    const error = Object.assign(new Error("PRIVATE_PROVIDER_RESPONSE"), { providerDiagnostic: { ...provider, httpClassification: classification, failureCode: code } });
    const d = inspectionFailureDiagnostic("run-fixture", error, { stage: "provider" });
    assert.equal(d.stage, stage); assert.equal(d.code, code); assert.equal(d.responseReceived, true);
    assert.ok(!JSON.stringify(d).includes("PRIVATE_PROVIDER_RESPONSE"));
  });
