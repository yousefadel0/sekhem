import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import path from "node:path";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import { WorkspaceSourceResolver } from "../src/agent-runtime/capabilities/workspace-source.resolver";
import { ToolRegistryService } from "../src/agent-runtime/tools/tool-registry.service";
import { ToolPermissionService } from "../src/agent-runtime/tools/tool-permission.service";
import { ToolScopeService } from "../src/agent-runtime/tools/tool-scope.service";
import { ToolRiskService } from "../src/agent-runtime/tools/tool-risk.service";
import { ToolApprovalService } from "../src/agent-runtime/tools/tool-approval.service";
import { ToolAuthorizationService } from "../src/agent-runtime/tools/tool-authorization.service";
import { AgentToolControlService } from "../src/agent-runtime/tools/agent-tool-control.service";
import { AgentRuntimeService } from "../src/agent-runtime/agent-runtime.service";
import { AgentRuntimeController } from "../src/agent-runtime/agent-runtime.controller";
import { TOOL_PERMISSIONS, toolSubject, type ToolRequest, type TrustedToolWorkspace } from "../src/agent-runtime/tools/tool-contract";
import type { SessionClaims } from "../src/auth/auth.dto";
import { AgentUnderstandingService } from "../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextSerializerService } from "../src/agent-runtime/understanding/agent-context-serializer.service";
import { interpretContext, validatePlanningProposal } from "../src/agent-runtime/understanding/agent-planning.contract";
import { Test } from "@nestjs/testing";
import { AgentRuntimeModule } from "../src/agent-runtime/agent-runtime.module";
import { PrismaService } from "../src/data-access/prisma.service";
import { AgentDecisionService } from "../src/agent-runtime/tools/agent-decision.service";
import { AgentControlStoreService } from "../src/agent-runtime/tools/agent-control-store.service";
import { ProjectAccessService } from "../src/auth/project-access.service";

let temporary = "", root = "";
const originalRoots = process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
before(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), "sekhem-phase5b-"));
  root = path.join(temporary, "workspace");
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(temporary, "outside"));
  await writeFile(path.join(root, "src", "safe.txt"), "unchanged fixture");
  await symlink(path.join(temporary, "outside"), path.join(root, "escape"), "junction");
  await symlink(path.join(root, "src"), path.join(root, "alias"), "junction");
  process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = temporary;
});

after(async () => {
  if (originalRoots === undefined) delete process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS;
  else process.env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS = originalRoots;
  assert.equal(path.dirname(temporary), path.resolve(tmpdir()));
  assert.ok(path.basename(temporary).startsWith("sekhem-phase5b-"));
  await rm(temporary, { recursive: true, force: true });
});
const claims: SessionClaims = { sub: "user-1", sessionId: "session-1", email: "user@example.test", displayName: "User", role: "PM", organizationId: "org-1", exp: 9999999999 };
function fixture() {
  let role: string | null = "PM";
  const events: any[] = [], audits: any[] = [], approvals = new Map<string, any>();
  const planned = {
    version: 1, understanding: { readiness: "UNDERSTANDING_READY" },
    plan: { readiness: "PLAN_READY", authorization: "NOT_GRANTED", validation: { valid: true, issues: [] },
      constraints: [{ id: "runtime-planning-only", rule: "PLANNING_ONLY" }],
      steps: [{ id: "step-1", type: "IMPLEMENT", status: "PLANNED", effect: "WRITE", dependencies: [] as string[], verificationRequired: false }] }
  };
  const plan: any = { id: "plan-1", agentRunId: "run-1", version: 1, status: "PLAN_READY", steps: [{ index: 0, skillId: "", planningOnly: true, parameters: { planning: planned } }] };
  const run: any = { id: "run-1", projectId: "project-1", userId: claims.sub, conversationId: "conversation-1", status: "COMPLETED", planVersion: 1,
    updatedAt: new Date(0), project: { id: "project-1", organizationId: "org-1" }, plans: [plan] };
  function matches(row: any, where: any): boolean {
    return Object.entries(where).every(([key, expected]: [string, any]) => expected instanceof Date ? new Date(row[key]).getTime() === expected.getTime()
      : expected && typeof expected === "object" && Array.isArray(expected.in) ? expected.in.includes(row[key]) : row[key] === expected);
  }
  const db: any = {
    project: { findUnique: async ({ where }: any) => where.id === run.projectId
      ? { ...run.project, personalOwnerId: null } : null },
    conversation: { findUnique: async () => ({ id: run.conversationId, userId: run.userId, projectId: run.projectId, metadata: { modeContext: { version: 1, mode: "AGENT", organizationId: "org-1", workspace: null } } }) },
    projectMember: { findUnique: async () => role ? { role } : null },
    agentRun: {
      findUnique: async ({ where }: any) => where.id === run.id ? structuredClone(run) : null,
      updateMany: async ({ where, data }: any) => { if (!matches(run, where)) return { count: 0 }; Object.assign(run, data); return { count: 1 }; },
      update: async ({ data }: any) => Object.assign(run, data),
      findMany: async ({ where }: any) => where.status.in.includes(run.status) ? [structuredClone(run)] : []
    },
    agentApproval: {
      findUnique: async ({ where }: any) => structuredClone(approvals.get(where.id) ?? null),
      upsert: async ({ where, create }: any) => { if (!approvals.has(where.id)) approvals.set(where.id, structuredClone(create)); return structuredClone(approvals.get(where.id)); },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const row of approvals.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
      count: async ({ where }: any) => [...approvals.values()].filter(a => matches(a, where)).length
    },
    agentRunEvent: {
      create: async ({ data }: any) => { events.push(structuredClone(data)); return data; },
      findFirst: async ({ where }: any) => events.find(e => matches(e, where)) ?? null
    }
  };
  db.$transaction = async (work: any) => {
    const snapshot = structuredClone({ run, approvals: [...approvals], events, audits });
    try { return await work(db); } catch (error) {
      Object.assign(run, snapshot.run); approvals.clear(); snapshot.approvals.forEach(([k, v]: any) => approvals.set(k, v));
      events.splice(0, events.length, ...snapshot.events); audits.splice(0, audits.length, ...snapshot.audits); throw error;
    }
  };
  const audit: any = { recordWithClaimsTx: async (_: any, actor: any, record: any) => audits.push({ actor, ...record }) };
  const resources = new ResourceAuthorizationService(db);
  const registry = new ToolRegistryService(), paths = new WorkspacePathService();
  const scopes = new ToolScopeService(new WorkspaceSourceResolver(), paths, new WorkspaceSecurityService(paths));
  const permissions = new ToolPermissionService(resources), risk = new ToolRiskService();
  const approvalService = new ToolApprovalService(resources, audit);
  const authorization = new ToolAuthorizationService(registry, scopes, permissions, risk, approvalService, resources, audit, db);
  const control = new AgentToolControlService(db, resources, audit, authorization, approvalService);
  let executions = 0;
  const skill: any = { getSkill: () => { executions++; throw new Error("must not dispatch"); }, getAvailableSkills: () => [] };
  const runtime = new AgentRuntimeService(skill, resources, audit, db, undefined, undefined, undefined, undefined, undefined, undefined, control);
  const workspace: TrustedToolWorkspace = { workspaceId: "workspace-1", projectId: "project-1", trustedRoot: root, allowedPaths: ["."], permissions: [...TOOL_PERMISSIONS] };
  function request(toolId = "filesystem.read", input: Record<string, unknown> = { path: "src/safe.txt" }): ToolRequest {
    const tool = registry.get(toolId);
    const paths = tool?.pathFields.flatMap(k => Array.isArray(input[k]) ? input[k] as string[] : [input[k] as string]) ?? ["src/safe.txt"];
    return { id: "request-1", toolId, toolVersion: "1.0.0", input, purpose: "Inspect the planned target", scope: { workspaceId: "workspace-1", paths },
      requestedBy: "AGENT", runId: "run-1", planId: plan.id, planVersion: plan.version, planStepId: "step-1", risk: "LOW", requiresApproval: false };
  }
  const authorize = (proposal: unknown = request(), binding: TrustedToolWorkspace | undefined = workspace, approvalId?: string) => authorization.authorize(run.id, proposal, claims, binding, { approvalId });
  const grant = async (id: string) => control.decideApproval(run.id, id, claims, { decision: "APPROVED", fingerprint: approvals.get(id).revisedPlan.fingerprint });
  return { db, run, plan, planned, events, audits, approvals, registry, scopes, permissions, risk, control, runtime, workspace, request, authorize, grant,
    resources, authorization, approvalService, audit, executions: () => executions, setRole: (value: string | null) => { role = value; } };
}

