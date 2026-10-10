import { Injectable } from "@nestjs/common";
import { runtimeToolDefinitions } from "../../trusted-runtime/runtime-tools";
import { TOOL_PERMISSIONS, boundedToolJson, validToolId, type AgentTool, type ToolJsonSchema, type ToolPermission, type ToolRisk } from "./tool-contract";

const text = (maxLength = 1024): ToolJsonSchema => ({ type: "string", minLength: 1, maxLength });
const object = (properties: Record<string, ToolJsonSchema>): ToolJsonSchema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const list = (maxItems: number): ToolJsonSchema => ({ type: "array", items: text(), maxItems });
const output = object({ status: { ...text(32), enum: ["NOT_EXECUTED"] } });
// One registry-owned source for reserved risk floors, including future IDs.
const riskDefaults: Readonly<Record<string, ToolRisk>> = Object.freeze({
  "filesystem.list": "LOW", "filesystem.read": "LOW", "filesystem.search": "LOW",
  "filesystem.write": "MEDIUM", "filesystem.delete": "HIGH", "filesystem.move": "MEDIUM", "filesystem.copy": "MEDIUM",
  "terminal.execute": "HIGH", "git.status": "LOW", "git.diff": "LOW", "git.log": "LOW", "git.branch": "LOW",
  "git.checkout": "MEDIUM", "git.add": "MEDIUM", "git.commit": "MEDIUM", "git.push": "HIGH",
  "package.install": "HIGH", "process.kill": "HIGH"
});
const approvalRequired = (permissions: readonly ToolPermission[], risk: ToolRisk) =>
  risk !== "LOW" || permissions.some(p => !["filesystem.read", "git.read"].includes(p));
