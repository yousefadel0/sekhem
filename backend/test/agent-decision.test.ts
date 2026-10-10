import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "node:crypto";
import { AuthService } from "../src/auth/auth.service";
import { ProjectAccessService } from "../src/auth/project-access.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import { WorkspaceSourceResolver } from "../src/agent-runtime/capabilities/workspace-source.resolver";
import { ToolRegistryService } from "../src/agent-runtime/tools/tool-registry.service";
import { ToolScopeService } from "../src/agent-runtime/tools/tool-scope.service";
import { ToolRiskService } from "../src/agent-runtime/tools/tool-risk.service";
import { ToolPermissionService } from "../src/agent-runtime/tools/tool-permission.service";
import { ToolApprovalService } from "../src/agent-runtime/tools/tool-approval.service";
import { ToolAuthorizationService } from "../src/agent-runtime/tools/tool-authorization.service";
import { AgentToolControlService } from "../src/agent-runtime/tools/agent-tool-control.service";
import { AgentControlStoreService } from "../src/agent-runtime/tools/agent-control-store.service";
import { AgentDecisionService } from "../src/agent-runtime/tools/agent-decision.service";
import { CONTROL_ARTIFACT, controlRecordId, deriveAction, validateAction, presentControl } from "../src/agent-runtime/tools/agent-control.contract";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { interpretContext, validatePlanningProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { evidenceReceipt } from "../src/agent-runtime/understanding/agent-presentation";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { AgentRuntimeController } from "../src/agent-runtime/agent-runtime.controller";
import { ConversationService } from "../src/conversation/conversation.service";
import { ConflictException } from "@nestjs/common";

const secret = "phase0a-test-only-secret-never-production";
const claims: any = { sub: "user-1", sessionId: "session-1", email: "user@example.test", displayName: "User", role: "PM", organizationId: "org-1", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
function cookieFor(c = claims) {
  const unsigned = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify(c)).toString("base64url")].join(".");
  return `sekhem_session=${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
}
const cookie = cookieFor();
const copy = <T>(v: T): T => structuredClone(v);
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([k, v]: any) => v instanceof Date ? new Date(row[k]).getTime() === v.getTime() : v?.in ? v.in.includes(row[k]) : row[k] === v);
}
function fixture() {
  const understanding = new AgentUnderstandingService();
  const context = understanding.understand({ userId: claims.sub, projectId: "project-1", instruction: "Read package.json in this workspace", workspaceAvailable: true, availableCapabilities: ["workspace_reader"] });
  context.evidence = [{ sourceType: "workspace", sourceId: "project-1", relativePath: "package.json", provenance: "project-1:package.json", outcome: "READ", status: "COLLECTED", metadata: {}, warnings: [], content: { text: "bounded fixture source", extractorId: "text", detectedMime: "text/plain", truncated: false } }];
  const visible = new Map<string, string>(); new AgentContextSerializerService().forReasoning(context, visible);
  const interpreted = interpretContext(context, visible);
  const planning = validatePlanningProposal(interpreted, { constraintIds: interpreted.constraints.map(c => c.id), facts: [{ id: "fact-1", text: "bounded fixture source", evidenceRef: "project-1:package.json" }], inferences: [], hypotheses: [], unknowns: [], steps: [
    { id: "step-1", type: "INSPECT", purpose: "UNDERSTAND", evidenceRefs: ["project-1:package.json"], missingInformationIds: [], dependencies: [], scopeRefs: ["scope-1"], verificationCriterionIds: ["grounding"], effect: "READ_ONLY", dependencyStatus: "KNOWN" }
  ] } as any, visible);
  assert.equal(planning.plan.readiness, "PLAN_READY", JSON.stringify({ issues: planning.plan.validation.issues, unknowns: planning.plan.missingInformation }));
  let version = "binding-version-1", role: string | null = "PM", lookupError = false, missing = false;
  const user: any = { id: claims.sub, email: claims.email, displayName: "User", organizationId: "org-1", status: "active", roles: [{ role: { key: "PM" } }] };
  const session: any = { id: claims.sessionId, userId: claims.sub, revokedAt: null, expiresAt: new Date(Date.now() + 3600000) };
  const binding: any = { id: "workspace-1", projectId: "project-1", name: "Workspace", version, mode: "READ_ONLY", location: "BACKEND_HOST" };
  const plan: any = { id: "plan-1", agentRunId: "run-1", version: 1, status: "PLAN_READY", steps: [{ skillId: "", planningOnly: true, parameters: { planning, workspaceBinding: binding, evidenceReceipt: evidenceReceipt(context) } }] };
  const run: any = { id: "run-1", userId: claims.sub, projectId: "project-1", conversationId: "conversation-1", title: "Inspect", status: "COMPLETED", planVersion: 1, updatedAt: new Date(), createdAt: new Date(), project: { id: "project-1", organizationId: "org-1" }, plans: [plan] };
  const artifacts = new Map<string, any>(), approvals = new Map<string, any>(), events: any[] = [], audits: any[] = [];
  const db: any = {
    conversation: { findUnique: async () => ({ id: run.conversationId, userId: run.userId, projectId: run.projectId, metadata: { modeContext: { version: 1, mode: "AGENT", organizationId: "org-1", workspace: null } } }) },
    user: { findUnique: async () => copy(user) },
    userSession: { findUnique: async () => { if (lookupError) throw new Error("private lookup details"); return missing ? null : copy(session); } },
    project: { findUnique: async ({ where }: any) => where.id === run.projectId ? copy(run.project) : null },
    projectMember: { findUnique: async () => role ? { role } : null },
    agentRun: {
      findUnique: async ({ where }: any) => where.id === run.id ? { ...copy(run), artifacts: [...artifacts.values()].map(copy), approvals: [...approvals.values()].map(copy) } : null,
      findMany: async () => [],
      updateMany: async ({ where, data }: any) => { if (!matches(run, where)) return { count: 0 }; Object.assign(run, copy(data)); return { count: 1 }; },
      update: async ({ data }: any) => Object.assign(run, copy(data))
    },
    agentArtifact: {
      findUnique: async ({ where }: any) => copy(artifacts.get(where.id) ?? null),
      findMany: async () => [...artifacts.values()].map(copy),
      upsert: async ({ where, create, update }: any) => { const row = artifacts.get(where.id); artifacts.set(where.id, row ? { ...row, ...copy(update) } : copy(create)); return copy(artifacts.get(where.id)); }
    },
    agentApproval: {
      findUnique: async ({ where }: any) => copy(approvals.get(where.id) ?? null),
      upsert: async ({ where, create }: any) => { if (!approvals.has(where.id)) approvals.set(where.id, copy(create)); return copy(approvals.get(where.id)); },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const row of approvals.values()) if (matches(row, where)) { Object.assign(row, copy(data)); count++; } return { count }; }
    },
    agentRunEvent: {
      create: async ({ data }: any) => { if (data.id && events.some(e => e.id === data.id)) throw new Error("Unique constraint"); const row = { id: `event-${events.length}`, timestamp: new Date(), ...copy(data) }; events.push(row); return row; },
      findUnique: async ({ where }: any) => copy(events.find(e => e.id === where.id) ?? null),
      findFirst: async ({ where }: any) => copy(events.find(e => matches(e, where)) ?? null)
    }
  };
  let queue = Promise.resolve();
  db.$transaction = (work: any) => {
    const result = queue.then(async () => {
      const saved = copy({ run, artifacts: [...artifacts], approvals: [...approvals], events, audits });
      try { return copy(await work(db)); } catch (error) {
        Object.assign(run, saved.run); artifacts.clear(); approvals.clear(); saved.artifacts.forEach(([k, v]: any) => artifacts.set(k, v)); saved.approvals.forEach(([k, v]: any) => approvals.set(k, v)); events.splice(0, events.length, ...saved.events); audits.splice(0, audits.length, ...saved.audits); throw error;
      }
    }); queue = result.then(() => undefined, () => undefined); return result;
  };
  const auth = new AuthService(db); auth.setEnvForTest({ SEKHEM_AUTH_DB_MODE: "true", SEKHEM_AUTH_SESSION_SECRET: secret });
  const resources = new ResourceAuthorizationService(db), access = new ProjectAccessService(db, resources);
  const audit: any = { recordWithClaimsTx: async (_: any, _c: any, data: any) => audits.push(copy(data)), recordWithClaims: async () => {} };
  const registry = new ToolRegistryService(), paths = new WorkspacePathService();
  const scope = new ToolScopeService(new WorkspaceSourceResolver(), paths, new WorkspaceSecurityService(paths));
  const approvalService = new ToolApprovalService(resources, audit), store = new AgentControlStoreService(audit);
  const authorization = new ToolAuthorizationService(registry, scope, new ToolPermissionService(resources), new ToolRiskService(), approvalService, resources, audit, db);
  const control = new AgentToolControlService(db, resources, audit, authorization, approvalService, store);
  const bindings: any = { resolve: async (_c: any, p: string, expected: string) => {
    if (expected !== version || p !== run.projectId) throw new ConflictException("WORKSPACE_BINDING_CHANGED");
    return { binding: { ...copy(binding), version }, context: { trustedRoot: process.cwd(), authorizedRoots: process.cwd() } };
  } };
  const service = new AgentDecisionService(db, auth, access, resources, bindings, registry, control, approvalService, store);
  const runtime = new AgentRuntimeService({ getSkill: () => assert.fail("No dispatch"), getAvailableSkills: () => [] } as any, resources, audit, db,
    undefined, undefined, undefined, undefined, undefined, undefined, control, access, bindings, service, store);
  const staged = () => service.planReady(run.id);
  const decide = (body: any = {}) => service.decide(run.id, cookie, body);
  const approve = () => { const s = artifacts.get(controlRecordId(run.id)).metadata; return service.approve(run.id, s.approvalId, cookie, { decision: "APPROVED", fingerprint: s.approvalFingerprint }); };
  return { db, run, plan, planning, artifacts, approvals, events, audits, user, session, registry, scope, auth, service, runtime, control, store, staged, decide, approve,
    state: () => artifacts.get(controlRecordId(run.id))?.metadata, setVersion: (v: string) => { version = v; }, setRole: (v: string | null) => { role = v; }, lookupFailure: () => { lookupError = true; }, missingSession: () => { missing = true; } };
}

describe("Phase 0A grounded decision and exact action binding", () => {
  it("A/B: a real validated PLAN_READY enters DECIDING and creates one durable proposal without authorization", async () => {
    const f = fixture(), digest = toolDigest(f.plan.steps); await f.staged(); await f.staged();
    assert.equal(f.state().state, "ACTION_PROPOSED"); assert.equal(f.artifacts.size, 1);
    assert.equal(f.events.filter(e => e.eventType === "DECISION_STARTED").length, 1);
    assert.equal(f.events.some(e => e.eventType === "TOOL_AUTHORIZATION_CHECKED"), false);
    assert.equal(f.state().intent, undefined); assert.equal(toolDigest(f.plan.steps), digest);
    assert.deepEqual(validateAction(f.run, f.state().proposal, f.registry), f.state().proposal);
  });
  for (const [name, change] of Object.entries({
    "C wrong step": (p: any) => p.planStepId = "invented", "D wrong plan version": (p: any) => p.planVersion++,
    "E wrong tool version": (p: any) => p.toolVersion = "99.0.0", "F expanded scope": (p: any) => p.scope.paths.push("src"),
    "G changed risk": (p: any) => p.risk = "HIGH", "H malformed input": (p: any) => p.validatedInput = {},
    "X other project": (p: any) => p.projectId = "other-project", "Y other user": (p: any) => p.userId = "other-user",
    "Z permission injection": (p: any) => p.requiredPermissions.push("terminal.execute"), "Z runtime injection": (p: any) => p.runtimeId = "fake",
    "verification injection": (p: any) => p.verificationDigest = "verified", "unknown tool": (p: any) => p.toolId = "unknown.tool"
  })) it(`${name} is blocked`, async () => {
    const f = fixture(); await f.staged(); const proposal = copy(f.state().proposal); change(proposal);
    assert.throws(() => validateAction(f.run, proposal, f.registry));
  });
  it("does not downgrade a higher-risk plan, synthesize writes/commands, or fabricate verification", async () => {
    for (const mutate of [(s: any) => s.risk = "HIGH", (s: any) => s.effect = "WRITE", (s: any) => s.effect = "EXECUTE", (s: any) => s.verification.status = "VERIFIED"]) {
      const f = fixture(); mutate(f.planning.plan.steps[0]); await f.staged();
      assert.equal(f.state().state, "NEEDS_USER_INPUT"); assert.equal(f.state().proposal, undefined);
    }
  });
  it("rejects ungrounded, denied and ambiguous evidence and unsatisfied dependencies", async () => {
    for (const mutate of [(f: any) => f.planning.plan.steps[0].dependencies.push("step-2"),
      (f: any) => f.plan.steps[0].parameters.evidenceReceipt[0].read = false,
      (f: any) => f.planning.plan.steps[0].scopeRefs = ["project"],
      (f: any) => f.plan.steps[0].parameters.evidenceReceipt.push(copy(f.plan.steps[0].parameters.evidenceReceipt[0]))]) {
      const f = fixture(); mutate(f); await f.staged(); assert.equal(f.state().proposal, undefined);
    }
  });
});

describe("Phase 0A canonical authorization, approval and disabled intent", () => {
  it("I/J/U: exact human approval is revalidated and reaches only the durable execution boundary", async () => {
    const f = fixture(); await f.staged(); const digest = toolDigest(f.plan.steps);
    const pending: any = await f.decide({ requestApproval: true });
    assert.equal(pending.state, "AWAITING_APPROVAL"); assert.equal(f.run.status, "AWAITING_APPROVAL");
    const row = f.approvals.get(pending.approvalId);
    const binding = row.revisedPlan.actionBinding;
    for (const key of ["userId", "projectId", "organizationId", "conversationId", "workspaceBindingId", "workspaceBindingVersion", "proposalDigest", "inputDigest", "scopeDigest", "verificationDigest", "policyVersion"]) assert.ok(binding[key]);
    await f.approve(); const result = f.state();
    assert.equal(f.events.some(e => e.eventType === "APPROVED"), true);
    assert.equal(result.state, "EXECUTION_BLOCKED"); assert.equal(result.code, "EXECUTION_BOUNDARY_NOT_IMPLEMENTED");
    assert.equal(result.intent.runtimeId, null); assert.equal(result.intent.dispatchable, false); assert.equal(result.intent.executionAllowed, false);
    assert.equal(f.run.status, "PAUSED"); assert.equal(toolDigest(f.plan.steps), digest);
    assert.ok(Date.parse(result.intent.expiresAt) <= Date.now() + 300000);
  });
  it("no-approval read still uses the complete canonical gate and creates no approval", async () => {
    const f = fixture(); await f.decide(); assert.ok(f.state().intent); assert.equal(f.approvals.size, 0);
    assert.ok(f.events.some(e => e.eventType === "TOOL_AUTHORIZATION_CHECKED"));
    assert.equal(f.state().intent.approvalReference, null);
  });
  for (const [label, change] of Object.entries({
    "K input": (f: any) => f.state().request.input.path = "README.md",
    "L scope": (f: any) => f.state().proposal.scope.paths = ["src"],
    "plan": (f: any) => f.plan.version++,
    "step": (f: any) => f.planning.plan.steps[0].id = "changed",
    "verification": (f: any) => f.planning.plan.steps[0].verification.criterionIds = [],
    "fingerprint": (f: any) => [...f.approvals.values()][0].revisedPlan.fingerprint = "0".repeat(64)
  })) it(`${label} changed after approval cannot create an intent`, async () => {
    const f = fixture(); await f.decide({ requestApproval: true });
    const row = [...f.approvals.values()][0]; row.status = row.decision = "APPROVED"; row.decidedBy = claims.sub; row.decidedAt = new Date();
    change(f); await f.decide(); assert.equal(f.state().intent, undefined); assert.equal(f.state().state, "EXECUTION_BLOCKED");
  });
  it("M changed workspace cannot grant approval or create an intent", async () => {
    const f = fixture(); await f.decide({ requestApproval: true }); f.setVersion("changed");
    await f.approve(); assert.equal(f.state().intent, undefined); assert.equal(f.state().code, "WORKSPACE_BINDING_CHANGED"); assert.equal([...f.approvals.values()][0].status, "PENDING");
  });
  it("N expired approval remains invalid", async () => {
    const f = fixture(); await f.decide({ requestApproval: true }); [...f.approvals.values()][0].dueAt = new Date(0);
    await f.approve(); assert.equal(f.state().intent, undefined); assert.equal(f.state().code, "APPROVAL_EXPIRED");
  });
  for (const kind of ["revoked", "expired", "suspended", "missing", "lookup-error"]) it(`O: real durable validator denies ${kind} despite a valid signature`, async () => {
    const f = fixture(); await f.decide({ requestApproval: true }); assert.equal(f.auth.sessionClaims(cookie).sub, claims.sub);
    if (kind === "revoked") f.session.revokedAt = new Date(); if (kind === "expired") f.session.expiresAt = new Date(0);
    if (kind === "suspended") f.user.status = "suspended"; if (kind === "missing") f.missingSession(); if (kind === "lookup-error") f.lookupFailure();
    await assert.rejects(f.approve(), (error: any) => error.getStatus() === 401); assert.equal(f.state().intent, undefined);
  });
  it("rechecks the durable session after approval before creating an intent", async () => {
    const f = fixture(); await f.decide({ requestApproval: true });
    const original = f.auth.validateDurableSession.bind(f.auth); let calls = 0;
    f.auth.validateDurableSession = async c => { if (++calls === 2) f.session.revokedAt = new Date(); return original(c); };
    await assert.rejects(f.approve()); assert.equal(f.state().intent, undefined); assert.equal([...f.approvals.values()][0].status, "PENDING");
  });
  for (const status of ["CANCELLED", "PAUSED", "FAILED", "BLOCKED"]) it(`P/Q: ${status} cannot create an intent`, async () => {
    const f = fixture(); await f.staged(); f.run.status = status; await f.decide(); assert.equal(f.state().intent, undefined);
  });
  it("R duplicate and concurrent intent requests reconcile a single durable identity", async () => {
    const f = fixture(); await Promise.all([f.decide(), f.decide(), f.decide()]);
    const id = f.state().intent.intentId; await f.decide(); assert.equal(f.state().intent.intentId, id);
    assert.equal(f.events.filter(e => e.eventType === "EXECUTION_INTENT_CREATED").length, 1);
  });
  it("checks the persisted plan again if it changes during canonical authorization", async () => {
    const f = fixture(), authorize = f.control.authorizeActionTx.bind(f.control);
    f.control.authorizeActionTx = async (...args) => { const result = await authorize(...args); f.plan.steps[0].parameters.contextWarnings = ["changed"]; return result; };
    await f.decide(); assert.equal(f.state().intent, undefined); assert.equal(f.state().state, "EXECUTION_BLOCKED");
  });
  it("an ungranted model operation cannot masquerade as a low-risk file read", async () => {
    const f = fixture(); f.planning.plan.steps[0].effect = "WRITE"; f.planning.plan.steps[0].risk = "LOW";
    await f.decide(); assert.equal(f.state().proposal, undefined); assert.equal(f.approvals.size, 0);
  });
  it("changing current membership after exact approval prevents handoff", async () => {
    const f = fixture(); await f.decide({ requestApproval: true });
    await f.control.decideApproval(f.run.id, f.state().approvalId, claims, { decision: "APPROVED", fingerprint: f.state().approvalFingerprint });
    f.setRole(null); await assert.rejects(f.decide()); assert.equal(f.state().intent, undefined);
  });
  it("recovery also suspends a staged decision with no prior tool authorization", async () => {
    const f = fixture(); await f.staged(); f.run.status = "RUNNING";
    assert.equal(await f.control.suspendRecoveredBoundary(f.run.id, claims), true);
    assert.equal(f.run.status, "PAUSED"); assert.equal(f.state().intent, undefined);
  });
  it("pause/cancellation serialize with an intent request and never leave a usable intent", async () => {
    for (const action of ["pause", "cancel"]) {
      const f = fixture(); await f.staged();
      await Promise.all([f.decide(), action === "pause" ? f.runtime.pauseRun(f.run.id, claims, {}) : f.runtime.cancelRun(f.run.id, claims, {})]);
      if (f.state().intent) {
        assert.equal(f.state().intent.status, action === "pause" ? "INVALIDATED" : "CANCELLED");
        assert.equal(f.state().intent.dispatchable, false);
      } else assert.equal(f.events.filter(e => e.eventType === "EXECUTION_INTENT_CREATED").length, 0);
      assert.equal(f.run.status, action === "pause" ? "PAUSED" : "CANCELLED");
    }
  });
  it("S expired intent is persisted as expired and never renewed", async () => {
    const f = fixture(); await f.decide(); const id = f.state().intent.intentId;
    f.state().intent.expiresAt = new Date(0).toISOString(); await f.decide();
    assert.equal(f.state().intent.status, "EXPIRED"); assert.equal(f.state().intent.intentId, id); assert.equal(f.state().code, "INTENT_EXPIRED");
  });
  it("a staged decision cannot interrupt planning's final message/status commit", async () => {
    const f = fixture(); f.run.status = "RUNNING"; await f.staged();
    await assert.rejects(f.decide(), /PLANNING_COMPLETION_REQUIRED/);
    assert.equal(f.run.status, "RUNNING"); assert.equal(f.state().intent, undefined);
  });
  it("T restart invalidates a boundary receipt and never dispatches or revives it", async () => {
    const f = fixture(); await f.decide(); const id = f.state().intent.intentId;
    await f.runtime.onApplicationBootstrap(); await f.decide();
    assert.equal(f.state().intent.status, "INVALIDATED"); assert.equal(f.state().intent.intentId, id);
    assert.equal(f.events.filter(e => e.eventType === "EXECUTION_INTENT_CREATED").length, 1);
  });
  it("cancellation after intent is durable; late approval and resume cannot revive it", async () => {
    const f = fixture(); await f.decide({ requestApproval: true }); await f.approve();
    await f.runtime.cancelRun(f.run.id, claims, {}); await f.decide();
    assert.equal(f.state().intent.status, "CANCELLED"); assert.equal(f.run.status, "CANCELLED");
    await assert.rejects(f.runtime.resumeRun(f.run.id, claims));
  });
  it("pause and cancellation also work while approval is pending", async () => {
    for (const operation of ["pause", "cancel"]) {
      const f = fixture(); await f.decide({ requestApproval: true });
      if (operation === "pause") await f.runtime.pauseRun(f.run.id, claims, {}); else await f.runtime.cancelRun(f.run.id, claims, {});
      await f.approve(); assert.equal(f.state().intent, undefined);
    }
  });
  it("V/W no execution or verification success events and no raw evidence, tokens or root in audit", async () => {
    const f = fixture(); await f.decide({ requestApproval: true }); await f.approve();
    assert.ok(f.events.every(e => !["EXECUTION_STARTED", "EXECUTION_COMPLETED", "VERIFICATION_COMPLETED"].includes(e.eventType)));
    assert.doesNotMatch(JSON.stringify({ events: f.events, audits: f.audits }), /bounded fixture source|sekhem_session=|phase0a-test-only-secret/);
    assert.equal(JSON.stringify(f.state()).includes(process.cwd()), false);
    assert.ok(f.planning.plan.steps.every(s => s.status === "PLANNED" && s.verification.status === "PLANNED"));
  });
  it("X/Y project/org membership and owner are checked afresh", async () => {
    const f = fixture(); await f.staged(); f.setRole(null); await assert.rejects(f.decide());
    f.setRole("PM"); f.user.organizationId = "other-org"; await assert.rejects(f.decide());
    f.user.organizationId = "org-1"; await assert.rejects(f.service.decide(f.run.id, cookieFor({ ...claims, sub: "other-user" }), {}));
    assert.equal(f.state().intent, undefined);
  });
  it("Z privileged and arbitrary command fields never reach authorization", async () => {
    const f = fixture(); for (const body of [{ runtimeId: "fake" }, { toolRequest: {} }, { command: "npm run build" }, { role: "Admin" }, { requestApproval: false }]) await assert.rejects(f.decide(body));
    assert.equal(f.artifacts.size, 0);
  });
  it("unknown durable state fails closed and persistence errors roll back approval and intent", async () => {
    const f = fixture(); await f.staged(); f.state().state = "EXECUTING"; await assert.rejects(f.decide());
    assert.equal(presentControl([...f.artifacts.values()], f.run)?.code, "INVALID_CONTROL_STATE");
    const g = fixture(); await g.decide({ requestApproval: true }); g.db.agentRunEvent.create = async () => { throw new Error("durability failed"); };
    await assert.rejects(g.approve()); assert.equal(g.state().intent, undefined); assert.equal([...g.approvals.values()][0].status, "PENDING");
  });
  it("GET restores internal control state separately from evidence artifacts and remains read-only", async () => {
    const f = fixture(); await f.decide(); const count = f.events.length;
    const detail = await f.runtime.getRun(f.run.id, claims); assert.equal(detail.control?.intent?.intentId, f.state().intent.intentId);
    f.db.conversation = { findUnique: async () => ({ id: f.run.conversationId, userId: claims.sub, projectId: f.run.projectId, project: f.run.project, metadata: {}, messages: [], agentRuns: [{ ...f.run, artifacts: [...f.artifacts.values()], events: f.events, approvals: [] }] }) };
    const conv = new ConversationService(f.db); const restored = await conv.getConversation(f.run.conversationId, claims.sub, claims);
    assert.equal(restored.agentRuns[0].control?.intent?.intentId, f.state().intent.intentId); assert.equal(restored.agentRuns[0].artifacts.length, 0);
    assert.equal(f.events.length, count); assert.equal([...f.artifacts.values()][0].isCustomerSafe, false);
  });
  it("controller uses the real durable decision/approval chain, never signature-only identity", async () => {
    const f = fixture(), controller = new AgentRuntimeController(f.runtime, f.auth);
    await controller.decideAction(f.run.id, cookie, { requestApproval: true });
    await controller.decideToolApproval(f.run.id, f.state().approvalId, cookie, { decision: "APPROVED", fingerprint: f.state().approvalFingerprint });
    assert.ok(f.state().intent); f.session.revokedAt = new Date(); await assert.rejects(controller.decideAction(f.run.id, cookie, {}));
  });
});