describe("Phase 5B tool contracts and permissions", () => {
  it("authorization reuses its held transaction when the external pool is exhausted", async () => {
    const f = fixture();
    let externalQueries = 0, projectChecks = 0, membershipChecks = 0;
    const unavailable = async () => { externalQueries++; throw Object.assign(new Error("pool exhausted"), { code: "P2024" }); };
    (f.resources as any).prisma = {
      project: { findUnique: unavailable }, projectMember: { findUnique: unavailable }, groupMember: { findUnique: unavailable }
    };
    const projectRead = f.db.project.findUnique, memberRead = f.db.projectMember.findUnique;
    f.db.project.findUnique = async (args: any) => { projectChecks++; return projectRead(args); };
    f.db.projectMember.findUnique = async (args: any) => { membershipChecks++; return memberRead(args); };
    const decision = await f.authorization.authorize(f.run.id, f.request(), claims, f.workspace, {}, f.db);
    assert.equal(decision.status, "AUTHORIZED");
    assert.equal(f.executions(), 0, "authorization does not execute a tool");
    assert.equal(externalQueries, 0);
    assert.ok(projectChecks >= 2, "run and tool permission both revalidate the project");
    assert.ok(membershipChecks >= 2, "run and tool permission both revalidate membership");
  });

  it("transaction-backed authorization preserves tenant, ownership, membership and approval denials", async () => {
    const f = fixture(), subject = toolSubject(claims);
    const resource: any = { resourceType: "Project", id: f.run.projectId, projectId: f.run.projectId, organizationId: "org-1" };
    assert.equal(await f.resources.authorize(subject, "READ", resource, f.db), true);
    assert.equal(await f.resources.authorize(subject, "READ", { ...resource, organizationId: "other" }, f.db), false);
    const read = f.db.project.findUnique;
    f.db.project.findUnique = async () => ({ organizationId: "org-1", personalOwnerId: "another-user" });
    assert.equal(await f.resources.authorize(subject, "READ", resource, f.db), false);
    f.db.project.findUnique = read;
    f.setRole(null);
    assert.equal(await f.resources.authorize(subject, "READ", resource, f.db), false);
    f.setRole("Software");
    assert.equal(await f.resources.authorize(subject, "EXECUTE", { ...resource, requiresApproval: true }, f.db), false);
    assert.equal(await f.resources.authorize(subject, "ADMIN", resource, f.db), false);
    f.db.groupMember = { findUnique: async () => { throw new Error("transaction failure"); } };
    assert.equal(await f.resources.authorize(subject, "READ", { ...resource, groupId: "group-1" }, f.db), false);
    f.db.projectMember.findUnique = async () => { throw new Error("transaction failure"); };
    assert.equal(await f.resources.authorize(subject, "READ", resource, f.db), false);
  });

  it("non-transaction callers still resolve current permissions through the configured client", async () => {
    const f = fixture();
    assert.equal(await f.resources.authorize(toolSubject(claims), "READ", {
      resourceType: "Project", id: f.run.projectId, projectId: f.run.projectId, organizationId: "org-1"
    }), true);
    f.setRole(null);
    assert.equal(await f.resources.authorize(toolSubject(claims), "READ", {
      resourceType: "Project", id: f.run.projectId, projectId: f.run.projectId, organizationId: "org-1"
    }), false);
  });
  it("checkpoint engineering plans cannot authorize tools, even with a broader existing grant", async () => {
    const f = fixture(); f.plan.steps[0].parameters.engineeringPlan = { executionEnabled: false };
    assert.equal((await f.authorize()).code, "POLICY_BLOCKED");
    assert.equal((await f.authorize(f.request("filesystem.write", { path: "src/safe.txt", content: "not executed" }))).code, "POLICY_BLOCKED");
    assert.equal(f.approvals.size, 0);
  });
  it("registers all 16 immutable definitions, resolves versions and lists deterministically", () => {
    const f = fixture(); assert.equal(f.registry.list().length, 16);
    assert.deepEqual(f.registry.list().map(t => t.id), [...f.registry.list().map(t => t.id)].sort());
    assert.equal(f.registry.has("filesystem.read"), true);
    assert.equal(f.registry.resolve("filesystem.read", "1.0.0").executionMode, "DEFINITION_ONLY");
    assert.throws(() => { (f.registry.resolve("filesystem.read").requiredPermissions as string[]).push("filesystem.write"); });
  });
  it("supports registration but rejects duplicates, unknown tools and version mismatches", () => {
    const f = fixture(), tool = { ...f.registry.resolve("filesystem.read"), id: "filesystem.custom-read" };
    f.registry.register(tool); assert.equal(f.registry.get(tool.id)?.id, tool.id);
    assert.throws(() => f.registry.register(tool), /DUPLICATE_TOOL/);
    assert.throws(() => f.registry.resolve("unknown"), /INVALID_TOOL/);
    assert.equal(f.registry.resolve("filesystem.read", "2.0.0").approvalRequirement, "REQUIRED");
    assert.throws(() => f.registry.resolve("filesystem.read", "9.0.0"), /INVALID_TOOL/);
    assert.throws(() => f.registry.register({ ...tool, id: "bad", execute: () => {} } as any), /INVALID_TOOL_DEFINITION/);
  });
  it("grants a permission only with both a workspace grant and existing project authorization", async () => {
    const f = fixture(); assert.equal((await f.authorize()).status, "AUTHORIZED");
    f.workspace.permissions = []; assert.equal((await f.authorize()).code, "PERMISSION_DENIED");
    f.workspace.permissions = [...TOOL_PERMISSIONS]; f.setRole(null); assert.equal((await f.authorize()).code, "PERMISSION_DENIED");
  });
  it("evaluates every required permission, including source/delete permissions for move", async () => {
    const f = fixture(); f.workspace.permissions = ["filesystem.read", "filesystem.write"];
    const d = await f.authorize(f.request("filesystem.move", { source: "src/safe.txt", destination: "src/new.txt" }));
    assert.equal(d.code, "PERMISSION_DENIED"); assert.equal(d.permissions?.length, 3);
    assert.equal(d.permissions?.find(p => p.permission === "filesystem.delete")?.reason, "WORKSPACE_GRANT_MISSING");
    assert.equal(f.approvals.size, 0);
  });
  it("preserves tenant boundaries even for a system admin and rejects a different run owner", async () => {
    const f = fixture(); f.run.project.organizationId = "other-org";
    const d = await (f as any).control.applyDecision(f.run.id, { ...claims, role: "Admin" }, { type: "EXECUTE_TOOL", toolRequest: f.request() }, f.workspace).catch((e: Error) => e);
    assert.ok(d instanceof Error); f.run.project.organizationId = "org-1"; f.run.userId = "someone-else";
    assert.equal((await f.authorize()).code, "PERMISSION_DENIED");
  });
  for (const [tool, expected] of [["filesystem.read", "LOW"], ["filesystem.write", "MEDIUM"], ["filesystem.delete", "HIGH"], ["terminal.execute", "HIGH"], ["git.push", "HIGH"], ["git.branch", "LOW"]]) {
    it(`classifies ${tool} as ${expected} on the server`, () => { const f = fixture(); assert.equal(f.risk.classify(f.registry.resolve(tool)), expected); });
  }
});

