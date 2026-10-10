import { RuntimeFolderService } from "../../src/trusted-runtime/runtime-folder.service";
import { generateKeyPairSync, sign } from "node:crypto";
import { RuntimeLedgerService } from "../../src/trusted-runtime/runtime-ledger.service";
import { RuntimeIdentityService } from "../../src/trusted-runtime/runtime-identity.service";
import { RuntimeControlService } from "../../src/trusted-runtime/runtime-control.service";
import { RuntimeExecutionService } from "../../src/trusted-runtime/runtime-execution.service";
import { runtimeSigningText } from "../../src/trusted-runtime/runtime.contract";
import { ToolRegistryService } from "../../src/agent-runtime/tools/tool-registry.service";
import { ToolScopeService } from "../../src/agent-runtime/tools/tool-scope.service";
import { ToolPermissionService } from "../../src/agent-runtime/tools/tool-permission.service";
import { ToolRiskService } from "../../src/agent-runtime/tools/tool-risk.service";
import { ToolApprovalService } from "../../src/agent-runtime/tools/tool-approval.service";
import { ToolAuthorizationService } from "../../src/agent-runtime/tools/tool-authorization.service";
import { ResourceAuthorizationService } from "../../src/auth/resource-authz.service";
import { ProjectAccessService } from "../../src/auth/project-access.service";
import { WorkspaceSourceResolver } from "../../src/agent-runtime/capabilities/workspace-source.resolver";
import { WorkspacePathService } from "../../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../../src/workspace-intelligence/security/workspace-security.service";
import { WorkspaceStoreService } from "../../src/workspace-intelligence/workspace-store.service";
import { WorkspaceRuntimeService } from "../../src/workspace-intelligence/workspace-runtime.service";
import { WorkspaceRuntimeEvidenceService } from "../../src/workspace-intelligence/workspace-runtime-evidence.service";
import { EvidenceCollectorService } from "../../src/agent-runtime/understanding/evidence-collector.service";
import { AgentContextBuilderService } from "../../src/agent-runtime/understanding/agent-context-builder.service";
import { AgentUnderstandingService } from "../../src/agent-runtime/understanding/agent-understanding.service";
import { AgentContextSerializerService } from "../../src/agent-runtime/understanding/agent-context-serializer.service";
import { AgentInspectionService } from "../../src/agent-runtime/inspection/agent-inspection.service";
import type { InspectionLoop } from "../../src/agent-runtime/inspection/inspection.contract";

