import { RUNTIME_TOOLS, RUNTIME_LIMITS, runtimeInput, runtimePaths } from "./runtime.contract";
import type { AgentTool, ToolJsonSchema, TrustedToolWorkspace } from "../agent-runtime/tools/tool-contract";
import { toolDigest } from "../agent-runtime/tools/tool-contract";
import { win32 } from "node:path";
import { workspaceTarget } from "../workspace-intelligence/workspace-runtime.contract";

const text = (maxLength = 1024, minLength = 1): ToolJsonSchema => ({ type: "string", minLength, maxLength });
/** New exact-input versions; all existing v1 definitions and gates remain intact. */
export function runtimeToolDefinitions(existing: AgentTool[]): AgentTool[] {
  return RUNTIME_TOOLS.map(id => {
    const base = existing.find(t => t.id === (id === "filesystem.create" ? "filesystem.write" : id))!;
    const properties = id === "terminal.execute" ? { executable: text(), args: { type: "array", items: text(2048, 0), maxItems: 64 } as ToolJsonSchema,
      cwd: text(), timeoutMs: { type: "integer", minimum: 100, maximum: RUNTIME_LIMITS.timeoutMs } as ToolJsonSchema } : id === "filesystem.write"
      ? { ...base.inputSchema.properties!, content: text(RUNTIME_LIMITS.writeBytes, 0), expectedSha256: { type: "string", minLength: 64, maxLength: 64 } as ToolJsonSchema }
      : base.inputSchema.properties!;
    return { ...base, id, version: "2.0.0", description: `Exact approved ${id} on a Trusted Local Runtime.`, approvalRequirement: "REQUIRED",
      inputSchema: { type: "object", properties, required: Object.keys(properties).filter(key => key !== "expectedSha256"), additionalProperties: false } };
  });
}
export function trustedRuntimeScope(tool: AgentTool, input: Record<string, unknown>, proposed: { workspaceId: string; paths: string[] }, projectId: string, binding: TrustedToolWorkspace) {
  const g = binding.runtimeGrant!;
  if (tool.version !== "2.0.0" || g.mode !== "TRUSTED_MACHINE" || !g.capabilities.includes(tool.id) || g.projectId !== projectId ||
    binding.projectId !== projectId || proposed.workspaceId !== binding.workspaceId || (binding.runtimeWorkspace ? binding.workspaceId !== binding.runtimeWorkspace.workspaceId : binding.workspaceId !== g.grantId)) throw new Error("runtime grant scope");
  const normalized = runtimeInput(tool.id, input), paths = runtimePaths(normalized);
  if (toolDigest(normalized) !== toolDigest(input) || toolDigest([...proposed.paths].sort()) !== toolDigest(paths) || toolDigest([...binding.allowedPaths].sort()) !== toolDigest(paths)) throw new Error("runtime action scope");
  if (binding.runtimeWorkspace) {
    if (!["filesystem.list", "filesystem.read", "filesystem.search"].includes(tool.id)) throw new Error("inspection effect");
    for (const path of paths) if (workspaceTarget(binding.runtimeWorkspace.rootPath, win32.relative(binding.runtimeWorkspace.rootPath, path)).absolutePath !== path) throw new Error("inspection path");
  }
  return { allowed: true as const, scope: { workspaceId: binding.workspaceId, paths }, workspace: binding,
    pathBindingHash: toolDigest({ runtimeId: g.runtimeId, grantId: g.grantId, version: g.version, mode: g.mode, paths, ...(binding.runtimeWorkspace ? { workspace: binding.runtimeWorkspace } : {}) }) };
}
