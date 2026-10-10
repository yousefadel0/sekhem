export type WorkspaceSource = "local" | "git" | "github" | "gitlab" | "attachment" | "unknown";
export interface WorkspaceBinding {
  id: string; projectId: string; name: string; version: string;
  mode: "READ_ONLY"; location: "BACKEND_HOST";
}

export interface WorkspaceRepositoryRef {
  provider?: string;
  url?: string;
  branch?: string;
  commit?: string;
}

export interface Workspace {
  id: string;
  projectId?: string;
  name: string;
  source: WorkspaceSource;
  repository?: WorkspaceRepositoryRef;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Internal trusted context. trustedRoot must never be serialized to clients.
 */
export interface TrustedWorkspaceContext {
  workspaceId: string;
  projectId?: string;
  name: string;
  trustedRoot: string;
  /** Deployment-owned allowlist for the explicit MVP binding; never client input. */
  authorizedRoots?: string;
}

export type WorkspaceNodeType = "file" | "directory";

export type WorkspaceFileKind =
  | "code"
  | "text"
  | "document"
  | "structured"
  | "spreadsheet"
  | "image"
  | "archive"
  | "binary"
  | "unknown";

export interface WorkspaceNode {
  path: string;
  name: string;
  type: WorkspaceNodeType;
  extension?: string;
  mimeType?: string;
  sizeBytes?: number;
  children?: WorkspaceNode[];
  metadata?: Record<string, unknown>;
}

export interface WorkspaceTree {
  workspaceId: string;
  root: WorkspaceNode;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  truncated: boolean;
  warnings: string[];
}

export interface WorkspaceSummary {
  workspaceId: string;
  name: string;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  languages?: Record<string, number>;
  fileCategories?: Record<string, number>;
  importantFiles?: string[];
  warnings: string[];
}
