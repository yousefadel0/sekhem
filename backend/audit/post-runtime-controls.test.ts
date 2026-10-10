import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { PrismaService } from "../src/data-access/prisma.service";
import { RuntimeLedgerService } from "../src/trusted-runtime/runtime-ledger.service";
import { RuntimeIdentityService } from "../src/trusted-runtime/runtime-identity.service";
import { RuntimeControlService, executionIdentity } from "../src/trusted-runtime/runtime-control.service";
import { RuntimeExecutionService } from "../src/trusted-runtime/runtime-execution.service";
import { RUNTIME_TOOLS, runtimePaths, runtimeSigningText, runtimeKey, type RuntimeProposal, type RuntimeExecution, type RuntimeResult } from "../src/trusted-runtime/runtime.contract";
import { ToolRegistryService } from "../src/agent-runtime/tools/tool-registry.service";
import { ToolScopeService } from "../src/agent-runtime/tools/tool-scope.service";
import { ToolPermissionService } from "../src/agent-runtime/tools/tool-permission.service";
import { ToolRiskService } from "../src/agent-runtime/tools/tool-risk.service";
import { ToolApprovalService } from "../src/agent-runtime/tools/tool-approval.service";
import { ToolAuthorizationService } from "../src/agent-runtime/tools/tool-authorization.service";
import { ResourceAuthorizationService } from "../src/auth/resource-authz.service";
import { AuditService } from "../src/audit/audit.service";
import { WorkspaceSourceResolver } from "../src/agent-runtime/capabilities/workspace-source.resolver";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";
import { performRuntimeOperation } from "../src/trusted-runtime/runtime-operations";
import type { SessionClaims } from "../src/auth/auth.dto";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";

