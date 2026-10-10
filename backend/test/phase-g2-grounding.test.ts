import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { citationCatalog, citationSources } from "../src/agent-runtime/inspection/inspection-grounding";
import { interpretContext, PLANNING_LIMITS } from "../src/agent-runtime/understanding/agent-planning.contract";

const review = "اقرأ المشروع ده وافهم هو عبارة عن إيه، وقولي إيه أهم الأجزاء والوظائف اللي فيه.";
const readPackage = "اقرأ package.json بالكامل، وقولي أهم scripts والـdependencies الموجودة فيه، من الملف نفسه فقط. لا تنفذ أي تعديل أو أمر.";
const manifest = JSON.stringify({ name: "fixture", version: "0.1.0", scripts: { dev: "next dev", test: "node --test" },
  dependencies: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`dependency-${i}`, "1.0.0"])) }, null, 2) + "\n";
const readme = "# Fixture project\r\n\r\nA source-grounded project overview.\r\n\r\n" +
  Array.from({ length: 16 }, (_, i) => `Section ${i}: bounded documentation of the fixture.`).join("\r\n") + "\r\n";

async function observed(objective: string, path: string, body: string) {
  const h = await inspectionHarness();
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective }, "settled");
  });
  h.responses.push(objective === readPackage ? h.inspectStructured("filesystem.read", path) : h.inspect("filesystem.read", path));
  await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, body);
  await h.service.advance(h.run.id);
  const state = await h.state();
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role,
    organizationId: h.claims.organizationId, sessionClaims: h.claims, projectId: h.run.projectId,
    conversationId: h.run.conversationId, agentRunId: h.run.id, instruction: objective, runtimeEvidence: state.references,
    availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible);
  const base = interpretContext(context, visible), sources = citationSources(context, visible, h.binding);
  return { ...h, visible, base, sources };
}

test("G2 non-HTML catalog supplies bounded contiguous exact excerpts from admitted visible source", async () => {
  for (const [path, body] of [["README.md", readme], ["package.json", manifest]]) {
    const h = await observed(readPackage, path, body);
    const catalog = citationCatalog(h.sources)[0];
    assert.ok(catalog.anchors?.length); assert.ok(catalog.anchors.length <= PLANNING_LIMITS.items);
    for (const anchor of catalog.anchors) {
      assert.ok(anchor.excerpt.length <= PLANNING_LIMITS.text);
      assert.ok(h.visible.get(h.sources[0].evidenceRef)!.includes(anchor.excerpt));
      const range = /:L(\d+)-L(\d+)/.exec(anchor.citation)!;
      assert.equal(anchor.excerpt, body.split("\n").slice(Number(range[1]) - 1, Number(range[2])).join("\n"));
    }
    if (path === "README.md") assert.ok(catalog.anchors[0].excerpt.includes("\r\n"));
  }
});

for (const variant of ["valid", "missing", "invalid"] as const) test(`G2 broad review certification with ${variant} evidence reference`, async () => {
  const h = await observed(review, "README.md", readme);
  h.responses.push(input => {
    assert.equal(input.structured, undefined); // Preserve the existing conversation inspection path.
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]);
    const anchor = state.sourceCitations[0].anchors[0];
    assert.ok(readme.includes(state.sourceCitations[0].excerpt.slice(anchor.start, anchor.end)));
    const citation = variant === "valid" ? anchor.citation : variant === "missing" ? "" : anchor.citation.replace(/S[0-9a-f]{16}/, "S0000000000000000");
    return `Observed project title: \`Fixture project\`. ${citation}`;
  });
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.operations[0].verification, "VERIFIED"); assert.equal(state.operations[0].evidence.truncated, false);
  if (variant === "valid") {
    assert.equal(state.understanding.status, "GROUNDED");
    assert.equal(state.understanding.understanding.readiness, "UNDERSTANDING_READY");
    assert.ok(state.understanding.understanding.facts.every((f: any) => readme.includes(f.text)));
  } else { assert.equal(state.state, "NEEDS_MORE_EVIDENCE"); assert.ok(!state.understanding); }
  assert.equal(state.operations.length, 1); assert.equal((await h.request("poll")).execution, null);
});

for (const variant of ["exact", "paraphrase", "rejected-support", "nonexistent-support"] as const)
  test(`G2 package.json structured facts: ${variant}`, async () => {
    const h = await observed(readPackage, "package.json", manifest);
    h.responses.push(input => {
      assert.equal(input.purpose, "STRUCTURED_INSPECTION");
      const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]);
      const source = state.sourceCitations[0], anchor = source.anchors[0];
      const excerpt = source.excerpt.slice(anchor.start, anchor.end);
      assert.equal(source.evidenceRef, h.sources[0].evidenceRef);
      assert.ok(h.visible.get(source.evidenceRef)!.includes(excerpt));
      assert.ok(excerpt.includes('"version": "0.1.0"'));
      const invalidFact = variant === "paraphrase" || variant === "rejected-support";
      return JSON.stringify({ decision: "REPORT", recommendation: null, tool: "none", relativePath: "", query: "", purpose: "Report admitted source",
        report: { constraintIds: h.base.constraints.map(c => c.id),
          facts: [{ id: "manifest", text: invalidFact ? "The manifest has version 0.1.0." : excerpt, evidenceRef: source.evidenceRef }],
          inferences: variant.endsWith("support") ? [{ id: "interpretation", text: "The version is declared in the manifest.",
            factIds: [variant === "nonexistent-support" ? "absent" : "manifest"], uncertainty: "Source interpretation only." }] : [], hypotheses: [], unknowns: [] } });
    });
    await h.service.advance(h.run.id);
    const state = await h.state();
    if (variant === "exact") { assert.equal(state.understanding.status, "GROUNDED"); assert.equal(state.understanding.understanding.readiness, "UNDERSTANDING_READY"); }
    else {
      assert.equal(state.state, "PARTIAL"); assert.ok(!state.understanding);
      const event: any = [...h.tables.agentRunEvent.values()].find((e: any) => e.eventType === "MODEL_OUTPUT_DIAGNOSTIC");
      assert.ok(event.payload.validation.issues.some((i: any) => i.code === (variant.endsWith("support") ? "UNSUPPORTED_INFERENCE" : "UNSUPPORTED_FACT")));
    }
    assert.equal(state.operations.length, 1); assert.equal((await h.request("poll")).execution, null);
  });
