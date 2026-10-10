import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { validatedLocalRepositoryPath } from "../repository-source/repository-path.policy";
import { classifyByExtension } from "./workspace-classification";
import type { TrustedWorkspaceContext, WorkspaceNode, WorkspaceTree } from "./models/workspace.types";
import { WorkspaceSecurityService, posixJoin } from "./security/workspace-security.service";
import { WorkspaceIntelligenceError } from "./workspace-intelligence.errors";
import { WORKSPACE_INTELLIGENCE_LIMITS } from "./workspace-intelligence.limits";
import { WorkspacePathService } from "./workspace-path.service";
import { excludedFromWorkspaceDiscovery, workspaceDiscoveryPriority, workspaceQueryTokens } from "./workspace-discovery.policy";

interface WalkState {
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  nodeCount: number;
  truncated: boolean;
  warnings: string[];
}

@Injectable()
export class WorkspaceDiscoveryService {
  constructor(
    private readonly security: WorkspaceSecurityService,
    private readonly paths: WorkspacePathService
  ) {}

  async discoverTree(context: TrustedWorkspaceContext, query = ""): Promise<WorkspaceTree> {
    const trustedRoot = this.assertTrustedRoot(context.trustedRoot, context.authorizedRoots);
    const state: WalkState = {
      fileCount: 0,
      directoryCount: 0,
      totalBytes: 0,
      nodeCount: 1,
      truncated: false,
      warnings: []
    };

    const children = await this.readDirectory(trustedRoot, trustedRoot, "", 1, state, workspaceQueryTokens(query));
    const root: WorkspaceNode = {
      path: "",
      name: context.name || context.workspaceId,
      type: "directory",
      children
    };

    return {
      workspaceId: context.workspaceId,
      root,
      fileCount: state.fileCount,
      directoryCount: state.directoryCount,
      totalBytes: state.totalBytes,
      truncated: state.truncated,
      warnings: state.warnings
    };
  }

  assertTrustedRoot(trustedRoot: string, authorizedRoots?: string): string {
    try {
      return validatedLocalRepositoryPath(trustedRoot, authorizedRoots === undefined ? process.env : { SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS: authorizedRoots });
    } catch {
      throw new WorkspaceIntelligenceError("WORKSPACE_ACCESS_DENIED");
    }
  }