describe("Phase 5B workspace scope", () => {
  it("accepts existing and prospective paths within the explicit allowed subtree", async () => {
    const f = fixture(); f.workspace.allowedPaths = ["src"];
    assert.equal((await f.authorize()).status, "AUTHORIZED");
    assert.equal((await f.authorize(f.request("filesystem.write", { path: "src/new/child.txt", content: "proposed" }))).status, "APPROVAL_REQUIRED");
  });
  for (const candidate of ["../outside/file", "src/../../outside", "C:\\Windows\\System32", "/etc/passwd", "escape/new/file.txt", "escape", ".env", "src/file.txt:stream", "src/con.txt", "src/file. ", "node_modules/pkg"]) {
    it(`blocks unsafe path ${candidate}`, async () => { const f = fixture(); assert.equal((await f.authorize(f.request("filesystem.read", { path: candidate }))).code, "SCOPE_VIOLATION"); });
  }
  it("does not silently expand missing scope or trust a different workspace/project", async () => {
    const f = fixture();
    assert.equal((await f.authorize(f.request(), { ...f.workspace, trustedRoot: "" })).code, "INSUFFICIENT_SCOPE");
    assert.equal((await f.authorize(f.request(), { ...f.workspace, allowedPaths: [] })).code, "INSUFFICIENT_SCOPE");
    assert.equal((await f.authorize(f.request(), { ...f.workspace, workspaceId: "workspace-2" })).code, "SCOPE_VIOLATION");
    assert.equal((await f.authorize(f.request(), { ...f.workspace, projectId: "project-2" })).code, "SCOPE_VIOLATION");
  });
  it("enforces both source and destination and exact declared path coverage", async () => {
    const f = fixture(); f.workspace.allowedPaths = ["src"];
    assert.equal((await f.authorize(f.request("filesystem.copy", { source: "src/safe.txt", destination: "other/file.txt" }))).code, "SCOPE_VIOLATION");
    const request = f.request(); request.scope.paths = ["."]; assert.equal((await f.authorize(request)).code, "SCOPE_VIOLATION");
    assert.equal((await f.authorize(f.request("filesystem.read", { path: "alias/safe.txt" }))).code, "SCOPE_VIOLATION");
  });
  it("retains configured allowed-root checks and requires full workspace scope for git/terminal", async () => {
    const f = fixture();
    assert.equal((await f.authorize(f.request(), { ...f.workspace, trustedRoot: tmpdir() })).code, "SCOPE_VIOLATION");
    f.workspace.allowedPaths = ["src"];
    assert.equal((await f.authorize(f.request("git.status", { cwd: "src" }))).code, "SCOPE_VIOLATION");
    f.planned.plan.steps[0].effect = "EXECUTE";
    assert.equal((await f.authorize(f.request("terminal.execute", { cwd: "src", command: "not executed" }))).code, "SCOPE_VIOLATION");
  });
});

