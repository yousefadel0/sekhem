import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { evidenceReceipt, presentPlan } from "../src/agent-runtime/understanding/agent-presentation";
import { ConversationService } from "../src/conversation/conversation.service";

test("workspace Agent request without a Runtime binding cannot fall back to backend discovery", async () => {
  const h = await inspectionHarness();
  const service: any = Object.create(AgentRuntimeService.prototype);
  Object.assign(service, { inspections: { bindingTx: async () => null }, resourceAuthz: new ResourceAuthorizationService(h.db),
    workspaceBindings: { resolve: () => assert.fail("backend workspace fallback") } });
  await assert.rejects(service.createRunTx(h.db, h.claims, { projectId: "project-a", conversationId: "conversation-a", instruction: "Analyze the project" }), /WORKSPACE_BINDING_REQUIRED/);
});

test("listing admission is SCANNED, never a full file read or a claimed completed objective", async () => {
  const h = await inspectionHarness(); h.responses.push(h.inspect()); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution); await h.service.advance(h.run.id);
  const s = await h.state();
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId,
    sessionClaims: h.claims, projectId: s.projectId, conversationId: s.conversationId, instruction: s.objective, availableCapabilities: ["workspace_reader"], runtimeEvidence: s.references });
  assert.equal(context.evidence[0].outcome, "SCANNED"); assert.equal(evidenceReceipt(context)[0].read, false);
  assert.equal(evidenceReceipt(context)[0].selected, true); assert.deepEqual(context.truncation.droppedEvidenceIds, []);
  assert.equal((await h.service.view(h.run.id, h.claims))!.objectiveGrounded, false);
  assert.equal(presentPlan([{ parameters: { inspectionLoop: true } }]).executionAuthority, "RUNTIME_LEDGER");
});

test("retransmitted Chat client message converges on one inspection run and rejects changed content", async () => {
  const h = await inspectionHarness(), authority = new ResourceAuthorizationService(h.db), scheduled: string[] = [];
  const agent: any = Object.create(AgentRuntimeService.prototype);
  Object.assign(agent, { prisma: h.db, inspections: h.service, resourceAuthz: authority, auditService: { recordWithClaimsTx: async () => {} },
    scheduleRunExecution: (id: string) => { scheduled.push(id); } });
  const conversation = new ConversationService(h.db, agent, authority);
  h.tables.agentRun.get(h.run.id).status = "CANCELLED"; // No active inspection: this is a new request.
  const body = { content: "Inspect authentication in this workspace", triggerAgent: true, metadata: { clientMessageId: "client-phase63" } };
  const before = h.tables.agentRun.size;
  const [a, b] = await Promise.all([conversation.postMessage("conversation-a", h.claims, body), conversation.postMessage("conversation-a", h.claims, body)]);
  assert.equal((a as any).agentRunId, (b as any).agentRunId); assert.equal(h.tables.agentRun.size, before + 1); assert.equal(scheduled.length, 1);
  const run = h.tables.agentRun.get((a as any).agentRunId);
  const plan = [...h.tables.agentPlan.values()].find(p => p.agentRunId === run.id);
  assert.equal(presentPlan(plan.steps).originatingMessageId, (a as any).messageId);
  await assert.rejects(conversation.postMessage("conversation-a", h.claims, { ...body, content: "Read a different file" }), /CONFLICT/);
});
