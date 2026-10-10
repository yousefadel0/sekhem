export interface RepositoryBranchDto {
  name: string;
  commitSha: string;
}

export interface RepositoryCitationDto {
  repository: string;
  commitSha: string;
  path: string;
  startLine: number;
  endLine: number;
}

export interface RepositoryContentChunkDto extends RepositoryCitationDto {
  citationId: string;
  content: string;
}

export interface RepositorySnapshotDto {
  repositoryConnectionId: string;
  repository: string;
  requestedRef: string;
  commitSha: string;
  chunks: RepositoryContentChunkDto[];
  fileCount: number;
  totalBytes: number;
  skippedFiles: number;
}
