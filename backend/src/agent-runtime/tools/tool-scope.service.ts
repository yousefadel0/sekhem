import { Inject, Injectable } from "@nestjs/common";
import { trustedRuntimeScope } from "../../trusted-runtime/runtime-tools";
import { lstatSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { WorkspaceSourceResolver } from "../capabilities/workspace-source.resolver";
import { WorkspacePathService } from "../../workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../../workspace-intelligence/security/workspace-security.service";
import { TOOL_PERMISSIONS, toolDigest, validToolId, type AgentTool, type ToolBlockCode, type ToolScope, type TrustedToolWorkspace } from "./tool-contract";

export type ToolScopeResult = { allowed: true; scope: ToolScope; workspace: TrustedToolWorkspace; pathBindingHash: string } | { allowed: false; code: ToolBlockCode };
@Injectable()
export class ToolScopeService {
  constructor(
    @Inject(WorkspaceSourceResolver) private readonly resolver: WorkspaceSourceResolver,
    @Inject(WorkspacePathService) private readonly paths: WorkspacePathService,
    @Inject(WorkspaceSecurityService) private readonly security: WorkspaceSecurityService
  ) {}
  validate(tool: AgentTool, input: Record<string, unknown>, proposed: ToolScope, projectId: string, binding?: TrustedToolWorkspace): ToolScopeResult {
    if (binding?.runtimeGrant) {
      try { return trustedRuntimeScope(tool, input, proposed, projectId, binding); }
      catch { return { allowed: false, code: "SCOPE_VIOLATION" }; }
    }
    if (tool.version === "2.0.0") return { allowed: false, code: "INSUFFICIENT_SCOPE" };
    if (!binding?.trustedRoot || !binding.workspaceId || !binding.allowedPaths?.length) return { allowed: false, code: "INSUFFICIENT_SCOPE" };
    if (binding.projectId !== projectId || proposed.workspaceId !== binding.workspaceId) return { allowed: false, code: "SCOPE_VIOLATION" };
    try {
      if (!validToolId(binding.workspaceId) || binding.allowedPaths.length > 32 || !Array.isArray(binding.permissions) ||
        binding.permissions.some(p => !TOOL_PERMISSIONS.includes(p))) throw new Error("scope");
      const trusted = this.resolver.resolveLocal({ workspaceId: binding.workspaceId, projectId, name: projectId, trustedRoot: binding.trustedRoot,
        ...(binding.authorizedRoots !== undefined ? { authorizedRoots: binding.authorizedRoots } : {}) });
      if (!lstatSync(trusted.trustedRoot).isDirectory()) throw new Error("root");
      const allowedPaths = [...new Set(binding.allowedPaths.map(p => this.normalize(p)))].sort();
      const allowed = allowedPaths.map(prefix => ({ prefix, resolved: this.checkedPath(trusted.trustedRoot, prefix) }));
      const addressed: string[] = [];
      for (const field of tool.pathFields) {
        const value = input[field];
        if (Array.isArray(value)) {
          if (!value.length) throw new Error("empty path scope");
          addressed.push(...value.map(p => this.normalize(p)));
        } else addressed.push(this.normalize(value));
      }
      const normalized = [...new Set(addressed)].sort();
      const declared = [...new Set(proposed.paths.map(p => this.normalize(p)))].sort();
      if (JSON.stringify(declared) !== JSON.stringify(normalized)) throw new Error("scope mismatch");
      const targets: string[] = [];
      for (const path of normalized) {
        const candidate = this.checkedPath(trusted.trustedRoot, path);
        targets.push(candidate);
        if (!allowed.some(({ prefix, resolved }) => (prefix === "." || path === prefix || path.startsWith(`${prefix}/`)) &&
          this.security.isInsideRoot(resolved, candidate))) throw new Error("allowed scope");
      }
      // Whole-repository/terminal effects require a whole-workspace grant. A cwd
      // inside a narrow subtree is not a sandbox for git or arbitrary commands.
      if (tool.scopeRequirements.wholeWorkspace && !allowedPaths.includes(".")) throw new Error("whole workspace required");
      return { allowed: true, scope: { workspaceId: binding.workspaceId, paths: normalized },
        pathBindingHash: toolDigest({ targets, allowed: allowed.map(p => p.resolved) }),
        workspace: { ...binding, trustedRoot: trusted.trustedRoot, allowedPaths, permissions: [...new Set(binding.permissions)].sort() } };
    } catch { return { allowed: false, code: "SCOPE_VIOLATION" }; }
  }
  private normalize(value: unknown): string {
    if (typeof value !== "string" || value.length > 1024 || /[\x00-\x1f:*?"<>|]/.test(value)) throw new Error("invalid path");
    const segments = value.replace(/\\/g, "/").split("/");
    if (segments.some(p => (p !== "." && /[. ]$/.test(p)) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) throw new Error("ambiguous path");
    return this.paths.normalizeRelativePath(value) || ".";
  }
  private checkedPath(root: string, path: string): string {
    const candidate = this.security.resolveInsideRoot(root, path);
    let current = root;
    let resolved = root;
    for (const segment of path === "." ? [] : path.split("/")) {
      if (this.security.isForbiddenDirectoryName(segment) || this.security.isSensitiveFile(segment)) throw new Error("protected path");
      current = join(current, segment);
      resolved = join(resolved, segment);
      try {
        const info = lstatSync(current);
        if (info.isSymbolicLink()) {
          // realpath must succeed even for prospective targets below a symlink.
          this.security.assertInsideRoot(root, realpathSync.native(current));
        }
        this.security.assertInsideRoot(root, current);
        resolved = realpathSync.native(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        // A dangling symlink's realpath also reports ENOENT: reject it.
        try { if (lstatSync(current).isSymbolicLink()) throw new Error("unresolved symlink"); }
        catch (second) { if ((second as NodeJS.ErrnoException).code !== "ENOENT") throw second; }
      }
      // A harmless alias may point into an in-root secrets/forbidden directory.
      // Apply the existing name policy to each physical ancestor too, including
      // prospective descendants below the last existing symlink target.
      this.checkCanonicalSegments(root, resolved);
    }
    this.security.assertInsideRoot(root, resolved);
    return path === "." ? candidate : resolved;
  }
  private checkCanonicalSegments(root: string, resolved: string): void {
    this.security.assertInsideRoot(root, resolved);
    const segments = relative(root, resolved).replace(/\\/g, "/").split("/").filter(Boolean);
    if (segments.some(segment => this.security.isForbiddenDirectoryName(segment) || this.security.isSensitiveFile(segment))) throw new Error("protected canonical path");
  }
}
