import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { INSPECTION_CANONICAL_SCHEMA, INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION, INSPECTION_TARGET_INSTRUCTION, parseInspectionDecision } from "../src/agent-runtime/inspection/inspection.contract";
import { inspectionValidationDiagnostic, inspectionValidationError } from "../src/agent-runtime/inspection/inspection-understanding";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
const binding: any = { rootPath: "C:\\fixture" };
const envelope = (relativePath: unknown, tool = "filesystem.read") => ({ decision: "INSPECT", tool, relativePath, query: tool === "filesystem.search" ? "version" : "", purpose: "Inspect source", report: null, recommendation: null });

for (const [path, normalized] of [["docs/architecture.md", "docs/architecture.md"], ["src\\main.ts", "src/main.ts"], ["src//main.ts", "src/main.ts"]])
  test(`supported relative target ${path} retains existing normalization`, () => {
    const result = parseInspectionDecision(JSON.stringify(envelope(path)), binding, true);
    assert.equal(result.decision, "INSPECT"); if (result.decision === "INSPECT") assert.equal(result.action.relativePath, normalized);
  });
for (const tool of ["filesystem.list", "filesystem.search"])
  test(`${tool} accepts empty root without substituting a path`, () => {
    const result = parseInspectionDecision(JSON.stringify(envelope("", tool)), binding, true);
    assert.equal(result.decision, "INSPECT"); if (result.decision === "INSPECT") assert.equal(result.action.relativePath, "");
  });

const rejected = [
  [undefined, "MISSING_TARGET"], [42, "TARGET_TYPE"], ["", "FILE_REQUIRED"], ["x".repeat(1025), "TARGET_LENGTH"],
  ["C:\\PRIVATE\\source.ts", "INVALID_CHARACTERS"], ["/PRIVATE/source.ts", "ROOTED_PATH"], ["\\\\host\\PRIVATE", "ROOTED_PATH"],
  ["../PRIVATE", "DOT_SEGMENT"], ["src/../PRIVATE", "DOT_SEGMENT"], [".", "DOT_SEGMENT"], ["./source.ts", "DOT_SEGMENT"],
  ["src/*.ts", "INVALID_CHARACTERS"], ["src/PRIVATE\u0000.ts", "INVALID_CHARACTERS"], [".env", "SENSITIVE_PATH"],
  ["node_modules/PRIVATE.ts", "SENSITIVE_PATH"], [".pnpm-store/PRIVATE.ts", "EXCLUDED_PATH"]
] as const;
for (const [path, reason] of rejected) test(`target rejects ${reason} with bounded diagnostics and no dispatch`, async () => {
  const value = envelope(path);
  assert.throws(() => parseInspectionDecision(JSON.stringify(value), binding, true), error => {
    const d = inspectionValidationDiagnostic(error)!;
    assert.equal(d.issues[0].targetReason, reason);
    assert.ok(!JSON.stringify(d).includes("PRIVATE"));
    return true;
  });
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read package.json." }, "active");
  });
  h.responses.push(JSON.stringify(value)); await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "FAILED"); assert.equal((await h.state()).operations.length, 0);
  const events = [...h.tables.agentRunEvent.values()] as any[];
  const diagnostic = events.find(e => e.eventType === "INSPECTION_FAILURE_DIAGNOSTIC");
  assert.equal(diagnostic.payload.validation.issues[0].targetReason, reason);
  assert.equal(events.filter(e => e.eventType === "WORKSPACE_READ_AUTHORIZED").length, 0);
  await h.newService().advance(h.run.id); assert.equal(h.calls.length, 1);
});
test("REPORT/STOP retain the exact empty target requirement", () => {
  assert.throws(() => parseInspectionDecision(JSON.stringify({ ...envelope("source.ts", "none"), decision: "STOP" }), binding, true), error => {
    assert.equal(inspectionValidationDiagnostic(error)!.issues[0].targetReason, "EMPTY_TARGET_REQUIRED"); return true;
  });
});
test("structured instructions and schema describe the same supported target form", async () => {
  assert.equal(INSPECTION_CANONICAL_SCHEMA.properties.relativePath.description, INSPECTION_TARGET_INSTRUCTION);
  assert.ok(INSPECTION_STRUCTURED_OUTPUT_INSTRUCTION.includes(INSPECTION_TARGET_INSTRUCTION));
  assert.match(INSPECTION_TARGET_INSTRUCTION, /never "\."/); assert.match(INSPECTION_TARGET_INSTRUCTION, /non-empty file path/);
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective: "Read docs/architecture.md." }, "active");
  });
  h.responses.push(h.inspectStructured("filesystem.read", "docs/architecture.md"));
  await h.service.advance(h.run.id);
  assert.ok(h.calls[0].systemInstruction.includes(INSPECTION_TARGET_INSTRUCTION));
  assert.equal((await h.state()).current!.action.relativePath, "docs/architecture.md");
  assert.equal((await h.state()).state, "AWAITING_APPROVAL");
  assert.equal((await h.request("poll")).execution, null);
});
test("forged target diagnostic text cannot persist arbitrary sensitive values", () => {
  const d = inspectionValidationDiagnostic(inspectionValidationError([{ code: "INVALID_TARGET", path: "$.relativePath", targetReason: "PRIVATE_SECRET" as any }]))!;
  assert.equal(d.issues[0].targetReason, undefined); assert.ok(!JSON.stringify(d).includes("PRIVATE_SECRET"));
});
for (const [field, value] of [["version", 999], ["runtimeFingerprint", "0".repeat(64)]] as const)
  test(`existing binding ${field} mismatch prevents model and filesystem dispatch`, async () => {
    const h = await inspectionHarness();
    await h.ledger.transaction(async tx => {
      const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
      await h.ledger.update(tx, row, { ...row.payload, binding: { ...row.payload.binding, [field]: value } }, "active");
    });
    await h.service.advance(h.run.id);
    assert.equal((await h.state()).state, "FAILED"); assert.equal(h.calls.length, 0);
    assert.equal((await h.state()).operations.length, 0);
  });