describe("Phase 5B authorization and approval lifecycle", () => {
  it("rejects unknown tools, invalid input, actor spoofing and extra privileged fields", async () => {
    const f = fixture(); assert.equal((await f.authorize({ ...f.request(), toolId: "unknown.tool" })).code, "INVALID_TOOL");
    for (const request of [{ ...f.request(), input: {} }, { ...f.request(), requestedBy: "ADMIN" }, { ...f.request(), role: "Admin" },
      { ...f.request(), input: { path: "src/safe.txt", execute: true } }, { ...f.request(), scope: { ...f.request().scope, trustedRoot: root } }]) {
      assert.equal((await f.authorize(request)).code, "INVALID_INPUT");
    }
    assert.equal(f.approvals.size, 0);
  });
  it("bounds malformed, huge, cyclic and deeply nested proposals", async () => {
    const f = fixture(), cyclic: any = {}; cyclic.self = cyclic;
    let deep: unknown = "leaf"; for (let i = 0; i < 20; i++) deep = { child: deep };
    for (const v of [null, [], "raw text", cyclic, deep, Array(129).fill("entry"), { ...f.request(), purpose: "x".repeat(33000) }, { ...f.request(), input: JSON.parse('{"__proto__":{}}') }]) assert.equal((await f.authorize(v)).code, "INVALID_INPUT");
  });
  it("requires a valid current Phase 4 run/plan/step relationship", async () => {
    const f = fixture(); assert.equal((await f.authorize({ ...f.request(), runId: "other-run" })).code, "INVALID_INPUT");
    assert.equal((await f.authorize({ ...f.request(), planStepId: "invented" })).code, "INVALID_PLAN_STEP");
    f.plan.version++; assert.equal((await f.authorize()).code, "INVALID_PLAN_STEP");
    f.plan.version--; f.planned.plan.readiness = "PLAN_NOT_READY"; assert.equal((await f.authorize()).code, "INVALID_PLAN_STEP");
  });
  it("does not turn a descriptive read plan or constraint into write permission", async () => {
    const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" });
    f.planned.plan.steps[0].effect = "READ_ONLY"; assert.equal((await f.authorize(write)).code, "POLICY_BLOCKED");
    f.planned.plan.steps[0].effect = "WRITE"; f.planned.plan.constraints.push({ id: "user", rule: "NO_WRITE" });
    assert.equal((await f.authorize(write)).code, "POLICY_BLOCKED"); assert.equal(f.approvals.size, 0);
  });
  it("requires no approval for low-risk read and creates one idempotent pending approval for write", async () => {
    const f = fixture(); assert.equal((await f.authorize()).status, "AUTHORIZED"); assert.equal(f.approvals.size, 0);
    const write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" });
    const first = await f.authorize(write), second = await f.authorize(write);
    assert.equal(first.status, "APPROVAL_REQUIRED"); assert.equal(first.request?.risk, "MEDIUM");
    assert.equal(first.request?.requiresApproval, true); assert.equal(first.approvalId, second.approvalId); assert.equal(f.approvals.size, 1);
  });
  it("cannot downgrade terminal risk or execute an arbitrary command", async () => {
    const f = fixture(); f.planned.plan.steps[0].effect = "EXECUTE";
    const result = await f.authorize(f.request("terminal.execute", { cwd: ".", command: "Remove-Item -Recurse C:\\" }));
    assert.equal(result.status, "APPROVAL_REQUIRED"); assert.equal(result.request?.risk, "HIGH"); assert.equal(result.executionAllowed, false);
    assert.equal(f.executions(), 0); assert.equal(await readFile(path.join(root, "src/safe.txt"), "utf8"), "unchanged fixture");
  });
  it("authorizes an approved exact request but never grants execution", async () => {
    const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" });
    const pending = await f.authorize(write); await f.grant(pending.approvalId!);
    const allowed = await f.authorize(write, f.workspace, pending.approvalId);
    assert.equal(allowed.status, "AUTHORIZED"); assert.equal(allowed.executionAllowed, false);
    assert.equal(f.approvals.get(pending.approvalId).decidedBy, claims.sub);
  });
  it("keeps denied permission blocked even with a previously approved request", async () => {
    const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" });
    const pending = await f.authorize(write); await f.grant(pending.approvalId!); f.setRole(null);
    assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "PERMISSION_DENIED");
    f.setRole("PM"); f.workspace.permissions = ["filesystem.read"];
    assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "PERMISSION_DENIED");
  });
  it("expires pending and already approved requests", async () => {
    for (const approved of [false, true]) {
      const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" });
      const pending = await f.authorize(write); if (approved) await f.grant(pending.approvalId!);
      f.approvals.get(pending.approvalId).dueAt = new Date(0);
      assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "APPROVAL_EXPIRED");
      assert.equal(f.approvals.get(pending.approvalId).status, "EXPIRED");
    }
  });
  it("prevents approval replay after request, input, step, plan or scope changes", async () => {
    const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "original" });
    const pending = await f.authorize(write); await f.grant(pending.approvalId!);
    assert.equal((await f.authorize({ ...write, id: "another-request" }, f.workspace, pending.approvalId)).code, "APPROVAL_INVALID");
    assert.equal((await f.authorize({ ...write, input: { ...write.input, content: "different" } }, f.workspace, pending.approvalId)).code, "APPROVAL_INVALID");
    assert.equal((await f.authorize(write, { ...f.workspace, allowedPaths: ["src"] }, pending.approvalId)).code, "APPROVAL_INVALID");
    f.planned.plan.steps[0].type = "PROPOSE";
    assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "APPROVAL_INVALID");
  });
  it("invalidates approval if a symlink is retargeted within the same workspace", async () => {
    const f = fixture(), link = path.join(root, "retarget-test");
    await mkdir(path.join(root, "alternate"), { recursive: true });
    await symlink(path.join(root, "src"), link, "junction");
    try {
      const write = f.request("filesystem.write", { path: "retarget-test/new.txt", content: "proposed" });
      const pending = await f.authorize(write); assert.equal(pending.status, "APPROVAL_REQUIRED"); await f.grant(pending.approvalId!);
      await unlink(link); await symlink(path.join(root, "alternate"), link, "junction");
      assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "APPROVAL_INVALID");
    } finally { await unlink(link); }
  });
  it("denies unauthorized reviewers and keeps denied/cancelled approvals terminal", async () => {
    const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" });
    const pending = await f.authorize(write), row = f.approvals.get(pending.approvalId);
    f.setRole(null); await assert.rejects(f.grant(pending.approvalId!)); assert.equal(f.approvals.get(pending.approvalId).status, "PENDING");
    f.setRole("PM"); await f.control.decideApproval(f.run.id, pending.approvalId!, claims, { decision: "DENIED", fingerprint: row.revisedPlan.fingerprint });
    assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "APPROVAL_INVALID");
    await assert.rejects(f.grant(pending.approvalId!), /APPROVAL_ALREADY_DECIDED/);
  });
  it("rejects missing approvals, fabricated approved flags and stale reviewer fingerprints", async () => {
    const f = fixture(); assert.equal((await f.authorize(f.request(), f.workspace, "invented-approval")).code, "APPROVAL_INVALID");
    const write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" }), pending = await f.authorize(write);
    await assert.rejects(f.control.decideApproval(f.run.id, pending.approvalId!, claims, { decision: "APPROVED", fingerprint: "0".repeat(64) }), /APPROVAL_INVALID/);
    const row = f.approvals.get(pending.approvalId); row.status = "APPROVED"; row.decision = "APPROVED";
    assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "APPROVAL_INVALID");
  });
});