// Opt-in real PostgreSQL fixtures. No DDL, migrations, seed changes or provider calls.
test("post-implementation audit: real PostgreSQL runtime controls", { skip: process.env.SEKHEM_RUNTIME_DB_TEST !== "1", timeout: 120000 }, async t => {
  if (!process.env.DATABASE_URL) { const line = readFileSync(".env", "utf8").split(/\r?\n/).find(l => l.startsWith("DATABASE_URL=")); if (line) process.env.DATABASE_URL = line.slice(13).replace(/^['"]|['"]$/g, ""); }
  const db = new PrismaService(), prefix = `runtime-test-${randomUUID()}`, ids = new Set<string>();
  class TestLedger extends RuntimeLedgerService {
    override transaction<T>(work: (tx: any) => Promise<T>) { return super.transaction(tx => work(new Proxy(tx, { get(target, key) {
      if (key !== "auditEvent") return target[key];
      return new Proxy(target.auditEvent, { get(delegate, method) { if (method !== "create") return delegate[method]; return async (arg: any) => { const row = await delegate.create(arg); ids.add(row.id); return row; }; } });
    } }))); }
  }
  const ledger = new TestLedger(db), identity = new RuntimeIdentityService(ledger), resources = new ResourceAuthorizationService(db), audit = new AuditService({} as any, db);
  const registry = new ToolRegistryService(), paths = new WorkspacePathService(), scopes = new ToolScopeService(new WorkspaceSourceResolver(), paths, new WorkspaceSecurityService(paths));
  const approvals = new ToolApprovalService(resources, audit), gate = new ToolAuthorizationService(registry, scopes, new ToolPermissionService(resources), new ToolRiskService(), approvals, resources, audit, db);
  const control = new RuntimeControlService(ledger, identity, gate, approvals, registry), executions = new RuntimeExecutionService(ledger, identity, control);
  const claims: SessionClaims = { sub: `${prefix}-user`, email: `${prefix}@example.invalid`, displayName: "Runtime test", organizationId: `${prefix}-org`, role: "PM", sessionId: `${prefix}-session`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 };
  const projectId = `${prefix}-project`;
  async function device() {
    const key = generateKeyPairSync("ed25519"), publicKey = String(key.publicKey.export({ type: "spki", format: "pem" })), enrollment = await identity.enrollment(publicKey, "1.0.0"), timestamp = new Date().toISOString();
    await identity.proveEnrollment(enrollment.code, timestamp, sign(null, Buffer.from(runtimeSigningText(enrollment.challenge, timestamp)), key.privateKey).toString("base64"));
    const d = await identity.enroll(claims, enrollment.code, "Isolated runtime fixture");
    async function auth(operation: string, body: unknown = {}) { const c = await identity.challenge(d.runtimeId, operation, body), ts = new Date().toISOString(); return { runtimeId: d.runtimeId, connectionEpoch: c.connectionEpoch, challengeId: c.challengeId, timestamp: ts, signature: sign(null, Buffer.from(runtimeSigningText(c, ts)), key.privateKey).toString("base64") }; }
    const request = async (op: "connect" | "poll" | "started" | "heartbeat" | "result", body: any = {}) => executions.request(op, body, await auth(op, body));
    await request("connect"); await identity.grant(claims, d.runtimeId, projectId, [...RUNTIME_TOOLS]);
    return { ...d, key, enrollment, auth, request };
  }
  async function proposal(d: Awaited<ReturnType<typeof device>>, approved = true, override: Record<string, unknown> = {}) {
    const conversationId = `${prefix}-conv-${randomUUID()}`; await db.conversation.create({ data: { id: conversationId, userId: claims.sub, projectId, title: "Runtime isolated test" } });
    const body = { conversationId, projectId, runtimeId: d.runtimeId, tool: "terminal.execute" as const, input: { executable: process.execPath, args: ["--version"], cwd: process.cwd(), timeoutMs: 10000 }, purpose: "Read real Node version", requestId: randomUUID() };
    Object.assign(body, override);
    const p = await control.propose(claims, body); if (approved) await control.approve(claims, p.runId, p.proposal.approvalFingerprint!, "APPROVED"); return { ...p, body };
  }
  async function mutate(p: { runId: string }, change: (p: RuntimeProposal) => RuntimeProposal) { await ledger.transaction(async tx => { const row = (await ledger.read<RuntimeProposal>(tx, "RUNTIME_PROPOSAL", p.runId))!; await ledger.update(tx, row, change(row.payload)); }); }
  try {
    const role = await db.role.findUnique({ where: { key: "PM" } }); assert.ok(role, "Existing PM role is required; test does not seed roles");
    await db.organization.create({ data: { id: claims.organizationId, slug: prefix, name: "Isolated runtime test" } });
    await db.user.create({ data: { id: claims.sub, email: claims.email, displayName: claims.displayName, organizationId: claims.organizationId, roles: { create: { roleId: role.id } } } });
    await db.userSession.create({ data: { id: claims.sessionId, userId: claims.sub, tokenHash: prefix, expiresAt: new Date(claims.exp * 1000) } });
    await db.project.create({ data: { id: projectId, slug: prefix, name: prefix, customerFacingName: prefix, status: "active", phase: "test", platform: "local", organizationId: claims.organizationId, members: { create: { userId: claims.sub, role: "PM" } } } });
    await t.test("deterministic fingerprint reservation and duplicate enrollment", async () => { const d = await device(); const again = await identity.enroll(claims, d.enrollment.code, "Repeat"); assert.equal(again.runtimeId, d.runtimeId); assert.equal(await db.auditEvent.count({ where: { id: d.runtimeId } }), 1); });
    await t.test("invalid signatures, replay, expired timestamp and stale epoch reject", async () => {
      const d = await device(), signed = await d.auth("poll");
      await assert.rejects(executions.request("poll", {}, { ...signed, signature: "A".repeat(86) + "==" }), /SIGNATURE/);
      await executions.request("poll", {}, signed); await assert.rejects(executions.request("poll", {}, signed), /REPLAY/);
      const expired = await d.auth("poll"); await assert.rejects(executions.request("poll", {}, { ...expired, timestamp: new Date(0).toISOString() }), /SIGNATURE/);
      const stale = await d.auth("poll"); await d.request("connect"); await assert.rejects(executions.request("poll", {}, stale), /STALE/);
    });
    await t.test("revoked and disabled devices cannot authenticate or re-enroll", async () => { for (const state of ["REVOKED", "DISABLED"] as const) { const d = await device(), signed = await d.auth("poll"); await identity.setDeviceStatus(claims, d.runtimeId, state); await assert.rejects(executions.request("poll", {}, signed), /REVOKED/); await assert.rejects(identity.enroll(claims, d.enrollment.code, "Repeat"), /RESERVED/); } });
    await t.test("grant lifecycle is versioned and enrollment grants no implicit authority", async () => { const d = await device(); const g = await identity.revokeGrant(claims, d.runtimeId, projectId); assert.equal(g.version, 2); await assert.rejects(proposal(d), /GRANT_INVALID/); const next = await identity.grant(claims, d.runtimeId, projectId, ["filesystem.read"]); assert.equal(next.version, 3); await assert.rejects(proposal(d), /CAPABILITY/); });
    await t.test("expired challenge rejects a valid signature without consuming authentication", async () => {
      const d = await device(), fresh = await identity.challenge(d.runtimeId, "poll", {}), nonce = randomUUID();
      const expired = { ...fresh, nonce, challengeId: runtimeKey("RUNTIME_CHALLENGE", nonce), expiresAt: new Date(0).toISOString() };
      await ledger.transaction(tx => ledger.create(tx, "RUNTIME_CHALLENGE", nonce, expired));
      const timestamp = new Date().toISOString();
      await assert.rejects(executions.request("poll", {}, { runtimeId: d.runtimeId, connectionEpoch: expired.connectionEpoch, challengeId: expired.challengeId, timestamp,
        signature: sign(null, Buffer.from(runtimeSigningText(expired, timestamp)), d.key.privateKey).toString("base64") }), /CHALLENGE_INVALID/);
      assert.equal(await ledger.transaction(tx => ledger.read(tx, "RUNTIME_AUTH_CONSUMPTION", expired.challengeId)), null);
    });
    await t.test("project membership, organization, ownership and session remain required", async () => {
      const d = await device(); await assert.rejects(identity.grant({ ...claims, organizationId: "wrong-org" }, d.runtimeId, projectId, ["filesystem.read"]));
      await db.projectMember.delete({ where: { projectId_userId: { projectId, userId: claims.sub } } }); await assert.rejects(proposal(d));
      await db.projectMember.create({ data: { projectId, userId: claims.sub, role: "PM" } });
      await db.userSession.update({ where: { id: claims.sessionId }, data: { revokedAt: new Date() } }); await assert.rejects(proposal(d), /SESSION_INVALID/);
      await db.userSession.update({ where: { id: claims.sessionId }, data: { revokedAt: null } });
    });
    await t.test("no approval produces no dispatch or permit", async () => { const d = await device(), p = await proposal(d, false); assert.equal((await d.request("poll") as any).execution, null); assert.equal(await ledger.transaction(tx => ledger.read(tx, "RUNTIME_PERMIT_CONSUMPTION", executionIdentity(p.proposal).intentId)), null); });
    await t.test("exact duplicate proposal returns same intent; conflicting reuse rejects", async () => { const d = await device(), p = await proposal(d); assert.equal((await control.propose(claims, p.body)).runId, p.runId); await assert.rejects(control.propose(claims, { ...p.body, input: { ...p.body.input, args: ["different"] } }), /CONFLICT/); });
    await t.test("two concurrent pollers consume one permit and dispatch once", async () => {
      const d = await device(), p = await proposal(d), [a, b] = await Promise.all([d.auth("poll"), d.auth("poll")]);
      const results = await Promise.all([executions.request("poll", {}, a), executions.request("poll", {}, b)]) as any[];
      assert.equal(results.filter(r => r.execution).length, 1); const id = runtimeKey("RUNTIME_PERMIT_CONSUMPTION", executionIdentity(p.proposal).intentId); assert.equal(await db.auditEvent.count({ where: { id } }), 1); assert.equal((await d.request("poll") as any).execution, null);
    });
    for (const [name, change] of [
      ["wrong runtime", (p: RuntimeProposal) => ({ ...p, runtimeId: "other" })], ["wrong grant", (p: RuntimeProposal) => ({ ...p, grantId: "other" })],
      ["wrong project", (p: RuntimeProposal) => ({ ...p, projectId: "other" })], ["changed input", (p: RuntimeProposal) => ({ ...p, validatedInput: { ...p.validatedInput, args: ["changed"] } })],
      ["changed digest", (p: RuntimeProposal) => ({ ...p, proposalDigest: "a".repeat(64) })], ["stale proposal", (p: RuntimeProposal) => ({ ...p, grantVersion: p.grantVersion + 1 })],
    ] as const) await t.test(`${name} rejects before permit`, async () => { const d = await device(), p = await proposal(d); await mutate(p, change); assert.equal((await d.request("poll") as any).rejected, true); assert.equal(await ledger.transaction(tx => ledger.read(tx, "RUNTIME_EXECUTION", executionIdentity(p.proposal).intentId)), null); });
    await t.test("stale plan and invalid approval reject", async () => { for (const target of ["plan", "approval"]) { const d = await device(), p = await proposal(d); if (target === "plan") await db.agentRun.update({ where: { id: p.runId }, data: { planVersion: 2 } }); else await db.agentApproval.update({ where: { id: p.proposal.approvalId! }, data: { status: "DENIED" } }); assert.equal((await d.request("poll") as any).rejected, true); } });
    await t.test("revocation race serializes and grant revocation before dispatch denies", async () => {
      const d = await device(); await proposal(d); const a = await d.auth("poll");
      const [g, poll] = await Promise.all([identity.revokeGrant(claims, d.runtimeId, projectId), executions.request("poll", {}, a)]);
      assert.equal(g.status, "REVOKED");
      // Either transaction may win the lock. Dispatch committed before revocation
      // still cannot start afterward: the one-time acknowledgement rechecks grant.
      const e = (poll as any).execution as RuntimeExecution | undefined;
      if (e) {
        const started = await d.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest }) as any;
        assert.equal(started.execute, false); assert.equal(started.state, "CANCELLED");
      } else assert.equal((poll as any).rejected, true);
      const revokedFirst = await device(); await proposal(revokedFirst);
      await identity.revokeGrant(claims, revokedFirst.runtimeId, projectId);
      assert.equal((await revokedFirst.request("poll") as any).execution ?? null, null);
    });
    await t.test("start acknowledgement is one-time, result is idempotent, conversation deletion retains attribution/result", async () => {
      const d = await device(), p = await proposal(d), e = (await d.request("poll") as any).execution as RuntimeExecution, body = { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest };
      assert.equal((await d.request("started", body) as any).execute, true); assert.equal((await d.request("started", body) as any).execute, false);
      const result = await performRuntimeOperation(e.attribution); assert.equal(result.state, "SUCCEEDED");
      assert.equal((await d.request("result", result) as any).state, "SUCCEEDED"); assert.equal((await d.request("result", result) as any).duplicate, true);
      await assert.rejects(d.request("result", { ...result, stdout: "conflicting" }), /CONFLICT/);
      await db.conversation.delete({ where: { id: p.body.conversationId } }); assert.equal(await db.agentRun.findUnique({ where: { id: p.runId } }), null);
      const kept = (await control.snapshot(claims, p.runId))!.execution!; assert.deepEqual(kept.attribution, e.attribution); assert.deepEqual(kept.result, result); assert.equal(kept.verificationState, "VERIFIED"); assert.ok(kept.verifiedAt && kept.finishedAt);
    });
    await t.test("live output is bounded, persisted, unverified and restricted to the assigned runtime", async () => {
      const d = await device(), other = await device(), p = await proposal(d), e = (await d.request("poll") as any).execution as RuntimeExecution;
      const body = { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest };
      await assert.rejects(other.request("started", body), /ATTRIBUTION_INVALID/);
      await d.request("started", body);
      await d.request("heartbeat", { ...body, output: { stdout: "actual partial output", stderr: "actual partial error" } });
      const snapshot = (await control.snapshot(claims, p.runId))!.execution!;
      assert.deepEqual(snapshot.output, { stdout: "actual partial output", stderr: "actual partial error" });
      assert.equal(snapshot.state, "RUNNING"); assert.equal(snapshot.verificationState, "PENDING"); assert.equal(snapshot.result, null);
      await assert.rejects(d.request("heartbeat", { ...body, output: { stdout: "x".repeat(65537), stderr: "" } }), /OUTPUT_LIMIT/);
      assert.equal(toolDigest((await control.snapshot(claims, p.runId))!.execution!.output), toolDigest(snapshot.output));
    });
    await t.test("AgentRun deletion before result leaves durable execution independently usable", async () => {
      const d = await device(), p = await proposal(d), e = (await d.request("poll") as any).execution as RuntimeExecution;
      await d.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest }); await db.agentRun.delete({ where: { id: p.runId } });
      const result = await performRuntimeOperation(e.attribution); assert.equal((await d.request("result", result) as any).state, "SUCCEEDED"); assert.ok((await control.snapshot(claims, p.runId))?.execution?.result);
    });
    await t.test("reconnect and lost heartbeat mark unknown and never replay", async () => {
      for (const recovery of ["connect", "heartbeat"]) { const d = await device(), p = await proposal(d); await d.request("poll");
        if (recovery === "connect") await d.request("connect"); else { await ledger.transaction(async tx => { const row = (await ledger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", executionIdentity(p.proposal).intentId))!; await ledger.update(tx, row, { ...row.payload, lastSeenAt: new Date(0).toISOString() }); }); await executions.reconcile(); }
        assert.equal((await control.snapshot(claims, p.runId))?.execution?.state, "OUTCOME_UNKNOWN"); assert.equal((await d.request("poll") as any).execution, null);
      }
    });
    await t.test("cancel before dispatch and cancel before start never execute", async () => { for (const dispatched of [false, true]) { const d = await device(), p = await proposal(d); const e = dispatched ? (await d.request("poll") as any).execution as RuntimeExecution : null; await control.cancel(claims, p.runId); if (e) assert.equal((await d.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest }) as any).execute, false); else assert.equal((await d.request("poll") as any).execution, null); } });
    await t.test("execution attribution immutable and failed deterministic verification cannot succeed", async () => {
      const d = await device(), p = await proposal(d), e = (await d.request("poll") as any).execution as RuntimeExecution;
      await assert.rejects(ledger.transaction(async tx => { const row = (await ledger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", executionIdentity(p.proposal).intentId))!; await ledger.update(tx, row, { ...row.payload, attribution: { ...row.payload.attribution, tool: "filesystem.delete" } }); }), /IMMUTABLE/);
      await d.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest });
      const r = await performRuntimeOperation(e.attribution); assert.equal((await d.request("result", { ...r, exitCode: 1 }) as any).state, "FAILED");
    });

    // Supplemental audit probes; no production code or existing test is altered.
    function reseal(p: RuntimeProposal) {
      const { proposalId, proposalDigest, preview, approvalId, approvalFingerprint, state,
        authorizingSessionId, authorizingIssuedAt, authorizingExpiresAt, ...immutable } = p;
      return { ...p, proposalDigest: toolDigest(immutable) };
    }
    for (const [field, value] of [["executable", "other-program"], ["args", ["--help"]], ["cwd", tmpdir()]] as const) {
      await t.test(`audit: changed ${field} with recomputed digests cannot reuse approval`, async () => {
        const d = await device(), p = await proposal(d);
        await mutate(p, old => { const validatedInput = { ...old.validatedInput, [field]: value };
          const scope = { ...old.scope, paths: runtimePaths(validatedInput) };
          return reseal({ ...old, validatedInput, inputDigest: toolDigest(validatedInput), scope, scopeDigest: toolDigest(scope) }); });
        assert.equal((await d.request("poll") as any).rejected, true);
        assert.equal(await ledger.transaction(tx => ledger.read(tx, "RUNTIME_PERMIT_CONSUMPTION", executionIdentity(p.proposal).intentId)), null);
      });
    }
    await t.test("audit: changed filesystem target with recomputed digests cannot reuse approval", async () => {
      const d = await device(), p = await proposal(d, true, { tool: "filesystem.create", input: { path: join(tmpdir(), prefix + "-original.txt"), content: "audit" } });
      await mutate(p, old => { const validatedInput = { ...old.validatedInput, path: join(tmpdir(), prefix + "-changed.txt") };
        const scope = { ...old.scope, paths: runtimePaths(validatedInput) };
        return reseal({ ...old, validatedInput, inputDigest: toolDigest(validatedInput), scope, scopeDigest: toolDigest(scope) }); });
      assert.equal((await d.request("poll") as any).rejected, true);
    });
    await t.test("audit: stale approval rejects before dispatch", async () => {
      const d = await device(), p = await proposal(d);
      await db.agentApproval.update({ where: { id: p.proposal.approvalId! }, data: { dueAt: new Date(0) } });
      assert.equal((await d.request("poll") as any).rejected, true);
      assert.equal(await ledger.transaction(tx => ledger.read(tx, "RUNTIME_PERMIT_CONSUMPTION", executionIdentity(p.proposal).intentId)), null);
    });
    await t.test("audit: runtime revoked after approval rejects dispatch", async () => {
      const d = await device(), p = await proposal(d), signed = await d.auth("poll");
      await identity.setDeviceStatus(claims, d.runtimeId, "REVOKED");
      await assert.rejects(executions.request("poll", {}, signed), /REVOKED/);
      assert.equal(await ledger.transaction(tx => ledger.read(tx, "RUNTIME_EXECUTION", executionIdentity(p.proposal).intentId)), null);
    });
    await t.test("audit: expired permit cannot start or replay", async () => {
      const d = await device(), p = await proposal(d);
      await db.agentApproval.update({ where: { id: p.proposal.approvalId! }, data: { dueAt: new Date(Date.now() + 2000) } });
      const e = (await d.request("poll") as any).execution as RuntimeExecution; assert.ok(e);
      await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(e.attribution.permitExpiresAt) - Date.now() + 50)));
      const ack = await d.request("started", { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest }) as any;
      assert.equal(ack.execute, false); assert.equal(ack.state, "OUTCOME_UNKNOWN");
      assert.equal((await d.request("poll") as any).execution, null);
    });
    await t.test("audit: paused originating run rejects dispatch through canonical gate", async () => {
      const d = await device(), p = await proposal(d);
      await db.agentRun.update({ where: { id: p.runId }, data: { status: "PAUSED" } });
      assert.equal((await d.request("poll") as any).rejected, true);
    });
    await t.test("audit: transaction failure rolls back dispatch and permit before transport returns", async () => {
      const d = await device(), p = await proposal(d), signed = await d.auth("poll");
      const normalTransaction = ledger.transaction.bind(ledger);
      ledger.transaction = ((work: any) => normalTransaction(async tx => { await work(tx); throw new Error("AUDIT_INJECTED_ROLLBACK"); })) as any;
      try { await assert.rejects(executions.request("poll", {}, signed), /AUDIT_INJECTED_ROLLBACK/); }
      finally { ledger.transaction = normalTransaction; }
      for (const type of ["RUNTIME_EXECUTION", "RUNTIME_PERMIT_CONSUMPTION"] as const)
        assert.equal(await ledger.transaction(tx => ledger.read(tx, type, executionIdentity(p.proposal).intentId)), null);
      assert.equal(await ledger.transaction(tx => ledger.read(tx, "RUNTIME_AUTH_CONSUMPTION", signed.challengeId)), null);
    });
    await t.test("audit: duplicate concurrent dispatch and starts perform exactly one real file mutation", async () => {
      const directory = await mkdtemp(join(tmpdir(), "sekhem-post-audit-")), path = join(directory, "once.txt");
      try {
        const d = await device(), p = await proposal(d, true, { tool: "filesystem.create", input: { path, content: "ONE AUTHORIZED MUTATION" } });
        const polls = await Promise.all([d.auth("poll"), d.auth("poll")]);
        const responses = await Promise.all(polls.map(auth => executions.request("poll", {}, auth))) as any[];
        assert.equal(responses.filter(r => r.execution).length, 1);
        const e = responses.find(r => r.execution).execution as RuntimeExecution;
        const body = { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest };
        const started = await Promise.all([d.auth("started", body), d.auth("started", body)]);
        const acks = await Promise.all(started.map(auth => executions.request("started", body, auth))) as any[];
        let mutations = 0;
        for (const ack of acks) if (ack.execute && !ack.cancel) {
          mutations++; const result = await performRuntimeOperation(e.attribution);
          assert.equal(result.state, "SUCCEEDED");
          assert.equal((await d.request("result", result) as any).state, "SUCCEEDED");
          assert.equal((await d.request("result", result) as any).duplicate, true);
        }
        assert.equal(mutations, 1); assert.equal(await readFile(path, "utf8"), "ONE AUTHORIZED MUTATION");
        assert.equal(await db.auditEvent.count({ where: { id: runtimeKey("RUNTIME_PERMIT_CONSUMPTION", executionIdentity(p.proposal).intentId) } }), 1);
        assert.equal((await d.request("poll") as any).execution, null);
        await db.conversation.delete({ where: { id: p.body.conversationId } });
        assert.equal(await db.agentRun.findUnique({ where: { id: p.runId } }), null);
        const freshLedger = new RuntimeLedgerService(db);
        const retained = await freshLedger.transaction(tx => freshLedger.read<RuntimeExecution>(tx, "RUNTIME_EXECUTION", executionIdentity(p.proposal).intentId));
        assert.deepEqual(retained!.payload.attribution, e.attribution);
        assert.equal(retained!.payload.state, "SUCCEEDED"); assert.equal(retained!.payload.verificationState, "VERIFIED");
        assert.equal(retained!.payload.result!.verificationResult.exists, true);
      } finally { await rm(path, { force: true }); await rmdir(directory); }
    });
    await t.test("audit: signed result cannot skip start acknowledgement", async () => {
      const d = await device(), p = await proposal(d), e = (await d.request("poll") as any).execution as RuntimeExecution;
      const now = new Date().toISOString();
      const forged: RuntimeResult = { executionId: e.attribution.executionId, operationDigest: e.attribution.operationDigest,
        state: "SUCCEEDED", startedAt: now, finishedAt: now, durationMs: 0, pid: 1, exitCode: 0, stdout: "", stderr: "",
        result: {}, error: null, truncated: false, verificationState: "VERIFIED", verificationResult: { exitCode: 0 } };
      await assert.rejects(d.request("result", forged), /NOT_STARTED/);
      assert.equal((await control.snapshot(claims, p.runId))!.execution!.result, null);
    });
    await t.test("audit: persisted fixture runtime records contain no private key", async () => {
      const rows = await db.auditEvent.findMany({ where: { id: { in: [...ids] } }, select: { metadata: true } });
      assert.doesNotMatch(JSON.stringify(rows), /PRIVATE KEY|privateKey/);
    });

  } finally {
    // Delete only this test's exact owned fixtures, never shared seed/application data.
    await db.conversation.deleteMany({ where: { userId: claims.sub } });
    await db.projectMember.deleteMany({ where: { userId: claims.sub } }); await db.project.deleteMany({ where: { id: projectId } });
    await db.userSession.deleteMany({ where: { userId: claims.sub } }); await db.userRole.deleteMany({ where: { userId: claims.sub } }); await db.user.deleteMany({ where: { id: claims.sub } }); await db.organization.deleteMany({ where: { id: claims.organizationId } });
    await db.auditEvent.deleteMany({ where: { id: { in: [...ids] } } }); await db.$disconnect();
  }
});