// A transactional in-memory database only. Real identity, authorization, approval,
// permit, result verification, workspace admission and context services run unmodified.
export async function inspectionHarness() {
  const tables: Record<string, Map<string, any>> = {}, db: any = {}; let serial = 0, queue = Promise.resolve();
  const equal = (a: any, b: any) => a instanceof Date || b instanceof Date ? +new Date(a) === +new Date(b) : a === b;
  const matches = (row: any, where: any): boolean => !where || Object.entries(where).every(([key, v]: any) => {
    if (key === "AND") return (Array.isArray(v) ? v : [v]).every((x: any) => matches(row, x));
    if (key === "OR") return v.some((x: any) => matches(row, x));
    if (key === "NOT") return !matches(row, v);
    if (!row) return false;
    if (key === "agentRun") return matches(tables.agentRun.get(row.agentRunId), v);
    const a = row[key];
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if (v.path) return equal(v.path.reduce((n: any, k: string) => n?.[k], a), v.equals);
      if ("in" in v) return v.in.includes(a);
      if ("equals" in v) return equal(a, v.equals);
      if ("startsWith" in v) return typeof a === "string" && a.startsWith(v.startsWith);
      if ("notIn" in v) return !v.notIn.includes(a);
      return matches(a, v);
    }
    return equal(a, v);
  });
  const project = (name: string, row: any, arg: any) => {
    if (!row) return null;
    const result = structuredClone(row);
    if (name === "agentRun") {
      if (arg.include?.project) result.project = structuredClone(tables.project.get(row.projectId));
      if (arg.include?.plans) result.plans = [...tables.agentPlan.values()].filter(p => p.agentRunId === row.id).sort((a, b) => b.version - a.version).slice(0, arg.include.plans.take ?? 100).map(p => structuredClone(p));
    }
    return result;
  };
  for (const name of ["auditEvent", "user", "userSession", "project", "projectMember", "groupMember", "conversation", "conversationMessage", "agentRun", "agentPlan", "agentRunEvent", "agentApproval", "agentArtifact"]) {
    tables[name] = new Map(); const rows = tables[name];
    db[name] = {
      findUnique: async (arg: any) => project(name, [...rows.values()].find(r => matches(r, arg.where)), arg),
      findFirst: async (arg: any) => project(name, [...rows.values()].find(r => matches(r, arg.where)), arg),
      findMany: async (arg: any = {}) => [...rows.values()].filter(r => matches(r, arg.where)).slice(0, arg.take ?? 10000).map(r => project(name, r, arg)),
      create: async ({ data }: any) => { const row = structuredClone({ id: `fixture-${++serial}`, createdAt: new Date(), updatedAt: new Date(), ...data }); if (rows.has(row.id)) throw new Error("duplicate PK"); rows.set(row.id, row); return structuredClone(row); },
      update: async ({ where, data }: any) => { const row = [...rows.values()].find(r => matches(r, where)); if (!row) throw new Error("missing row"); Object.assign(row, structuredClone(data)); return structuredClone(row); },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const r of rows.values()) if (matches(r, where)) { Object.assign(r, structuredClone(data)); count++; } return { count }; },
      upsert: async ({ where, create, update }: any) => rows.has(where.id) ? db[name].update({ where, data: update }) : db[name].create({ data: create })
    };
  }
  db.$queryRawUnsafe = async () => []; db.$executeRawUnsafe = async () => 1;
  db.$transaction = async (work: any) => { const before = queue; let unlock!: () => void; queue = new Promise(r => { unlock = r }); await before;
    const backup = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, structuredClone([...v])]));
    try { return await work(db); } catch (error) { for (const [k, rows] of Object.entries(backup)) { tables[k].clear(); for (const [id, row] of rows) tables[k].set(id, row); } throw error; } finally { unlock(); } };
  const claims: any = { sub: "user-a", organizationId: "org-a", role: "Admin", email: "test@example.invalid", displayName: "Test", sessionId: "session-a", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  await db.user.create({ data: { id: claims.sub, organizationId: claims.organizationId, status: "active", email: claims.email, displayName: "Test", roles: [{ role: { key: "Admin" } }] } });
  await db.userSession.create({ data: { id: claims.sessionId, userId: claims.sub, expiresAt: new Date(claims.exp * 1000), revokedAt: null } });
  await db.project.create({ data: { id: "project-a", organizationId: claims.organizationId } });
  await db.conversation.create({ data: { id: "conversation-a", projectId: "project-a", userId: claims.sub, metadata: {} } });
  const ledger = new RuntimeLedgerService(db), identity = new RuntimeIdentityService(ledger), resources = new ResourceAuthorizationService(db);
  const audit: any = { recordWithClaimsTx: async () => {}, recordWithClaims: async () => {} };
  const registry = new ToolRegistryService(), paths = new WorkspacePathService(), scopes = new ToolScopeService(new WorkspaceSourceResolver(), paths, new WorkspaceSecurityService(paths));
  const approvals = new ToolApprovalService(resources, audit), gate = new ToolAuthorizationService(registry, scopes, new ToolPermissionService(resources), new ToolRiskService(), approvals, resources, audit, db);
  const store = new WorkspaceStoreService(db), control = new RuntimeControlService(ledger, identity, gate, approvals, registry, store), folders = new RuntimeFolderService(identity, store), executions = new RuntimeExecutionService(ledger, identity, control, folders);
  const runtime = new WorkspaceRuntimeService(store, identity, control, new ProjectAccessService(db, resources));
  const evidence = new WorkspaceRuntimeEvidenceService(store, runtime, identity);
  const collector = new EvidenceCollectorService({} as any, { discover: () => { throw new Error("BACKEND_FALLBACK") } } as any, undefined, undefined, undefined, undefined, undefined, undefined, store, evidence);
  const contexts = new AgentContextBuilderService(new AgentUnderstandingService(), collector, new AgentContextSerializerService());
  const keys = generateKeyPairSync("ed25519"), publicKey = String(keys.publicKey.export({ type: "spki", format: "pem" }));
  const enrollment = await identity.enrollment(publicKey, "1.0.0"), timestamp = new Date().toISOString();
  await identity.proveEnrollment(enrollment.code, timestamp, sign(null, Buffer.from(runtimeSigningText(enrollment.challenge, timestamp)), keys.privateKey).toString("base64"));
  const device = await identity.enroll(claims, enrollment.code, "Windows test runtime");
  const request = async (op: "connect" | "poll" | "started" | "heartbeat" | "result" | "folder-result", body: any = {}) => {
    const c = await identity.challenge(device.runtimeId, op, body), time = new Date().toISOString();
    return executions.request(op, body, { runtimeId: device.runtimeId, connectionEpoch: c.connectionEpoch, challengeId: c.challengeId, timestamp: time,
      signature: sign(null, Buffer.from(runtimeSigningText(c, time)), keys.privateKey).toString("base64") }) as Promise<any>;
  };
  await request("connect", { workspaceReadProtocol: 1, conditionalWriteProtocol: 1 }); await identity.grant(claims, device.runtimeId, "project-a", ["filesystem.list", "filesystem.read", "filesystem.search"]);
  const complete = async (e: any, text = "export function authenticate() {}", override: any = {}) => {
    const started = await request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest });
    if (!started.execute) return started;
    const now = new Date().toISOString(), path = e.attribution.validatedInput.path;
    return request("result", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest, state: "SUCCEEDED", startedAt: now, finishedAt: now,
      durationMs: 1, pid: null, exitCode: null, stdout: e.attribution.tool === "filesystem.read" ? text : "", stderr: "", error: null, truncated: false,
      result: e.attribution.tool === "filesystem.list" ? { path, entries: [{ name: "session.ts", type: "file" }] } : e.attribution.tool === "filesystem.search" ? { matches: [{ path: `${path}\\session.ts`, line: 1, text }], inspected: 2 } : { path, bytesRead: Buffer.byteLength(text), size: Buffer.byteLength(text) },
      verificationState: "VERIFIED", verificationResult: { observed: true }, ...override });
  };
  let binding = await runtime.createBinding(claims, "project-a", { runtimeId: device.runtimeId, rootPath: "D:\\Fixture", displayName: "Fixture", requestId: "bind" });
  const verify = await runtime.request(claims, "project-a", binding.workspaceId, "VERIFY", { bindingVersion: binding.version, relativePath: "", conversationId: "conversation-a", requestId: "verify" });
  const verifySnapshot = await control.snapshot(claims, verify.operation.runId);
  await control.approve(claims, verify.operation.runId, verifySnapshot!.proposal.approvalFingerprint!, "APPROVED");
  await complete((await request("poll")).execution); await runtime.operation(claims, "project-a", binding.workspaceId, binding.version, verify.operation.operationId);
  binding = (await store.getBinding(binding.workspaceId))!;
  const responses: Array<string | ((input: any) => string | Promise<string>)> = [];
  const calls: any[] = [], gateway: any = { requestAgentConversation: async (input: any) => { calls.push(input); if (!responses.length) throw new Error("no model fixture"); const response = responses.shift()!; return typeof response === "function" ? response(input) : response; } };
  gateway.requestStructuredReasoning = async (input: any) => { calls.push({ ...input, structured: true }); if (!responses.length) throw new Error("no model fixture"); const response = responses.shift()!; return typeof response === "function" ? response(input) : response; };
  const newService = () => new AgentInspectionService(ledger, identity, control, store, evidence, contexts, collector, gateway);
  const service = newService();
  const run = await db.agentRun.create({ data: { id: "agent-inspection-a", conversationId: "conversation-a", userId: claims.sub, projectId: "project-a", status: "QUEUED", planVersion: 1, title: "Understand authentication" } });
  await ledger.transaction(tx => service.initializeTx(tx, run, claims, binding, "Understand this project and identify where authentication is implemented."));
  const state = () => ledger.transaction(async tx => (await ledger.read<InspectionLoop>(tx, "AGENT_INSPECTION", run.id))!.payload);
  const approve = async () => { const s = await state(); return service.approve(run.id, claims, { planVersion: s.current!.planVersion, fingerprint: s.current!.fingerprint, decision: "APPROVED" }); };
  const inspect = (tool = "filesystem.list", relativePath = "", query = "") => JSON.stringify({ decision: "INSPECT", tool, relativePath, query, purpose: "Inspect authentication sources", report: null });
  const inspectStructured = (tool = "filesystem.list", relativePath = "", query = "") => JSON.stringify({ ...JSON.parse(inspect(tool, relativePath, query)), recommendation: null });
  return { db, tables, ledger, folders, identity, control, executions, registry, store, runtime, evidence, collector, contexts, claims, device, request, complete, binding, responses, calls, service, newService, run, state, approve, inspect, inspectStructured };
}