describe("Phase 5B AgentRuntime control boundary", () => {
  it("resolves the control plane through the production Nest module without bootstrapping execution", async () => {
    const f = fixture();
    const module = await Test.createTestingModule({ imports: [AgentRuntimeModule] }).overrideProvider(PrismaService).useValue(f.db).compile();
    try {
      assert.ok(module.get(ToolAuthorizationService)); assert.ok(module.get(AgentToolControlService));
      assert.equal(module.get(ToolRegistryService).list().length, 16);
    } finally { await module.close(); }
  });
  it("consumes a real validated Phase 4 result without changing its planning authorization", async () => {
    const f = fixture(), understandingService = new AgentUnderstandingService();
    const context = understandingService.understand({ userId: claims.sub, projectId: f.run.projectId,
      instruction: "Inspect this workspace and explain the architecture.", workspaceAvailable: true, availableCapabilities: ["workspace_reader"] });
    const ref = "project-1:src/safe.txt";
    context.evidence = [{ sourceType: "workspace", sourceId: "project-1", relativePath: "src/safe.txt", provenance: ref, status: "COLLECTED",
      metadata: {}, warnings: [], content: { text: "unchanged fixture", extractorId: "text", detectedMime: "text/plain", truncated: false } }];
    const visible = new Map<string, string>(); new AgentContextSerializerService().forReasoning(context, visible);
    const base = interpretContext(context, visible);
    const planning = validatePlanningProposal(base, { constraintIds: base.constraints.map(c => c.id),
      facts: [{ id: "fact-1", text: "unchanged fixture", evidenceRef: ref }], inferences: [], hypotheses: [], unknowns: [],
      steps: [{ id: "step-1", type: "INSPECT", purpose: "UNDERSTAND", evidenceRefs: [ref], missingInformationIds: [], dependencies: [],
        scopeRefs: ["scope-1"], verificationCriterionIds: ["grounding"], effect: "READ_ONLY", dependencyStatus: "KNOWN" }] }, visible);
    assert.equal(planning.plan.readiness, "PLAN_READY");
    f.plan.steps[0].parameters.planning = planning;
    const result = await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: f.request() }, f.workspace);
    assert.equal(result.authorization?.status, "AUTHORIZED"); assert.equal(planning.plan.authorization, "NOT_GRANTED"); assert.equal(f.executions(), 0);
  });
  it("EXECUTE_TOOL reaches authorization and pauses without dispatching a skill", async () => {
    const f = fixture(), result = await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: f.request() }, f.workspace);
    assert.equal(result.executionBoundaryReached, true); assert.equal(result.executionPerformed, false); assert.equal(f.run.status, "PAUSED");
    assert.equal(f.run.failureReason, "EXECUTION_BOUNDARY_NOT_IMPLEMENTED"); assert.equal(f.executions(), 0);
    await f.runtime.executeRun(f.run.id, claims); assert.equal(f.executions(), 0);
  });
  it("approval required moves to AWAITING_APPROVAL; granting only records approval", async () => {
    const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "secret-content" });
    const result = await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: write }, f.workspace);
    assert.equal(f.run.status, "AWAITING_APPROVAL"); await f.grant(result.authorization!.approvalId!);
    assert.equal(f.run.status, "AWAITING_APPROVAL"); assert.equal(f.executions(), 0);
    const retry = await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: write, approvalId: result.authorization!.approvalId }, f.workspace);
    assert.equal(retry.authorization?.status, "AUTHORIZED"); assert.equal(f.run.status, "PAUSED");
    const persisted = JSON.stringify({ events: f.events, audits: f.audits, approvals: [...f.approvals.values()] });
    assert.equal(persisted.includes("secret-content"), false); assert.equal(persisted.includes(root.replace(/\\/g, "\\\\")), false);
    assert.ok(f.events.some(e => e.eventType === "APPROVAL_GRANTED")); assert.ok(f.audits.every(a => a.actor.sub === claims.sub));
  });
  it("REQUEST_APPROVAL uses the same permission gate and can require review for a read", async () => {
    const f = fixture();
    const r = await f.runtime.applyDecision(f.run.id, claims, { type: "REQUEST_APPROVAL", toolRequest: f.request() }, f.workspace);
    assert.equal(r.authorization?.status, "APPROVAL_REQUIRED"); assert.equal(f.run.status, "AWAITING_APPROVAL");
    await f.grant(r.authorization!.approvalId!);
    const retry = await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: f.request(), approvalId: r.authorization!.approvalId }, f.workspace);
    assert.equal(retry.authorization?.status, "AUTHORIZED");
    const denied = fixture(); denied.workspace.permissions = [];
    assert.equal((await denied.runtime.applyDecision(denied.run.id, claims, { type: "REQUEST_APPROVAL", toolRequest: denied.request() }, denied.workspace)).authorization?.code, "PERMISSION_DENIED");
    assert.equal(denied.approvals.size, 0);
  });
  it("persists a bounded blocked diagnostic without raw malformed input", async () => {
    const f = fixture(); const result = await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: { command: "secret-command" } }, f.workspace);
    assert.equal(result.authorization?.code, "INVALID_INPUT"); assert.equal(f.run.status, "PAUSED");
    assert.ok(f.events.some(e => e.eventType === "TOOL_BLOCKED")); assert.equal(JSON.stringify(f.events).includes("secret-command"), false);
  });
  it("preserves paused/cancelled states and cancellation invalidates pending approvals", async () => {
    for (const status of ["PAUSED", "CANCELLED"]) {
      const f = fixture(); f.run.status = status;
      assert.equal((await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: f.request() }, f.workspace)).authorization?.code, "RUN_NOT_ACTIVE");
      assert.equal(f.run.status, status); assert.equal(f.approvals.size, 0);
    }
    const f = fixture(); await f.runtime.applyDecision(f.run.id, claims, { type: "REQUEST_APPROVAL", toolRequest: f.request() }, f.workspace);
    await f.runtime.cancelRun(f.run.id, claims, {});
    assert.equal(f.run.status, "CANCELLED"); assert.equal([...f.approvals.values()][0].status, "CANCELLED");
  });
  it("recovery/resume cannot dispatch or regenerate a prior tool control boundary", async () => {
    const f = fixture(); await f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: f.request() }, f.workspace);
    await f.runtime.resumeRun(f.run.id, claims); assert.equal(f.run.status, "RUNNING");
    await f.runtime.executeRun(f.run.id, claims); assert.equal(f.run.status, "PAUSED");
    assert.equal(f.run.failureReason, "CONTROL_PLANE_REAUTHORIZATION_REQUIRED"); assert.equal(f.executions(), 0);
  });
  it("non-tool decisions stop at the control plane without a verification/replan loop", async () => {
    for (const type of ["ASK_USER", "REPLAN", "VERIFY", "COMPLETE", "STOP"]) {
      const f = fixture(); await f.runtime.applyDecision(f.run.id, claims, { type });
      assert.equal(f.run.status, type === "COMPLETE" ? "COMPLETED" : type === "STOP" ? "CANCELLED" : "PAUSED");
      assert.equal(f.planned.plan.steps[0].status, "PLANNED"); assert.equal(f.executions(), 0);
    }
  });
  it("uses durable project/owner scope for pause, resume and cancellation", async () => {
    const f = fixture(); f.run.status = "RUNNING";
    await f.runtime.pauseRun(f.run.id, claims, {}); assert.equal(f.run.status, "PAUSED");
    f.run.project.organizationId = "another-org";
    await assert.rejects(f.runtime.resumeRun(f.run.id, { ...claims, role: "Admin" }));
    await assert.rejects(f.runtime.cancelRun(f.run.id, { ...claims, role: "Admin" }, {}));
    f.run.project.organizationId = "org-1"; f.run.userId = "another-owner";
    await assert.rejects(f.runtime.resumeRun(f.run.id, claims));
    f.run.userId = claims.sub; await f.runtime.resumeRun(f.run.id, claims);
    assert.equal(f.run.status, "RUNNING");
  });
  it("approval controller derives identity from the session and rejects actor fields", async () => {
    const f = fixture(), pending = await f.authorize(f.request("filesystem.write", { path: "src/new.txt", content: "proposed" }));
    const auth = { validateDurableSession: async () => claims } as any;
    f.db.project = { findUnique: async () => f.run.project };
    f.db.user = { findUnique: async () => ({ status: "active", organizationId: "org-1" }) };
    f.db.agentArtifact = { findUnique: async () => null };
    (f.runtime as any).decisions = new AgentDecisionService(f.db, auth, new ProjectAccessService(f.db, f.resources), f.resources,
      undefined as any, f.registry, f.control, f.approvalService, new AgentControlStoreService(f.audit));
    const controller = new AgentRuntimeController(f.runtime, auth);
    const body = { decision: "APPROVED", fingerprint: f.approvals.get(pending.approvalId).revisedPlan.fingerprint };
    await assert.rejects(controller.decideToolApproval(f.run.id, pending.approvalId!, "session", { ...body, actor: "admin" }));
    await controller.decideToolApproval(f.run.id, pending.approvalId!, "session", body);
    assert.equal(f.approvals.get(pending.approvalId).decidedBy, claims.sub);
  });
  it("rolls back approval creation and state changes if durable audit fails", async () => {
    const f = fixture(); f.db.agentRunEvent.create = async () => { throw new Error("durability unavailable"); };
    await assert.rejects(f.runtime.applyDecision(f.run.id, claims, { type: "REQUEST_APPROVAL", toolRequest: f.request() }, f.workspace));
    assert.equal(f.approvals.size, 0); assert.equal(f.run.status, "COMPLETED");
  });
});

