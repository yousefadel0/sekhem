import * as fs from "node:fs/promises";
import { isAbsolute, parse, relative, resolve, sep, join } from "node:path";
import { FileIntelligenceSecurityService } from "../file-intelligence/security/file-intelligence-security.service";
import { excludedFromWorkspaceDiscovery } from "../workspace-intelligence/workspace-discovery.policy";
import { WORKSPACE_READ_TOOLS, type RuntimeAttribution } from "./runtime.contract";

/** Additional checks for reusable consent on the already-trusted worker. Not an OS sandbox. */
export async function checkWorkspaceReadPath(a: RuntimeAttribution, path: string) {
  const coverage = a.workspaceRead;
  if (!coverage) return;
  const c = coverage.consent;
  if (coverage.kind !== "WORKSPACE_READ_GRANT" || coverage.grantId !== a.grantId || coverage.grantVersion !== a.grantVersion ||
    c.status !== "ACTIVE" || !!c.revokedAt || (coverage.lifecycle === "DEVELOPMENT_ENROLLED_READ"
      ? c.expiresAt !== null && !Number.isFinite(Date.parse(c.expiresAt))
      : c.expiresAt === null || Date.parse(c.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(c.expiresAt))) ||
    !WORKSPACE_READ_TOOLS.includes(a.tool as any) || !c.capabilities.includes(a.tool as any) || c.runtimeId !== a.runtimeId ||
    c.userId !== a.userId || c.organizationId !== a.organizationId || c.projectId !== a.projectId) throw new Error("WORKSPACE_READ_SCOPE_DENIED");
  const root = resolve(c.rootPath), target = resolve(path), rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("WORKSPACE_READ_SCOPE_DENIED");
  new FileIntelligenceSecurityService().assertSafeFileName(rel.replace(/\\/g, "/"));
  if (rel.split(sep).some(excludedFromWorkspaceDiscovery)) throw new Error("WORKSPACE_READ_PATH_DENIED");
  // Reject links in the root as well as every addressed descendant. Never use an alias to widen consent.
  let current = parse(target).root;
  for (const part of target.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) throw new Error("WORKSPACE_READ_ALIAS_DENIED");
  }
  const canonical = await fs.realpath(target), canonicalRoot = await fs.realpath(root);
  const equal = (a: string, b: string) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!equal(canonical, target) || !equal(canonicalRoot, root)) throw new Error("WORKSPACE_READ_ALIAS_DENIED");
}