  /** One bounded directory, with no recursive reads. Browser expansion calls this. */
  async listDirectory(context: TrustedWorkspaceContext, relativeDirectory = ""): Promise<WorkspaceTree> {
    const root = this.assertTrustedRoot(context.trustedRoot, context.authorizedRoots);
    const directory = relativeDirectory ? this.paths.normalizeRelativePath(relativeDirectory) : "";
    if (directory.split("/").filter(Boolean).length >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_DEPTH) {
      throw new WorkspaceIntelligenceError("WORKSPACE_LIMIT_EXCEEDED");
    }
    if (directory.split("/").some(part => this.security.isForbiddenDirectoryName(part) || this.security.isSensitiveFile(part))) {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_ACCESS_DENIED");
    }
    const absolute = directory ? this.security.resolveReadablePath(root, directory) : root;
    this.security.assertInsideRoot(root, absolute);
    const children: WorkspaceNode[] = [];
    let files = 0, directories = 0, bytes = 0, truncated = false;
    try {
      const entries = await fs.opendir(absolute);
      for await (const entry of entries) {
        if (this.security.isForbiddenDirectoryName(entry.name) || this.security.isSensitiveFile(entry.name)) continue;
        if (entry.isDirectory() && excludedFromWorkspaceDiscovery(entry.name)) continue;
        const childPath = posixJoin(directory, entry.name);
        // Do not follow links from the browser tree (including directory cycles).
        if (entry.isSymbolicLink()) continue;
        const child = this.security.resolveReadablePath(root, childPath);
        if (!entry.isDirectory() && !entry.isFile()) continue;
        const stats = await fs.stat(child);
        if (children.length >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_TREE_NODES - 1 ||
          (entry.isDirectory() && directories >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_DIRECTORIES) ||
          (entry.isFile() && (files >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_FILES || bytes + stats.size > WORKSPACE_INTELLIGENCE_LIMITS.MAX_TOTAL_WORKSPACE_BYTES))) {
          truncated = true; break;
        }
        if (entry.isDirectory()) { directories++; children.push({ name: entry.name, path: childPath, type: "directory" }); }
        else {
          files++; bytes += stats.size;
          const extension = this.paths.extensionOf(entry.name), kind = classifyByExtension(entry.name, extension);
          children.push({ name: entry.name, path: childPath, type: "file", sizeBytes: stats.size, extension, mimeType: kind.mimeType, metadata: { kind: kind.kind, language: kind.language } });
        }
      }
    } catch (error) {
      if (error instanceof WorkspaceIntelligenceError) throw error;
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_NOT_FOUND");
    }
    children.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name, "en") : a.type === "directory" ? -1 : 1);
    return { workspaceId: context.workspaceId, root: { path: directory, name: directory ? this.paths.fileNameOf(directory) : context.name, type: "directory", children },
      fileCount: files, directoryCount: directories, totalBytes: bytes, truncated, warnings: truncated ? ["Directory listing reached a configured limit."] : [] };
  }

  private async readDirectory(
    trustedRoot: string,
    absDir: string,
    relativeDir: string,
    depth: number,
    state: WalkState,
    tokens: string[]
  ): Promise<WorkspaceNode[]> {
    if (depth > WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_DEPTH) {
      this.markTruncated(state, "Maximum workspace depth was reached.");
      return [];
    }
    if (state.nodeCount >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_TREE_NODES) {
      this.markTruncated(state, "Maximum workspace tree node count was reached.");
      return [];
    }

    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }>;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      throw new WorkspaceIntelligenceError("WORKSPACE_INSPECTION_FAILED");
    }

    const directories: WorkspaceNode[] = [];
    const files: WorkspaceNode[] = [];
    const sorted = [...entries].sort((a, b) =>
      workspaceDiscoveryPriority(posixJoin(relativeDir, b.name), b.isDirectory(), tokens) -
      workspaceDiscoveryPriority(posixJoin(relativeDir, a.name), a.isDirectory(), tokens) || a.name.localeCompare(b.name, "en"));

    for (const entry of sorted) {
      const name = entry.name;
      const relativePath = posixJoin(relativeDir, name);
      const absPath = join(absDir, name);

      // Exclude known low-value trees before stat, recursion, or budget charging.
      if (entry.isDirectory() && (excludedFromWorkspaceDiscovery(name) || this.security.isForbiddenDirectoryName(name))) continue;
      if (state.nodeCount >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_TREE_NODES) {
        this.markTruncated(state, "Maximum workspace tree node count was reached.");
        break;
      }

      if (this.security.isEscapingSymlink(trustedRoot, absPath)) {
        this.markTruncated(state, "A symlink pointing outside the workspace root was skipped.");
        continue;
      }

      // Like listDirectory, do not recurse through aliases/cycles. Exact reads
      // still use the existing canonical target and sensitive-path validation.
      if (entry.isSymbolicLink()) {
        this.markTruncated(state, "A symbolic link was skipped during workspace discovery.");
        continue;
      }

      if (entry.isDirectory()) {
        if (this.security.isForbiddenDirectoryName(name)) {
          continue;
        }
        if (state.directoryCount >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_DIRECTORIES) {
          this.markTruncated(state, "Maximum workspace directory count was reached.");
          continue;
        }
        state.directoryCount += 1;
        state.nodeCount += 1;
        const childNodes = await this.readDirectory(trustedRoot, absPath, relativePath, depth + 1, state, tokens);
        directories.push({
          path: relativePath,
          name,
          type: "directory",
          children: childNodes
        });
        continue;
      }

      if (!entry.isFile()) continue;

      if (state.fileCount >= WORKSPACE_INTELLIGENCE_LIMITS.MAX_WORKSPACE_FILES) {
        this.markTruncated(state, "Maximum workspace file count was reached.");
        continue;
      }

      let size = 0;
      try {
        const stats = await fs.stat(absPath);
        size = stats.size;
      } catch {
        continue;
      }

      if (size > WORKSPACE_INTELLIGENCE_LIMITS.MAX_SINGLE_FILE_BYTES) {
        if (!state.warnings.includes("A file exceeded the single-file size limit and was listed without inspection.")) {
          state.warnings.push("A file exceeded the single-file size limit and was listed without inspection.");
        }
      }

      if (state.totalBytes + size > WORKSPACE_INTELLIGENCE_LIMITS.MAX_TOTAL_WORKSPACE_BYTES) {
        this.markTruncated(state, "Maximum total workspace bytes were reached.");
        continue;
      }

      state.fileCount += 1;
      state.nodeCount += 1;
      state.totalBytes += size;
      const extension = this.paths.extensionOf(name);
      const classified = classifyByExtension(name, extension);
      files.push({
        path: relativePath,
        name,
        type: "file",
        extension: extension || undefined,
        mimeType: classified.mimeType,
        sizeBytes: size,
        metadata: {
          kind: classified.kind,
          language: classified.language,
          sensitive: this.security.isSensitiveFile(name)
        }
      });
    }

    directories.sort((a, b) => a.name.localeCompare(b.name, "en"));
    files.sort((a, b) => a.name.localeCompare(b.name, "en"));
    return [...directories, ...files];
  }

  private markTruncated(state: WalkState, warning: string): void {
    state.truncated = true;
    if (!state.warnings.includes(warning)) {
      state.warnings.push(warning);
    }
  }
}
