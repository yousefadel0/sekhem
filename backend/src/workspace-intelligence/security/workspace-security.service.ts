import { Injectable } from "@nestjs/common";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { FORBIDDEN_SEGMENTS } from "../../repository-source/repository-content.service";
import { WorkspaceIntelligenceError } from "../workspace-intelligence.errors";
import { WorkspacePathService } from "../workspace-path.service";

const EXTRA_FORBIDDEN_DIRECTORIES = new Set([
  "venv",
  ".venv",
  "__pycache__",
  "storage",
  "secrets",
  "credentials"
]);

const SENSITIVE_NAMES = new Set([".env", "id_rsa", "id_dsa", "id_ed25519", ".netrc"]);
const SENSITIVE_PREFIXES = [".env."];
const SENSITIVE_NAME_INCLUDES = ["credentials", "secrets", "service-account", "private-key", "private_key"];
const SENSITIVE_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".der"]);

@Injectable()
export class WorkspaceSecurityService {
  constructor(private readonly paths: WorkspacePathService) {}

  forbiddenDirectoryNames(): Set<string> {
    return new Set([...FORBIDDEN_SEGMENTS, ...EXTRA_FORBIDDEN_DIRECTORIES]);
  }

  isForbiddenDirectoryName(name: string): boolean {
    return this.forbiddenDirectoryNames().has(name.toLowerCase()) || this.forbiddenDirectoryNames().has(name);
  }

  isSensitiveFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    if (SENSITIVE_NAMES.has(lower) || SENSITIVE_NAMES.has(fileName)) return true;
    if (SENSITIVE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
    if (SENSITIVE_EXTENSIONS.has(this.paths.extensionOf(lower))) return true;
    return SENSITIVE_NAME_INCLUDES.some((fragment) => lower.includes(fragment));
  }

  assertInsideRoot(trustedRoot: string, candidate: string): void {
    if (!this.isInsideRoot(trustedRoot, candidate)) {
      throw new WorkspaceIntelligenceError("WORKSPACE_PATH_OUTSIDE_ROOT");
    }
  }

  isInsideRoot(trustedRoot: string, candidate: string): boolean {
    const root = this.canonical(trustedRoot);
    const child = this.canonical(candidate);
    const rel = relative(root, child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  }

  resolveInsideRoot(trustedRoot: string, relativePath: string): string {
    const safeRelative = this.paths.normalizeRelativePath(relativePath);
    const joined = resolve(trustedRoot, ...safeRelative.split("/"));
    this.assertInsideRoot(trustedRoot, joined);
    return joined;
  }

  /** Check both the requested name and the canonical target of in-root aliases. */
  resolveReadablePath(trustedRoot: string, relativePath: string): string {
    const candidate = this.resolveInsideRoot(trustedRoot, relativePath);
    const canonicalRelative = relative(this.canonical(trustedRoot), this.canonical(candidate)).split(sep).join("/");
    const segments = [...relativePath.replace(/\\/g, "/").split("/"), ...canonicalRelative.split("/")];
    if (segments.some(segment => this.isForbiddenDirectoryName(segment) || this.isSensitiveFile(segment))) {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_ACCESS_DENIED");
    }
    return candidate;
  }

  isEscapingSymlink(trustedRoot: string, candidatePath: string): boolean {
    try {
      const stats = lstatSync(candidatePath);
      if (!stats.isSymbolicLink()) return false;
      const real = realpathSync.native(candidatePath);
      return !this.isInsideRoot(trustedRoot, real);
    } catch {
      return false;
    }
  }

  private canonical(value: string): string {
    const resolved = resolve(value);
    try {
      return realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  }
}

export function posixJoin(parent: string, name: string): string {
  if (!parent) return name;
  return `${parent}/${name}`;
}

export function hostJoin(root: string, relativePosix: string): string {
  if (!relativePosix) return root;
  return join(root, ...relativePosix.split("/").filter(Boolean));
}

export { sep };
