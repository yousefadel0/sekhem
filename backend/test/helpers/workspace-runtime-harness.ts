import { ForbiddenException } from "@nestjs/common";
import { toolDigest } from "../../src/agent-runtime/tools/tool-contract";
import { ResourceAuthorizationService } from "../../src/auth/resource-authz.service";
import { ProjectAccessService } from "../../src/auth/project-access.service";
import { WorkspaceStoreService } from "../../src/workspace-intelligence/workspace-store.service";
import { WorkspaceRuntimeService } from "../../src/workspace-intelligence/workspace-runtime.service";

export function workspaceHarness() {
  const rows = new Map<string, any>(), snapshots = new Map<string, any>(), calls: any[] = [];
  let queue = Promise.resolve(), tick = 0;
  const claims: any = { sub: "user-a", organizationId: "org-a", role: "Admin", email: "", displayName: "", sessionId: "session-a", exp: Math.floor(Date.now() / 1000) + 3600 };
  const device: any = { runtimeId: "runtime-a", userId: "user-a", organizationId: "org-a", fingerprint: "a".repeat(64), displayName: "Windows test", status: "ACTIVE", lastSeenAt: new Date().toISOString() };
  const grant: any = { grantId: "grant-a", runtimeId: device.runtimeId, userId: claims.sub, organizationId: claims.organizationId, projectId: "project-a", status: "ACTIVE", version: 1, mode: "TRUSTED_MACHINE", capabilities: ["filesystem.list", "filesystem.read"], expiresAt: null };
  const db: any = {
    agentApproval: { findUnique: async () => ({ status: "PENDING", dueAt: new Date(Date.now() + 900000) }) },
    $executeRawUnsafe: async () => 1,
    auditEvent: {
      findUnique: async ({ where }: any) => structuredClone(rows.get(where.id) ?? null),
      create: async ({ data }: any) => { if (rows.has(data.id)) throw new Error("duplicate PK"); const row = { ...structuredClone(data), createdAt: ++tick }; rows.set(data.id, row); return row; },
      updateMany: async ({ where, data }: any) => { const row = rows.get(where.id); if (!row || row.module !== where.module || row.metadata.revision !== where.metadata.equals) return { count: 0 }; rows.set(where.id, { ...row, ...structuredClone(data) }); return { count: 1 }; },
      findMany: async ({ where, take }: any) => structuredClone([...rows.values()].filter(r => (typeof where.module === "string" ? r.module === where.module : !where.module.notIn.includes(r.module)) && (!where.action || r.action === where.action)).sort((a, b) => b.createdAt - a.createdAt).slice(0, take))
    },
    user: { findUnique: async ({ where }: any) => ({ id: where.id, organizationId: "org-a", status: "active" }) },
    project: { findUnique: async ({ where }: any) => ({ id: where.id, organizationId: "org-a" }) },
    conversation: { findUnique: async ({ where }: any) => ({ id: where.id, projectId: "project-a", userId: "user-a", metadata: {} }), update: async () => ({}) }
  };
  db.$transaction = async (work: any) => { const before = queue; let unlock!: () => void; queue = new Promise(resolve => { unlock = resolve }); await before;
    const snapshot = structuredClone([...rows]); try { return await work(db) } catch (error) { rows.clear(); for (const [key, value] of snapshot) rows.set(key, value); throw error } finally { unlock() } };
  const store = new WorkspaceStoreService(db), projects = new ProjectAccessService(db, new ResourceAuthorizationService(db));
  const identity: any = { devices: async () => [structuredClone(device)], ledger: { transaction: async (work: any) => work(db), read: async () => ({ payload: structuredClone(grant) }) },
    device: async () => ({ payload: structuredClone(device) }), activeGrant: async () => { calls.push({ gate: "activeGrant" }); if (grant.status !== "ACTIVE" || device.status !== "ACTIVE") throw new ForbiddenException(); return grant } };
  const control: any = { propose: async (c: any, body: any) => {
    calls.push(body); const runId = `rtrun_${toolDigest([c.sub, body.conversationId, body.requestId])}`;
    if (!snapshots.has(runId)) snapshots.set(runId, { proposal: { ...body, runId, userId: c.sub, organizationId: c.organizationId, toolId: body.tool, validatedInput: body.input, proposalId: `proposal-${runId}`, grantId: grant.grantId, grantVersion: grant.version, approvalId: `approval-${runId}`, state: "AWAITING_APPROVAL" }, execution: null });
    return { runId, proposal: snapshots.get(runId).proposal };
  }, snapshot: async (_c: any, runId: string) => structuredClone(snapshots.get(runId)) };
  const service = new WorkspaceRuntimeService(store, identity, control, projects);
  const create = (requestId = "create-one", rootPath = "D:\\Projects\\test") => service.createBinding(claims, "project-a", { runtimeId: device.runtimeId, rootPath, displayName: "test", requestId });
  const request = (b: any, kind: "VERIFY" | "LIST" | "READ", path = "", requestId = `request-${++tick}`) => service.request(claims, "project-a", b.workspaceId, kind, { bindingVersion: b.version, relativePath: path, conversationId: "conversation-a", requestId });
  const complete = (v: any, options: { text?: string; truncated?: boolean; entries?: any[]; error?: string; state?: string } = {}) => {
    const s = snapshots.get(v.operation.runId), o = v.operation, text = options.text ?? "# Hello from Windows\n";
    s.execution = { state: options.state ?? (options.error ? "FAILED" : "SUCCEEDED"), verificationState: options.error ? "FAILED" : "VERIFIED",
      attribution: { executionId: `receipt-${o.operationId}`, operationDigest: "digest", proposalId: s.proposal.proposalId, runtimeId: o.runtimeId, tool: o.tool, validatedInput: { path: o.absolutePath } },
      result: { executionId: `receipt-${o.operationId}`, operationDigest: "digest", stdout: o.tool === "filesystem.read" ? text : "", finishedAt: new Date().toISOString(), error: options.error, truncated: options.truncated ?? false,
        result: o.tool === "filesystem.read" ? { path: o.absolutePath, bytesRead: Buffer.byteLength(text), size: Buffer.byteLength(text) } : { path: o.absolutePath, entries: options.entries ?? [{ name: "HELLO.md", type: "file" }, { name: "src", type: "directory" }] } } };
  };
  const observe = (v: any) => service.operation(claims, "project-a", v.operation.workspaceId, v.operation.bindingVersion, v.operation.operationId);
  const verified = async () => { const b = await create(), op = await request(b, "VERIFY"); complete(op); await observe(op); return (await store.getBinding(b.workspaceId))! };
  return { db, rows, store, projects, service, identity, control, claims, device, grant, calls, snapshots, create, request, complete, observe, verified };
}
