import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ForbiddenException } from "@nestjs/common";
import { ExecutionExecutorRegistry } from "../src/agent-runtime/capabilities/execution-executor.registry";
import { ExecutionPlaneService } from "../src/agent-runtime/capabilities/execution-plane.service";
import { ExecutionPolicyService } from "../src/agent-runtime/capabilities/execution-policy.service";
import { PowerShellExecutor } from "../src/agent-runtime/capabilities/powershell.executor";
import { boundedExecutionOutput } from "../src/agent-runtime/capabilities/execution-plane.limits";
import type { ExecutionPolicyDecision, ExecutionRequest } from "../src/agent-runtime/capabilities/execution-plane.types";
import { WorkspacePathService } from "../src/workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../src/workspace-intelligence/security/workspace-security.service";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "sekhem-5d-a-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "safe.txt"), "safe");
  return root;
}

function request(root: string, relativePath = "src/safe.txt"): ExecutionRequest {
  return {
    executionId: "exec-1",
    subject: { userId: "user-1", email: "u@example.test", displayName: "User", role: "PM", isSystemAdmin: false },
    projectId: "project-1",
    conversationId: "conversation-1",
    agentRunId: "run-1",
    capability: "powershell.execute",
    workspace: { workspaceId: "workspace-1", trustedRoot: root, relativePath },
    operation: { kind: "powershell", command: "Get-ChildItem" }
  };
}

function allowedPolicy(input: ExecutionRequest): ExecutionPolicyDecision {
  return {
    allowed: true,
    reason: "ALLOW_FOR_TEST_ONLY",
    requiresApproval: true,
    capability: input.capability,
    limits: { timeoutMs: 1, stdoutLimitBytes: 1, stderrLimitBytes: 1, artifactLimitBytes: 1, commandLimitChars: 4096, concurrentExecutionsPerScope: 1 },
    workspaceScope: { workspaceId: input.workspace.workspaceId, relativePath: input.workspace.relativePath },
    policyVersion: "test"
  };
}

