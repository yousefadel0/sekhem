import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import { FileIntelligenceError } from "../file-intelligence/file-intelligence.errors";
import { FileIntelligenceService } from "../file-intelligence/file-intelligence.service";
import type { NormalizedDocumentContent } from "../file-intelligence/models/normalized-document-content";
import { classifyByExtension, isImportantFile, languageForExtension } from "./workspace-classification";
import type {
  TrustedWorkspaceContext,
  Workspace,
  WorkspaceNode,
  WorkspaceSummary,
  WorkspaceTree
} from "./models/workspace.types";
import { WorkspaceDiscoveryService } from "./workspace-discovery.service";
import { WorkspaceSecurityService } from "./security/workspace-security.service";
import { toControlledWorkspaceError, WorkspaceIntelligenceError } from "./workspace-intelligence.errors";
import { WORKSPACE_INTELLIGENCE_LIMITS } from "./workspace-intelligence.limits";
import { WorkspacePathService } from "./workspace-path.service";

@Injectable()
export class WorkspaceIntelligenceService {
  constructor(
    private readonly discovery: WorkspaceDiscoveryService,
    private readonly fileIntelligence: FileIntelligenceService,
    private readonly security: WorkspaceSecurityService,
    private readonly paths: WorkspacePathService
  ) {}

  /**
   * Project is the durable workspace identity. No filesystem root is implied.
   */
  workspaceFromProject(project: { id: string; name: string; createdAt?: string; updatedAt?: string }): Workspace {
    return {
      id: project.id,
      projectId: project.id,
      name: project.name,
      source: "unknown",
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
  }

  unsupportedSource(_kind: "git" | "github" | "gitlab" | "attachment"): never {
    throw new WorkspaceIntelligenceError("WORKSPACE_SOURCE_UNSUPPORTED");
  }

  async inspectWorkspace(context: TrustedWorkspaceContext, query = ""): Promise<{ workspace: Workspace; tree: WorkspaceTree }> {
    const tree = await this.discovery.discoverTree(context, query);
    return {
      workspace: {
        id: context.workspaceId,
        projectId: context.projectId,
        name: context.name,
        source: "local"
      },
      tree
    };
  }

  async summarizeWorkspace(context: TrustedWorkspaceContext): Promise<WorkspaceSummary> {
    const { tree } = await this.inspectWorkspace(context);
    const languages: Record<string, number> = {};
    const fileCategories: Record<string, number> = {};
    const importantFiles: string[] = [];
    this.walkFiles(tree.root, (node) => {
      const kind = String(node.metadata?.kind ?? "unknown");
      fileCategories[kind] = (fileCategories[kind] ?? 0) + 1;
      const language = languageForExtension(node.extension ?? "") ?? (typeof node.metadata?.language === "string" ? node.metadata.language : undefined);
      if (language) {
        languages[language] = (languages[language] ?? 0) + 1;
      }
      if (isImportantFile(node.path)) {
        importantFiles.push(node.path);
      }
    });
    importantFiles.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    return {
      workspaceId: context.workspaceId,
      name: context.name,
      fileCount: tree.fileCount,
      directoryCount: tree.directoryCount,
      totalBytes: tree.totalBytes,
      languages,
      fileCategories,
      importantFiles,
      warnings: tree.warnings
    };
  }

  async inspectFile(context: TrustedWorkspaceContext, relativePath: string): Promise<NormalizedDocumentContent> {
    const trustedRoot = this.discovery.assertTrustedRoot(context.trustedRoot, context.authorizedRoots);
    const safeRelative = this.paths.normalizeRelativePath(relativePath);
    const absPath = this.security.resolveReadablePath(trustedRoot, safeRelative);
    this.security.assertInsideRoot(trustedRoot, absPath);

    if (this.security.isEscapingSymlink(trustedRoot, absPath)) {
      throw new WorkspaceIntelligenceError("WORKSPACE_PATH_OUTSIDE_ROOT");
    }

    const fileName = this.paths.fileNameOf(safeRelative);
    if (this.security.isSensitiveFile(fileName) || safeRelative.split("/").some((segment) => this.security.isForbiddenDirectoryName(segment))) {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_ACCESS_DENIED");
    }

    let stats;
    try {
      stats = await fs.stat(absPath);
    } catch {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_NOT_FOUND");
    }
    if (!stats.isFile()) {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_NOT_FOUND");
    }
    if (stats.size > WORKSPACE_INTELLIGENCE_LIMITS.MAX_SINGLE_FILE_BYTES) {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_TOO_LARGE");
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(absPath);
    } catch {
      throw new WorkspaceIntelligenceError("WORKSPACE_INSPECTION_FAILED");
    }

    const classified = classifyByExtension(fileName, this.paths.extensionOf(fileName));
    try {
      return await this.fileIntelligence.extractFromBuffer({
        attachmentId: `${context.workspaceId}:${safeRelative}`,
        fileName,
        mimeType: classified.mimeType,
        interpretation: "source",
        sizeBytes: buffer.length,
        buffer
      });
    } catch (err) {
      if (err instanceof FileIntelligenceError) {
        throw new WorkspaceIntelligenceError(err.code === "FILE_ACCESS_DENIED" ? "WORKSPACE_FILE_ACCESS_DENIED" : "WORKSPACE_INSPECTION_FAILED", err.message, err.code);
      }
      throw toControlledWorkspaceError(err);
    }
  }

  private walkFiles(node: WorkspaceNode, visit: (node: WorkspaceNode) => void): void {
    if (node.type === "file") {
      visit(node);
      return;
    }
    for (const child of node.children ?? []) {
      this.walkFiles(child, visit);
    }
  }
}