describe("Phase 5B repair B1: canonical authorization order", () => {
  function trace(f: ReturnType<typeof fixture>): string[] {
    const calls: string[] = [];
    const resource = f.resources.authorize.bind(f.resources);
    f.resources.authorize = async (subject, action, target) => {
      if (target.resourceType === "AgentRun") calls.push("resource");
      return resource(subject, action, target);
    };
    for (const [target, method, stage] of [
      [f.registry, "resolve", "tool"], [f.authorization, "validInput", "input"], [f.permissions, "check", "permission"],
      [f.scopes, "validate", "scope"], [f.risk, "classify", "risk"], [f.authorization, "validatePlan", "plan"],
      [f.approvalService, "evaluate", "approval"]
    ] as const) {
      const object = target as any, original = object[method].bind(object);
      object[method] = (...args: any[]) => { calls.push(stage); return original(...args); };
    }
    return calls;
  }
  it("orders every stage after authenticated identity and stops before execution", async () => {
    const f = fixture(), proposal = f.request(), calls = trace(f);
    const result = await f.authorization.authorize(f.run.id, proposal, claims, f.workspace);
    assert.deepEqual(calls, ["resource", "tool", "input", "permission", "scope", "risk", "plan", "approval"]);
    assert.equal(result.status, "AUTHORIZED"); assert.equal(result.executionAllowed, false); assert.equal(f.executions(), 0);
  });
  it("resolves an unknown tool before evaluating otherwise invalid input", async () => {
    const f = fixture(), proposal = { ...f.request(), toolId: "unknown.tool", input: {} }, calls = trace(f);
    assert.equal((await f.authorize(proposal)).code, "INVALID_TOOL"); assert.deepEqual(calls, ["resource", "tool"]);
  });
  it("rejects input before permission, scope, risk, plan or approval", async () => {
    const f = fixture(), proposal = { ...f.request(), input: {} }, calls = trace(f); f.workspace.permissions = [];
    assert.equal((await f.authorize(proposal)).code, "INVALID_INPUT"); assert.deepEqual(calls, ["resource", "tool", "input"]);
  });
  it("terminates a denied permission before invalid scope or stale plan checks", async () => {
    const f = fixture(), proposal = { ...f.request(), planVersion: 999, input: { path: "../outside" } }, calls = trace(f);
    f.workspace.permissions = [];
    assert.equal((await f.authorize(proposal)).code, "PERMISSION_DENIED");
    assert.deepEqual(calls, ["resource", "tool", "input", "permission"]); assert.equal(f.approvals.size, 0);
  });
  it("terminates invalid scope before risk, plan or approval", async () => {
    const f = fixture(), proposal = f.request("filesystem.read", { path: "../outside" }), calls = trace(f);
    proposal.planVersion = 999;
    assert.equal((await f.authorize(proposal)).code, "SCOPE_VIOLATION");
    assert.deepEqual(calls, ["resource", "tool", "input", "permission", "scope"]);
  });
  it("calculates risk before plan validation and never approves an invalid plan", async () => {
    const f = fixture(), proposal = { ...f.request(), planId: "wrong-plan" }, calls = trace(f);
    assert.equal((await f.authorize(proposal)).code, "INVALID_PLAN_STEP");
    assert.deepEqual(calls, ["resource", "tool", "input", "permission", "scope", "risk", "plan"]);
  });
});