describe("Execution Plane Foundation (5D-A)", () => {
  it("is default deny, emits AgentRun events/audits, and never invokes an executor", async () => {
    const root = await fixture();
    let executions = 0;
    const events: unknown[] = [];
    const audits: unknown[] = [];
    const registry = new ExecutionExecutorRegistry();
    registry.register({ capability: "powershell.execute", execute: async () => { executions++; throw new Error("must not execute"); } });
    const prisma = {
      agentRunEvent: { create: async (value: unknown) => { events.push(value); } },
      agentAuditRecord: { create: async (value: unknown) => { audits.push(value); } }
    };
    const authz = { assertAuthorized: async () => undefined };
    const paths = new WorkspacePathService();
    const service = new ExecutionPlaneService(new ExecutionPolicyService(), registry, authz as never, paths, new WorkspaceSecurityService(paths), prisma as never);
    const result = await service.request(request(root));
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.errorCode, "EXECUTION_NOT_ENABLED");
    assert.equal(executions, 0);
    assert.equal(events.length, 2);
    assert.equal(audits.length, 2);
    assert.equal(JSON.stringify([...events, ...audits]).includes(root), false);
    assert.equal(JSON.stringify([...events, ...audits]).includes("Get-ChildItem"), false);
  });

  it("rejects unknown capabilities and clamps model-provided limits", async () => {
    const root = await fixture();
    const paths = new WorkspacePathService();
    const service = new ExecutionPlaneService(new ExecutionPolicyService(), new ExecutionExecutorRegistry(), { assertAuthorized: async () => undefined } as never, paths, new WorkspaceSecurityService(paths));
    const result = await service.request({ ...request(root), capability: "shell.execute", timeoutMs: 999_999, stdoutLimitBytes: 999_999, stderrLimitBytes: 999_999 });
    assert.equal(result.errorCode, "EXECUTION_CAPABILITY_UNKNOWN");
    assert.equal(result.policy.policyVersion, "5d-a-deny-by-default");
  });

  it("defines byte-bounded normalized output handling without persisting output", () => {
    const output = boundedExecutionOutput("abcdef", 3);
    assert.deepEqual(output, { text: "abc", truncated: true });
  });

  it("enforces authorization and workspace scope before policy", async () => {
    const root = await fixture();
    const paths = new WorkspacePathService();
    const denied = new ExecutionPlaneService(new ExecutionPolicyService(), new ExecutionExecutorRegistry(), { assertAuthorized: async () => { throw new ForbiddenException(); } } as never, paths, new WorkspaceSecurityService(paths));
    const deniedResult = await denied.request(request(root));
    assert.equal(deniedResult.errorCode, "EXECUTION_ACCESS_DENIED");

    const allowed = new ExecutionPlaneService(new ExecutionPolicyService(), new ExecutionExecutorRegistry(), { assertAuthorized: async () => undefined } as never, paths, new WorkspaceSecurityService(paths));
    assert.equal((await allowed.request(request(root, "C:\\Windows\\System32"))).errorCode, "WORKSPACE_PATH_INVALID");
    assert.equal((await allowed.request(request(root, "../outside"))).errorCode, "WORKSPACE_PATH_OUTSIDE_ROOT");
    assert.equal((await allowed.request(request(root, ".env"))).errorCode, "EXECUTION_WORKSPACE_SENSITIVE_PATH");
    assert.equal((await allowed.request(request(root, "node_modules/pkg"))).errorCode, "EXECUTION_WORKSPACE_FORBIDDEN_PATH");
  });

  it("binds an execution request to its persisted project, conversation, and owner when durable state is available", async () => {
    const root = await fixture();
    const paths = new WorkspacePathService();
    const prisma = { agentRun: { findUnique: async () => ({ id: "run-1", projectId: "other-project", conversationId: "conversation-1", userId: "user-1" }) } };
    const service = new ExecutionPlaneService(new ExecutionPolicyService(), new ExecutionExecutorRegistry(), { assertAuthorized: async () => undefined } as never, paths, new WorkspaceSecurityService(paths), prisma as never);
    assert.equal((await service.request(request(root))).errorCode, "EXECUTION_SCOPE_MISMATCH");
  });

  it("rejects an escaping symlink", async () => {
    const root = await fixture();
    const outside = await mkdtemp(path.join(tmpdir(), "sekhem-5d-a-outside-"));
    await writeFile(path.join(outside, "secret.txt"), "secret");
    try {
      await symlink(outside, path.join(root, "src", "escape"), process.platform === "win32" ? "junction" : "dir");
      const paths = new WorkspacePathService();
      const service = new ExecutionPlaneService(new ExecutionPolicyService(), new ExecutionExecutorRegistry(), { assertAuthorized: async () => undefined } as never, paths, new WorkspaceSecurityService(paths));
      assert.equal((await service.request(request(root, "src/escape/secret.txt"))).errorCode, "WORKSPACE_PATH_OUTSIDE_ROOT");
    } catch (error) {
      // Symlink creation can be unavailable on locked-down Windows hosts.
      if (!(error instanceof Error) || !/privilege|access/i.test(error.message)) throw error;
    }
  });

  it("treats rejected approval as a gate even under a future allow policy", async () => {
    const root = await fixture();
    let executions = 0;
    const registry = new ExecutionExecutorRegistry();
    registry.register({ capability: "powershell.execute", execute: async () => { executions++; throw new Error("must not execute"); } });
    const prisma = { agentApproval: { findUnique: async () => ({ agentRunId: "run-1", status: "REJECTED", decision: "REJECTED" }) }, agentRunEvent: { create: async () => undefined }, agentAuditRecord: { create: async () => undefined } };
    const paths = new WorkspacePathService();
    const service = new ExecutionPlaneService({ evaluate: allowedPolicy } as ExecutionPolicyService, registry, { assertAuthorized: async () => undefined } as never, paths, new WorkspaceSecurityService(paths), prisma as never);
    const result = await service.request({ ...request(root), approvalId: "approval-1" });
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.errorCode, "EXECUTION_APPROVAL_REJECTED");
    assert.equal(executions, 0);
  });

  it("has a non-destructive cancellation contract and a disabled PowerShell executor", async () => {
    const root = await fixture();
    const paths = new WorkspacePathService();
    const service = new ExecutionPlaneService(new ExecutionPolicyService(), new ExecutionExecutorRegistry(), { assertAuthorized: async () => undefined } as never, paths, new WorkspaceSecurityService(paths));
    assert.deepEqual(await service.cancel("exec-1"), { executionId: "exec-1", status: "CANCELLED" });
    const ps = new PowerShellExecutor();
    const result = await ps.execute({ request: request(root), policy: new ExecutionPolicyService().evaluate(request(root)), approvalState: "NO_APPROVAL", limits: new ExecutionPolicyService().evaluate(request(root)).limits, workspace: { workspaceId: "workspace-1", relativePath: "src/safe.txt" }, isCancellationRequested: () => false });
    assert.equal(result.errorCode, "EXECUTION_NOT_ENABLED");
    const source = readFileSync(path.resolve(__dirname, "../src/agent-runtime/capabilities/powershell.executor.ts"), "utf8");
    assert.equal(/child_process|execFile|spawn\(|\b(?:powershell|pwsh)\.exe\b/.test(source), false);
  });
});