const definitions = (): AgentTool[] => {
  const tool = (id: string, permissions: ToolPermission[], properties: Record<string, ToolJsonSchema>, pathFields: string[], expectation: string): AgentTool => {
    const riskLevel = riskDefaults[id];
    const category = id.startsWith("filesystem.") ? "FILESYSTEM" : id.startsWith("git.") ? "GIT" : "TERMINAL";
    return { id, version: "1.0.0", category,
      description: `Propose ${id}; definition only, no execution implementation.`, inputSchema: object(properties), outputSchema: output,
      requiredPermissions: permissions, riskLevel, scopeRequirements: { kind: "WORKSPACE", wholeWorkspace: category !== "FILESYSTEM" },
      approvalRequirement: approvalRequired(permissions, riskLevel) ? "REQUIRED" : "NOT_REQUIRED",
      executionMode: "DEFINITION_ONLY", executionCapability: "UNAVAILABLE", verificationExpectations: [expectation],
      supportsDryRun: false, reversible: false, pathFields };
  };
  return [
    ...["list", "read"].map(id => tool(`filesystem.${id}`, ["filesystem.read"], { path: text() }, ["path"], "Observe bounded evidence from the authorized path with its provenance.")),
    tool("filesystem.search", ["filesystem.read"], { path: text(), query: text(512) }, ["path"], "Observe bounded matches and their in-scope source paths."),
    tool("filesystem.write", ["filesystem.write"], { path: text(), content: { type: "string", maxLength: 16384 } }, ["path"], "Observe target content matching the approved change and a diff within scope."),
    tool("filesystem.delete", ["filesystem.delete"], { path: text() }, ["path"], "Observe the approved target's absence and confirm the deletion stayed within scope."),
    tool("filesystem.move", ["filesystem.read", "filesystem.write", "filesystem.delete"], { source: text(), destination: text() }, ["source", "destination"], "Observe source absence and matching destination content within the approved paths."),
    tool("filesystem.copy", ["filesystem.read", "filesystem.write"], { source: text(), destination: text() }, ["source", "destination"], "Observe matching destination content and unchanged source content within scope."),
    tool("terminal.execute", ["terminal.execute"], { cwd: text(), command: text(4096) }, ["cwd"], "Observe bounded process results and separately verify the requested outcome; exit alone is not proof."),
    ...["status", "diff", "log"].map(id => tool(`git.${id}`, ["git.read"], { cwd: text() }, ["cwd"], "Observe bounded repository evidence tied to the authorized workspace and revision.")),
    // Branch is explicitly inspection-only. Creating/switching a branch uses a future version.
    tool("git.branch", ["git.read"], { cwd: text() }, ["cwd"], "Observe branch information without changing repository state."),
    tool("git.checkout", ["git.write"], { cwd: text(), ref: text(256) }, ["cwd"], "Observe the selected revision and confirm workspace changes match the approved checkout."),
    tool("git.add", ["git.write"], { cwd: text(), paths: list(32) }, ["cwd", "paths"], "Observe the staged diff and confirm every affected path was approved."),
    tool("git.commit", ["git.write"], { cwd: text(), message: text(1024) }, ["cwd"], "Observe the created commit and confirm its diff matches the approved staged changes."),
    tool("git.push", ["git.write"], { cwd: text(), remote: text(128), ref: text(256) }, ["cwd"], "Observe the approved remote ref outcome; do not infer success from authorization.")
  ];
};
function freeze<T>(v: T): T {
  if (v && typeof v === "object") { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, AgentTool>();
  private readonly runtimeTools: readonly AgentTool[];
  constructor() { definitions().forEach(tool => this.register(tool)); this.runtimeTools = freeze(runtimeToolDefinitions(this.list())); }
  register(tool: AgentTool): void {
    if (!boundedToolJson(tool) || !validToolId(tool.id) || !/^\d+\.\d+\.\d+$/.test(tool.version) || tool.executionMode !== "DEFINITION_ONLY" ||
      !["LOW", "MEDIUM", "HIGH"].includes(tool.riskLevel) || !Array.isArray(tool.requiredPermissions) || !tool.requiredPermissions.length ||
      tool.inputSchema?.type !== "object" || tool.inputSchema.additionalProperties !== false ||
      tool.outputSchema?.type !== "object" || tool.outputSchema.additionalProperties !== false ||
      typeof tool.supportsDryRun !== "boolean" || typeof tool.reversible !== "boolean" ||
      tool.requiredPermissions.some(p => !TOOL_PERMISSIONS.includes(p)) || !Array.isArray(tool.pathFields) || !tool.pathFields.length ||
      tool.pathFields.some(p => !tool.inputSchema.properties?.[p]) || "execute" in tool ||
      !["FILESYSTEM", "GIT", "TERMINAL"].includes(tool.category) || !tool.description?.trim() ||
      tool.executionCapability !== "UNAVAILABLE" || tool.scopeRequirements?.kind !== "WORKSPACE" ||
      typeof tool.scopeRequirements.wholeWorkspace !== "boolean" || (tool.category !== "FILESYSTEM" && !tool.scopeRequirements.wholeWorkspace) ||
      !["REQUIRED", "NOT_REQUIRED"].includes(tool.approvalRequirement) ||
      (approvalRequired(tool.requiredPermissions, tool.riskLevel) && tool.approvalRequirement !== "REQUIRED") ||
      !Array.isArray(tool.verificationExpectations) || !tool.verificationExpectations.length || tool.verificationExpectations.length > 8 ||
      tool.verificationExpectations.some(v => typeof v !== "string" || !v.trim() || v.length > 512) ||
      (riskDefaults[tool.id] && ["LOW", "MEDIUM", "HIGH"].indexOf(tool.riskLevel) < ["LOW", "MEDIUM", "HIGH"].indexOf(riskDefaults[tool.id]))) throw new Error("INVALID_TOOL_DEFINITION");
    if (this.tools.has(tool.id)) throw new Error("DUPLICATE_TOOL");
    this.tools.set(tool.id, freeze(structuredClone(tool)));
  }
  has(id: string): boolean { return this.tools.has(id); }
  get(id: string): AgentTool | undefined { return this.tools.get(id); }
  list(): AgentTool[] { return [...this.tools.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
  resolve(id: string, version?: string): AgentTool {
    if (version === "2.0.0") { const runtime = this.runtimeTools.find(tool => tool.id === id); if (runtime) return runtime; }
    const tool = this.get(id);
    if (!tool || (version !== undefined && version !== tool.version)) throw new Error("INVALID_TOOL");
    return tool;
  }
}
