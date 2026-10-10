import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { generatePersistedPlan } from "../src/agent-runtime/understanding/persisted-planning";

for (const stage of ["CONTEXT_ADMISSION", "MODEL_PLANNING", "EVIDENCE_READMISSION", "PLAN_PERSISTENCE"]) {
  test(`planning catch preserves bounded code at ${stage} and remains FAILED/BLOCKED`, async () => {
    const secret = "private-model-value-and-stack";
    const error = new ConflictException("CERTIFIED_EVIDENCE_UNAVAILABLE");
    error.stack = secret;
    (error as any).rawResponse = secret;
    let transactions = 0, builds = 0;
    const writes: any[] = [], events: any[] = [];
    const tx: any = { agentRun: { findUnique: async () => ({ status: "PLANNING", planVersion: 2 }), update: async (v: any) => writes.push(v) },
      agentRunEvent: { create: async (v: any) => events.push(v.data) } };
    const context: any = { truncated: false, userIntent: [], providerDiagnostics: [] };
    const source: any = { sourceRunId: "certified-run", sourceConversationId: "conversation", references: [],
      conversation: { projectId: "project" }, checkpoint: { understanding: { facts: [{ evidenceRef: "ref", start: 0, end: 1, text: "x" }] }, evidence: [{ id: "ref", read: true }] } };
    const d: any = { inspections: { ledger: { transaction: async (fn: any) => {
      transactions++;
      if (transactions === 1) return { source, instruction: "Planning only", contextInstruction: "Planning only", version: 2, planId: "plan", requestContext: {} };
      if (stage === "PLAN_PERSISTENCE" && transactions === 2) throw error;
      return fn(tx);
    } } }, contexts: {
      buildRuntimeInspection: async () => { builds++; if (stage === "CONTEXT_ADMISSION" || stage === "EVIDENCE_READMISSION" && builds === 2) throw error; return context; },
      toReasoningPrompt: (_: any, visible: Map<string, string>) => { visible.set("ref", "x"); return "prompt"; }
    }, understanding: { createPlan: async () => { if (stage === "MODEL_PLANNING") throw error; return {}; } }, gateway: {} };
    await assert.rejects(generatePersistedPlan(d, { sub: "user" } as any, "conversation", { requestId: "request", expectedVersion: 1 }), e => e === error);
    assert.equal(writes[0].data.status, "FAILED");
    assert.equal(writes[0].data.failureReason, "BLOCKED");
    assert.equal(events[0].payload.outcome, "BLOCKED");
    assert.deepEqual(events[0].payload.diagnostic, { code: "CERTIFIED_EVIDENCE_UNAVAILABLE", stage });
    assert.ok(!JSON.stringify({ writes, events }).includes(secret));
  });
}

test("unknown exception contents are not persisted as diagnostic codes", async () => {
  const events: any[] = [];
  let calls = 0;
  const error = new Error("SECRET_TOKEN");
  const d: any = { inspections: { ledger: { transaction: async (fn: any) => ++calls === 1 ? {
    source: { conversation: {} }, instruction: "Planning only", contextInstruction: "Planning only", version: 1, planId: "plan"
  } : fn({ agentRun: { findUnique: async () => ({ status: "PLANNING", planVersion: 1 }), update: async () => {} }, agentRunEvent: { create: async (v: any) => events.push(v.data) } }) } },
    contexts: { buildRuntimeInspection: async () => { throw error; } } };
  await assert.rejects(generatePersistedPlan(d, { sub: "user" } as any, "conversation", { requestId: "request", expectedVersion: 0 }));
  assert.deepEqual(events[0].payload.diagnostic, { code: "UNCLASSIFIED_EXCEPTION", stage: "CONTEXT_ADMISSION" });
  assert.ok(!JSON.stringify(events).includes("SECRET_TOKEN"));
});
