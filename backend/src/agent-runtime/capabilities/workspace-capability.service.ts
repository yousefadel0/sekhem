import { ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import { ResourceAuthorizationService, type AuthSubject } from "../../auth/resource-authz.service";
import type { NormalizedDocumentContent } from "../../file-intelligence/models/normalized-document-content";
import type { WorkspaceNode, WorkspaceTree } from "../../workspace-intelligence/models/workspace.types";
import { WorkspaceIntelligenceError } from "../../workspace-intelligence/workspace-intelligence.errors";
import { WorkspaceIntelligenceService } from "../../workspace-intelligence/workspace-intelligence.service";
import { WorkspacePathService } from "../../workspace-intelligence/workspace-path.service";
import { WorkspaceSecurityService } from "../../workspace-intelligence/security/workspace-security.service";
import {
  AGENT_FILE_READER_LIMITS,
  type AgentFileReaderCapability,
  type CapabilityAudit,
  type EvidenceItem,
  type WorkspaceContext
} from "./workspace-context";
import { WorkspaceSourceResolver } from "./workspace-source.resolver";
import { ExecutionNotImplementedError } from "./execution-plane.types";
import { RESERVED_GITLAB_MUTATION_CAPABILITIES } from "./workspace-source.types";
import { WorkspaceBindingService } from "../../workspace-intelligence/workspace-binding.service";
import { fileReadOutcome, hasReadableContent } from "../../file-intelligence/file-read-outcome";

export interface CapabilityRequest {
  projectId: string;
  workspaceId?: string;
  name?: string;
  trustedRoot?: string;
  authorizedRoots?: string;
  workspaceVersion?: string;
  userId: string;
  userRole: AuthSubject["role"];
  organizationId?: string;
  agentRunId?: string;
  isSystemAdmin?: boolean;
}

@Injectable()
export class WorkspaceCapabilityService {
  constructor(
    private readonly workspaceIntelligence: WorkspaceIntelligenceService,
    private readonly resolver: WorkspaceSourceResolver,
    private readonly paths: WorkspacePathService,
    private readonly security: WorkspaceSecurityService,
    @Optional() @Inject(ResourceAuthorizationService) private readonly resourceAuthz?: ResourceAuthorizationService,
    @Optional() @Inject(WorkspaceBindingService) private readonly bindings?: WorkspaceBindingService
  ) {}

  gitlabMutation(_capability: (typeof RESERVED_GITLAB_MUTATION_CAPABILITIES)[number]): never {
    throw new WorkspaceIntelligenceError("WORKSPACE_SOURCE_UNSUPPORTED");
  }

  powershellExecute(): never {
    throw new ExecutionNotImplementedError();
  }

  async discover(request: CapabilityRequest, relativePath?: string, query = ""): Promise<{
    tree: WorkspaceTree;
    context: WorkspaceContext;
    audit: CapabilityAudit;
  }> {
    const started = Date.now();
    await this.assertProjectRead(request);
    const trusted = this.resolver.resolveLocal(this.sourceInput(request));
    const { workspace, tree } = await this.workspaceIntelligence.inspectWorkspace(trusted, query);
    let scoped = tree;
    if (relativePath) {
      const node = this.findNode(tree.root, this.paths.normalizeRelativePath(relativePath));
      if (!node || node.type !== "directory") {
        throw new WorkspaceIntelligenceError("WORKSPACE_FILE_NOT_FOUND");
      }
      scoped = {
        ...tree,
        root: node
      };
    }
    this.assertNoAbsolutePaths(scoped.root);
    const audit = this.audit("workspace.discover", request, started, {
      relativePaths: relativePath ? [this.paths.normalizeRelativePath(relativePath)] : [],
      truncated: scoped.truncated,
      allowed: true,
      status: "ok"
    });
    return {
      tree: scoped,
      context: this.contextFromTree(request, workspace.source === "local" ? "local" : "unknown", scoped, [], []),
      audit
    };
  }

  async list(request: CapabilityRequest, relativeDirectory: string): Promise<{
    path: string;
    children: WorkspaceNode[];
    audit: CapabilityAudit;
  }> {
    const started = Date.now();
    await this.assertProjectRead(request);
    const dir = relativeDirectory.trim() === "" || relativeDirectory === "." ? "" : this.paths.normalizeRelativePath(relativeDirectory);
    if (dir.split("/").some((segment) => this.security.isForbiddenDirectoryName(segment))) {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_ACCESS_DENIED");
    }
    const { tree } = await this.discover(request);
    const node = dir ? this.findNode(tree.root, dir) : tree.root;
    if (!node || node.type !== "directory") {
      throw new WorkspaceIntelligenceError("WORKSPACE_FILE_NOT_FOUND");
    }
    const children = (node.children ?? []).slice(0, AGENT_FILE_READER_LIMITS.MAX_LIST_CHILDREN);
    const truncated = (node.children ?? []).length > children.length;
    const audit = this.audit("workspace.list", request, started, {
      relativePaths: [dir || "."],
      truncated: truncated || tree.truncated,
      allowed: true,
      status: "ok"
    });
    return { path: dir, children, audit };
  }

  async search(request: CapabilityRequest, query: string, pathPrefix?: string): Promise<{
    query: string;
    matches: Array<{ path: string; name: string; type: string; kind?: string }>;
    truncated: boolean;
    audit: CapabilityAudit;
  }> {
    const started = Date.now();
    await this.assertProjectRead(request);
    const needle = query.trim().toLowerCase();
    if (!needle) {
      throw new WorkspaceIntelligenceError("WORKSPACE_PATH_INVALID", "Search query is required.");
    }
    const prefix = pathPrefix ? this.paths.normalizeRelativePath(pathPrefix) : "";
    const { tree } = await this.discover(request, undefined, query);
    const matches: Array<{ path: string; name: string; type: string; kind?: string }> = [];
    this.walk(tree.root, (node) => {
      if (!node.path) return;
      if (prefix && node.path !== prefix && !node.path.startsWith(`${prefix}/`)) return;
      if (node.type === "file" && this.security.isSensitiveFile(node.name)) return;
      if (node.path.toLowerCase().includes(needle) || node.name.toLowerCase().includes(needle)) {
        matches.push({
          path: node.path,
          name: node.name,
          type: node.type,
          kind: typeof node.metadata?.kind === "string" ? node.metadata.kind : undefined
        });
      }
    });
    matches.sort((a, b) => a.path.localeCompare(b.path, "en"));
    const truncated = matches.length > AGENT_FILE_READER_LIMITS.MAX_SEARCH_RESULTS;
    const limited = matches.slice(0, AGENT_FILE_READER_LIMITS.MAX_SEARCH_RESULTS);
    const audit = this.audit("workspace.search", request, started, {
      relativePaths: limited.map((m) => m.path),
      truncated: truncated || tree.truncated,
      allowed: true,
      status: "ok"
    });
    return { query: needle, matches: limited, truncated: truncated || tree.truncated, audit };
  }

  async inspect(request: CapabilityRequest, relativePath: string): Promise<{
    document: NormalizedDocumentContent;
    audit: CapabilityAudit;
  }> {
    const started = Date.now();
    await this.assertProjectRead(request);
    const safePath = this.paths.normalizeRelativePath(relativePath);
    const trusted = this.resolver.resolveLocal(this.sourceInput(request));
    try {
      const document = await this.workspaceIntelligence.inspectFile(trusted, safePath);
      if (this.containsAbsolutePath(document.fileName)) {
        throw new WorkspaceIntelligenceError("WORKSPACE_INSPECTION_FAILED");
      }
      const audit = this.audit("file.inspect", request, started, {
        relativePaths: [safePath],
        truncated: document.truncated,
        allowed: true,
        status: "ok"
      });
      return { document, audit };
    } catch (err) {
      if (err instanceof WorkspaceIntelligenceError && err.code === "WORKSPACE_FILE_ACCESS_DENIED") {
        this.audit("file.inspect", request, started, {
          relativePaths: [safePath],
          truncated: false,
          allowed: false,
          status: "denied",
          deniedReason: "WORKSPACE_FILE_ACCESS_DENIED"
        });
      }
      throw err;
    }
  }

  async collectEvidence(request: CapabilityRequest, relativePaths: string[]): Promise<{
    context: WorkspaceContext;
    audit: CapabilityAudit;
  }> {
    const started = Date.now();
    await this.assertProjectRead(request);
    const unique = [...new Set(relativePaths)];
    const limitedPaths = unique.slice(0, AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_ITEMS);
    const evidence: EvidenceItem[] = [];
    const warnings: string[] = [];
    const limitsEncountered: string[] = [];
    if (unique.length > limitedPaths.length) {
      limitsEncountered.push("MAX_EVIDENCE_ITEMS");
      warnings.push("Evidence collection was capped at the configured file limit.");
    }
    const auditedPaths: string[] = [];
    for (const requestedPath of limitedPaths) {
      let relativePath = "[invalid path]";
      try {
        relativePath = this.paths.normalizeRelativePath(requestedPath);
        auditedPaths.push(relativePath);
        const { document } = await this.inspect(request, relativePath);
        const text = document.text.slice(0, AGENT_FILE_READER_LIMITS.MAX_EVIDENCE_TEXT_CHARS);
        evidence.push({
          relativePath,
          outcome: document.scanned ? "SCANNED" : document.truncated || text.length < document.text.length ? "TRUNCATED" : "READ",
          fileType: document.detectedMime,
          extractorId: document.extractorId,
          text,
          truncated: document.truncated || text.length < document.text.length,
          warnings: document.warnings,
          sourceIdentity: `${request.projectId}:${relativePath}`
        });
      } catch (err) {
        if (relativePath === "[invalid path]") auditedPaths.push(relativePath);
        const outcome = fileReadOutcome(err);
        const notice = `File read outcome: ${outcome}`;
        warnings.push(`${relativePath}: ${notice}`);
        evidence.push({ relativePath, outcome, text: "", truncated: false, warnings: [notice], sourceIdentity: `${request.projectId}:${relativePath}` });
      }
    }
    const context: WorkspaceContext = {
      workspaceId: request.workspaceId ?? request.projectId,
      projectId: request.projectId,
      source: "local",
      selectedFiles: evidence.filter(item => hasReadableContent(item.outcome)).map((item) => item.relativePath),
      evidence,
      warnings,
      truncated: limitsEncountered.length > 0 || evidence.some((item) => item.truncated),
      provenance: evidence.map((item) => item.sourceIdentity),
      limitsEncountered
    };
    const audit = this.audit("evidence.collect", request, started, {
      relativePaths: auditedPaths,
      truncated: context.truncated,
      allowed: true,
      status: "ok"
    });
    return { context, audit };
  }

  private sourceInput(request: CapabilityRequest) {
    return {
      workspaceId: request.workspaceId ?? request.projectId,
      projectId: request.projectId,
      name: request.name ?? request.projectId,
      trustedRoot: request.trustedRoot,
      authorizedRoots: request.authorizedRoots
    };
  }

  private async assertProjectRead(request: CapabilityRequest): Promise<void> {
    if (this.bindings) {
      const bound = await this.bindings.resolve({ sub: request.userId, role: request.userRole, organizationId: request.organizationId,
        email: "", displayName: "" }, request.projectId, request.workspaceVersion);
      Object.assign(request, bound.context, { isSystemAdmin: request.userRole === "Admin", workspaceVersion: bound.binding.version });
    }
    if (!this.resourceAuthz) return;
    const subject: AuthSubject = {
      userId: request.userId,
      email: "",
      displayName: "",
      role: request.userRole,
      organizationId: request.organizationId,
      isSystemAdmin: request.isSystemAdmin === true
    };
    try {
      await this.resourceAuthz.assertAuthorized(subject, "READ", {
        resourceType: "Project",
        id: request.projectId,
        projectId: request.projectId,
        organizationId: request.organizationId
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw new WorkspaceIntelligenceError("WORKSPACE_ACCESS_DENIED");
      }
      throw err;
    }
  }

  private findNode(root: WorkspaceNode, relativePath: string): WorkspaceNode | undefined {
    if (!relativePath || root.path === relativePath) return root;
    for (const child of root.children ?? []) {
      if (child.path === relativePath) return child;
      if (relativePath.startsWith(`${child.path}/`)) {
        const found = this.findNode(child, relativePath);
        if (found) return found;
      }
    }
    return undefined;
  }

  private walk(node: WorkspaceNode, visit: (node: WorkspaceNode) => void): void {
    visit(node);
    for (const child of node.children ?? []) {
      this.walk(child, visit);
    }
  }

  private assertNoAbsolutePaths(node: WorkspaceNode): void {
    if (this.containsAbsolutePath(node.path) || this.containsAbsolutePath(node.name)) {
      throw new WorkspaceIntelligenceError("WORKSPACE_INSPECTION_FAILED");
    }
    for (const child of node.children ?? []) {
      this.assertNoAbsolutePaths(child);
    }
  }

  private containsAbsolutePath(value: string): boolean {
    return this.paths.isAbsolutePath(value);
  }

  private contextFromTree(
    request: CapabilityRequest,
    source: "local" | "unknown",
    tree: WorkspaceTree,
    evidence: EvidenceItem[],
    selectedFiles: string[]
  ): WorkspaceContext {
    return {
      workspaceId: tree.workspaceId,
      projectId: request.projectId,
      source,
      fileCount: tree.fileCount,
      directoryCount: tree.directoryCount,
      totalBytes: tree.totalBytes,
      selectedFiles,
      evidence,
      warnings: tree.warnings,
      truncated: tree.truncated,
      provenance: [`workspace:${tree.workspaceId}`],
      limitsEncountered: tree.truncated ? ["WORKSPACE_DISCOVERY_TRUNCATED"] : []
    };
  }

  private audit(
    capability: AgentFileReaderCapability,
    request: CapabilityRequest,
    started: number,
    extra: {
      relativePaths: string[];
      truncated: boolean;
      allowed: boolean;
      status: CapabilityAudit["status"];
      deniedReason?: string;
    }
  ): CapabilityAudit {
    return {
      capability,
      agentRunId: request.agentRunId,
      projectId: request.projectId,
      workspaceId: request.workspaceId ?? request.projectId,
      relativePaths: extra.relativePaths,
      allowed: extra.allowed,
      deniedReason: extra.deniedReason,
      truncated: extra.truncated,
      durationMs: Date.now() - started,
      status: extra.status
    };
  }
}
