import { createHash } from "node:crypto";
import { toolDigest } from "../../src/agent-runtime/tools/tool-contract";
import { inspectionHarness } from "./inspection-loop-harness";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const source = '<section class="hero"><h1>Building <span>intelligent</span> digital experiences.</h1></section>';
export async function fixture() {
  const h = await inspectionHarness();
  const workspace = { workspaceId: h.binding.workspaceId, bindingVersion: h.binding.version, runtimeId: h.binding.runtimeId, runtimeFingerprint: h.binding.runtimeFingerprint };
  const fresh: any = { conversation: { projectId: h.run.projectId }, sourceRunId: "grounded", sourceConversationId: h.run.conversationId, digest: "grounding-digest",
    checkpoint: { version: 1, sequence: 1 }, binding: h.binding, references: [{ receiptId: "read-receipt" }] };
  const change = { relativePath: "index.html", evidenceRef: "read-receipt", sourceSha256: sha(source), selector: "section.hero h1",
    before: "Building intelligent digital experiences.", after: "Building intelligent digital products.",
    start: source.indexOf("experiences"), end: source.indexOf("experiences") + "experiences".length, replacement: "products", titleExcerpt: source.slice(source.indexOf("<h1>"), source.indexOf("</h1>") + 5) };
  const result: any = { plan: { readiness: "PLAN_READY", validation: { valid: true }, constraints: [{ rule: "HERO_TITLE_TEXT_ONLY", textChange: change }] } };
  const base = { version: 1, planId: "engineering-plan", planVersion: 1, executionEnabled: false, sourceRunId: fresh.sourceRunId,
    sourceConversationId: fresh.sourceConversationId, understandingDigest: fresh.digest, understandingSequence: 1, evidenceReferences: fresh.references, workspace };
  const objective = "Accepted exact Hero change";
  const identity = { ...base, digest: toolDigest({ ...base, summary: objective, result }) };
  await h.db.agentRun.update({ where: { id: h.run.id }, data: { planVersion: 1 } });
  const plan = await h.db.agentPlan.create({ data: { id: base.planId, agentRunId: h.run.id, version: 1, status: "PLAN_READY", summary: objective, steps: [{ parameters: { engineeringPlan: identity, planning: result } }] } });
  await h.db.conversationMessage.create({ data: { id: "recommendation", conversationId: h.run.conversationId, senderType: "assistant", metadata: { recommendation: {
    ...workspace, objective, generation: 1, sourceRunId: fresh.sourceRunId, sourceSequence: 1 } } } });
  await h.db.conversationMessage.create({ data: { id: "accept", conversationId: h.run.conversationId, senderId: h.claims.sub, senderType: "user",
    metadata: { recommendationResponse: "ACCEPT", recommendationId: "recommendation", recommendationGeneration: 1 } } });
  const certified: any = { source: structuredClone(fresh), context: { evidence: [{ status: "COLLECTED", provenance: change.evidenceRef,
    relativePath: "index.html", metadata: { operation: "filesystem.read" }, runtimeReference: { verificationState: "VERIFIED", truncated: false }, content: { text: source, truncated: false } }] } };
  const deps = { ledger: h.ledger, inspections: { certifiedPlanningSourceTx: async () => fresh }, certified: async () => certified };
  const body = { planId: plan.id, planVersion: plan.version, planDigest: identity.digest };
  return { ...h, fresh, certified, deps, body, plan };
}