describe("Phase 5B repair B2: explicit canonical plan identity", () => {
  for (const key of ["planId", "planVersion"]) {
    it(`rejects a read request missing ${key}`, async () => {
      const f = fixture(), proposal: any = f.request(); delete proposal[key];
      assert.equal((await f.authorize(proposal)).code, "INVALID_INPUT"); assert.equal(f.approvals.size, 0);
    });
  }
  for (const version of [0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
    it(`rejects malformed plan version ${String(version)}`, async () => {
      const f = fixture(); assert.equal((await f.authorize({ ...f.request(), planVersion: version })).code, "INVALID_INPUT");
    });
  }
  it("rejects the wrong plan ID, step ID, and plan-to-run ownership", async () => {
    const f = fixture();
    assert.equal((await f.authorize({ ...f.request(), planId: "other-plan" })).code, "INVALID_PLAN_STEP");
    assert.equal((await f.authorize({ ...f.request(), planStepId: "other-step" })).code, "INVALID_PLAN_STEP");
    f.plan.agentRunId = "other-run"; assert.equal((await f.authorize()).code, "INVALID_PLAN_STEP");
  });
  it("rejects an old read request after a trusted plan version changes", async () => {
    const f = fixture(), proposal = f.request();
    f.plan.version = 2; f.run.planVersion = 2;
    assert.equal((await f.authorize(proposal)).code, "INVALID_PLAN_STEP");
    const current = await f.authorize(f.request());
    assert.equal(current.status, "AUTHORIZED"); assert.equal(current.request?.planId, f.plan.id);
    assert.equal(current.request?.planVersion, 2); assert.equal(current.request?.planStepId, "step-1");
    assert.equal(f.approvals.size, 0); assert.equal(current.executionAllowed, false);
  });
  it("invalidates an old approval even when a new request references the new plan", async () => {
    const f = fixture(), write = f.request("filesystem.write", { path: "src/new.txt", content: "proposed" });
    const pending = await f.authorize(write); await f.grant(pending.approvalId!);
    f.plan.id = "plan-2"; f.plan.version = 2; f.run.planVersion = 2;
    assert.equal((await f.authorize(write, f.workspace, pending.approvalId)).code, "INVALID_PLAN_STEP");
    assert.equal((await f.authorize({ ...write, planId: "plan-2", planVersion: 2 }, f.workspace, pending.approvalId)).code, "APPROVAL_INVALID");
  });
});

describe("Phase 5B repair B3: canonical sensitive targets", () => {
  async function withAliasTarget(target: string, check: () => Promise<void>) {
    const original = realpathSync.native, alias = path.join(root, "alias");
    // Redirect only canonical metadata for the existing fixture alias. No new
    // sensitive files, symlinks, or tool filesystem mutations are performed.
    realpathSync.native = ((value: any, options: any) => {
      const candidate = path.resolve(String(value));
      if (candidate === alias || candidate.startsWith(alias + path.sep)) return path.join(root, target) + candidate.slice(alias.length);
      return original(value, options);
    }) as typeof realpathSync.native;
    try { await check(); } finally { realpathSync.native = original; }
  }
  for (const target of ["secrets", "node_modules", "nested/credentials"]) {
    it(`rejects direct and aliased canonical ${target} ancestors`, async () => {
      await withAliasTarget(target, async () => {
        const f = fixture();
        assert.equal((await f.authorize(f.request("filesystem.read", { path: `${target}/safe.txt` }))).code, "SCOPE_VIOLATION");
        assert.equal((await f.authorize(f.request("filesystem.read", { path: "alias/safe.txt" }))).code, "SCOPE_VIOLATION");
        assert.equal((await f.authorize(f.request("filesystem.write", { path: "alias/new/child.txt", content: "proposed" }))).code, "SCOPE_VIOLATION");
        f.workspace.allowedPaths = ["alias"];
        assert.equal((await f.authorize(f.request("filesystem.read", { path: "alias/safe.txt" }))).code, "SCOPE_VIOLATION");
        assert.equal(f.approvals.size, 0);
      });
    });
  }
  for (const tool of ["filesystem.move", "filesystem.copy"]) {
    for (const field of ["source", "destination"]) {
      it(`rejects a sensitive canonical ${field} for ${tool}`, async () => {
        await withAliasTarget("secrets", async () => {
          const f = fixture(), input = { source: "src/safe.txt", destination: "src/new.txt", [field]: "alias/safe.txt" };
          assert.equal((await f.authorize(f.request(tool, input))).code, "SCOPE_VIOLATION"); assert.equal(f.approvals.size, 0);
        });
      });
    }
  }
  it("allows a legitimate in-scope non-sensitive alias", async () => {
    const f = fixture(); f.workspace.allowedPaths = ["alias"];
    assert.equal((await f.authorize(f.request("filesystem.read", { path: "alias/safe.txt" }))).status, "AUTHORIZED");
    assert.equal((await f.authorize(f.request("filesystem.write", { path: "alias/new/child.txt", content: "proposed" }))).status, "APPROVAL_REQUIRED");
  });
});

describe("Phase 5B repair B4: authoritative descriptors", () => {
  it("exposes complete immutable metadata and stable versions for all definitions", () => {
    const f = fixture();
    for (const tool of f.registry.list()) {
      assert.equal(tool.version, "1.0.0"); assert.ok(tool.description); assert.ok(tool.inputSchema); assert.ok(tool.outputSchema);
      assert.ok(tool.requiredPermissions.length); assert.ok(tool.pathFields.length); assert.equal(tool.scopeRequirements.kind, "WORKSPACE");
      assert.equal(tool.scopeRequirements.wholeWorkspace, tool.category !== "FILESYSTEM");
      assert.equal(tool.executionCapability, "UNAVAILABLE"); assert.equal(tool.executionMode, "DEFINITION_ONLY");
      assert.ok(tool.verificationExpectations.length); assert.ok(tool.verificationExpectations.every(value => value.trim()));
      assert.ok(Object.isFrozen(tool)); assert.ok(Object.isFrozen(tool.scopeRequirements)); assert.ok(Object.isFrozen(tool.verificationExpectations));
      assert.throws(() => (tool.verificationExpectations as string[]).push("invented"));
      const wholeWorkspace = tool.scopeRequirements.wholeWorkspace;
      assert.equal(Reflect.set(tool.scopeRequirements, "wholeWorkspace", !wholeWorkspace), false);
      assert.equal(tool.scopeRequirements.wholeWorkspace, wholeWorkspace);
      if (tool.riskLevel !== "LOW" || tool.requiredPermissions.some(p => !["filesystem.read", "git.read"].includes(p))) assert.equal(tool.approvalRequirement, "REQUIRED");
    }
    assert.throws(() => f.registry.resolve("unknown"), /INVALID_TOOL/);
  });
  for (const key of ["scopeRequirements", "approvalRequirement", "executionCapability", "verificationExpectations", "inputSchema", "outputSchema"]) {
    it(`rejects a descriptor missing ${key}`, () => {
      const f = fixture(), tool: any = { ...f.registry.resolve("filesystem.read"), id: "custom" }; delete tool[key];
      assert.throws(() => f.registry.register(tool), /INVALID_TOOL_DEFINITION/);
    });
  }
  it("rejects empty verification, weakened approval, runtime capability, and reserved risk metadata", () => {
    const f = fixture(), read = f.registry.resolve("filesystem.read"), terminal = f.registry.resolve("terminal.execute");
    for (const tool of [
      { ...read, id: "custom", verificationExpectations: [] },
      { ...terminal, id: "custom", approvalRequirement: "NOT_REQUIRED" },
      { ...terminal, id: "custom", scopeRequirements: { kind: "WORKSPACE", wholeWorkspace: false } },
      { ...read, id: "custom", executionCapability: "LOCAL_RUNTIME" },
      { ...terminal, id: "package.install", riskLevel: "LOW" }
    ]) assert.throws(() => f.registry.register(tool as any), /INVALID_TOOL_DEFINITION/);
  });
  it("derives stricter approval and scope rules from the registered descriptor", async () => {
    const f = fixture(), custom = { ...f.registry.resolve("filesystem.read"), id: "custom.read", approvalRequirement: "REQUIRED" as const,
      scopeRequirements: { kind: "WORKSPACE" as const, wholeWorkspace: true } };
    f.registry.register(custom); f.workspace.allowedPaths = ["src"];
    assert.equal((await f.authorize(f.request(custom.id))).code, "SCOPE_VIOLATION");
    f.workspace.allowedPaths = ["."];
    assert.equal((await f.authorize(f.request(custom.id))).status, "APPROVAL_REQUIRED");
  });
});

describe("Phase 5B repair B5: conservative prerequisite eligibility", () => {
  function prerequisite(f: ReturnType<typeof fixture>, status: string, id = "prerequisite", dependencies: string[] = []) {
    const step = { id, type: "ANALYZE", status, effect: "READ_ONLY", dependencies, verificationRequired: false };
    (f.planned.plan.steps as any[]).push(step); f.planned.plan.steps[0].dependencies = [id]; return step;
  }
  it("accepts an explicitly completed prerequisite from the trusted persisted plan", async () => {
    const f = fixture(); prerequisite(f, "COMPLETED");
    assert.equal((await f.authorize()).status, "AUTHORIZED"); assert.equal(f.executions(), 0);
    assert.equal(f.planned.plan.steps[0].status, "PLANNED");
  });
  for (const status of ["PLANNED", "BLOCKED", "CANCELLED", "AUTHORIZED", "APPROVED", "UNKNOWN"]) {
    it(`rejects a prerequisite still ${status}`, async () => {
      const f = fixture(); prerequisite(f, status);
      assert.equal((await f.authorize()).code, "DEPENDENCY_NOT_SATISFIED"); assert.equal(f.approvals.size, 0);
    });
  }
  it("requires actual persisted verification when the prerequisite requires it", async () => {
    const f = fixture(), step: any = prerequisite(f, "COMPLETED"); step.verificationRequired = true;
    assert.equal((await f.authorize()).code, "DEPENDENCY_NOT_SATISFIED");
    step.verification = { status: "PLANNED" }; assert.equal((await f.authorize()).code, "DEPENDENCY_NOT_SATISFIED");
    step.verification = { status: "VERIFIED" }; assert.equal((await f.authorize()).status, "AUTHORIZED");
  });
  it("rejects missing prerequisites and malformed dependency metadata", async () => {
    for (const dependencies of [["missing"], undefined, ["missing", "missing"]]) {
      const f = fixture(); (f.planned.plan.steps[0] as any).dependencies = dependencies;
      assert.equal((await f.authorize()).code, "DEPENDENCY_NOT_SATISFIED");
    }
  });
  it("checks every prerequisite in a multi-step chain and rejects cycles", async () => {
    const f = fixture(); const middle = prerequisite(f, "COMPLETED", "middle", ["first"]);
    const first = { id: "first", type: "ANALYZE", status: "PLANNED", effect: "READ_ONLY", dependencies: [] as string[], verificationRequired: false };
    (f.planned.plan.steps as any[]).push(first);
    assert.equal((await f.authorize()).code, "DEPENDENCY_NOT_SATISFIED");
    first.status = "COMPLETED"; assert.equal((await f.authorize()).status, "AUTHORIZED");
    first.dependencies = [middle.id]; assert.equal((await f.authorize()).code, "DEPENDENCY_NOT_SATISFIED");
  });
  it("allows independent steps and does not accept dependency claims in a request", async () => {
    const f = fixture(); assert.equal((await f.authorize()).status, "AUTHORIZED");
    prerequisite(f, "PLANNED");
    assert.equal((await f.authorize({ ...f.request(), dependencies: [], status: "COMPLETED" })).code, "INVALID_INPUT");
    assert.equal((await f.authorize()).code, "DEPENDENCY_NOT_SATISFIED");
  });
});

describe("Phase 5B repair B6: bounded denial audit", () => {
  function deniedAudit(f: ReturnType<typeof fixture>, code: string) {
    const latest = f.audits[f.audits.length - 1];
    assert.equal(latest.actor.sub, claims.sub); assert.equal(latest.result, "DENIED");
    assert.equal(latest.details.code, code); assert.equal(latest.details.executionAllowed, false);
    assert.ok(JSON.stringify(latest.details).length < 2048); return latest;
  }
  for (const mode of ["owner", "resource", "missing"]) {
    it(`audits ${mode} denial without another resource's private details`, async () => {
      const f = fixture(); f.run.projectId = "private-project"; f.run.project.organizationId = "private-organization";
      if (mode === "owner") f.run.userId = "private-owner";
      if (mode === "resource") f.setRole(null);
      const runId = mode === "missing" ? "missing-run" : f.run.id;
      const proposal = { ...f.request(), input: { path: "src/safe.txt", secret: "never-log-this" }, workspaceId: "private-workspace" };
      const result = await f.authorization.authorize(runId, proposal, claims, f.workspace);
      assert.equal(result.code, "PERMISSION_DENIED"); const record = deniedAudit(f, "PERMISSION_DENIED");
      assert.equal(record.resourceId, runId); assert.equal(record.details.requestId, proposal.id); assert.equal(f.events.length, 0);
      for (const value of ["private-project", "private-organization", "private-owner", "private-workspace", "never-log-this"]) assert.equal(JSON.stringify(record).includes(value), false);
    });
  }
  for (const mode of ["owner", "resource", "missing"]) {
    it(`commits the runtime ${mode} denial audit before preserving its API error`, async () => {
      const f = fixture(); if (mode === "owner") f.run.userId = "someone-else"; if (mode === "resource") f.setRole(null);
      await assert.rejects(f.runtime.applyDecision(mode === "missing" ? "missing-run" : f.run.id, claims,
        { type: "EXECUTE_TOOL", toolRequest: f.request() }, f.workspace));
      deniedAudit(f, "PERMISSION_DENIED"); assert.equal(f.audits.length, 1); assert.equal(f.events.length, 0);
    });
  }
  it("preserves permission, scope, approval denial and success audit records", async () => {
    const permission = fixture(); permission.workspace.permissions = []; await permission.authorize(); deniedAudit(permission, "PERMISSION_DENIED");
    const scope = fixture(); await scope.authorize(scope.request("filesystem.read", { path: "../outside" })); deniedAudit(scope, "SCOPE_VIOLATION");
    const approval = fixture(), write = approval.request("filesystem.write", { path: "src/new.txt", content: "secret-content" });
    const pending = await approval.authorize(write);
    await approval.control.decideApproval(approval.run.id, pending.approvalId!, claims, { decision: "DENIED", fingerprint: approval.approvals.get(pending.approvalId).revisedPlan.fingerprint });
    await approval.authorize(write, approval.workspace, pending.approvalId); deniedAudit(approval, "APPROVAL_INVALID");
    assert.equal(JSON.stringify(approval.audits).includes("secret-content"), false);
    const success = fixture(); await success.authorize();
    assert.equal(success.audits[0].result, "SUCCESS"); assert.equal(success.audits[0].details.executionAllowed, false);
  });
  it("fails closed if an early denial cannot be audited", async () => {
    const f = fixture(); f.run.userId = "other-owner";
    f.audit.recordWithClaimsTx = async () => { throw new Error("audit unavailable"); };
    await assert.rejects(f.authorize(), /audit unavailable/); assert.equal(f.approvals.size, 0);
    await assert.rejects(f.runtime.applyDecision(f.run.id, claims, { type: "EXECUTE_TOOL", toolRequest: f.request() }, f.workspace), /audit unavailable/);
  });
});
