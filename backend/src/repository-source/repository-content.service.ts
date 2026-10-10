import { BadGatewayException, BadRequestException, Injectable, Optional } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { posix } from "node:path";
import type { RepositoryUseConfiguration } from "../ai-gateway/runtime-configuration.dto";
import type { RepositoryBranchDto, RepositoryContentChunkDto, RepositorySnapshotDto } from "./repository-content.dto";
import { validatedLocalRepositoryPath } from "./repository-path.policy";
import { gitlabRepositoryCoordinates } from "./gitlab-url.policy";

const execFileAsync = promisify(execFile);
export const FORBIDDEN_SEGMENTS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", "vendor", "logs", "tmp", "target"]);
const FORBIDDEN_EXTENSIONS = new Set([
  ".env", ".pem", ".key", ".p12", ".pfx", ".crt", ".cer", ".der", ".zip", ".tar", ".gz", ".7z", ".rar", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".exe", ".dll", ".so", ".dylib", ".bin", ".class", ".jar", ".lockb"
]);
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /(?:password|passwd|api[_-]?key|secret|token|authorization)\s*[:=]\s*["']?[A-Za-z0-9_+./=-]{12,}/i
];

type Fetcher = typeof fetch;
type TreeEntry = { path: string; size: number; symlink: boolean };
export type RepositorySnapshotStage = "REPOSITORY_COMMIT" | "REPOSITORY_TREE" | "REPOSITORY_FILE";

@Injectable()
export class RepositoryContentService {
  constructor(@Optional() private readonly fetcher: Fetcher = fetch) {}

  async branches(connection: RepositoryUseConfiguration): Promise<RepositoryBranchDto[]> {
    if (connection.providerType === "local") {
      const output = await this.git(connection, ["branch", "--format=%(refname:short)|%(objectname)"]);
      return output.split(/\r?\n/).filter(Boolean).map((line) => {
        const [name, commitSha] = line.split("|");
        return { name: this.required(name), commitSha: this.sha(commitSha) };
      }).filter((branch) => connection.allowedBranches.includes(branch.name));
    }
    if (connection.providerType === "github") {
      const data = await this.remoteJson(connection, `/repos/${this.githubPath(connection)}/branches?per_page=100`);
      if (!Array.isArray(data)) throw new BadGatewayException("Repository branch response is invalid");
      return data.map((item) => {
        const record = this.record(item);
        return { name: this.required(record.name), commitSha: this.sha(this.record(record.commit).sha) };
      }).filter((branch) => connection.allowedBranches.includes(branch.name));
    }
    const data = await this.remoteJson(connection, `/projects/${encodeURIComponent(this.gitlabPath(connection))}/repository/branches?per_page=100`);
    if (!Array.isArray(data)) throw new BadGatewayException("Repository branch response is invalid");
    return data.map((item) => {
      const record = this.record(item);
      return { name: this.required(record.name), commitSha: this.sha(this.record(record.commit).id) };
    }).filter((branch) => connection.allowedBranches.includes(branch.name));
  }

  async snapshot(
    connection: RepositoryUseConfiguration,
    requestedRef: string,
    requestedIncludes?: string[],
    onStage?: (stage: RepositorySnapshotStage) => void
  ): Promise<RepositorySnapshotDto> {
    const safeRef = this.requestedRef(requestedRef, connection.allowedBranches);
    onStage?.("REPOSITORY_COMMIT");
    const commitSha = await this.resolveCommit(connection, safeRef);
    const includes = requestedIncludes?.length ? this.validateRequestedIncludes(requestedIncludes, connection.includePaths) : connection.includePaths;
    onStage?.("REPOSITORY_TREE");
    const tree = await this.tree(connection, commitSha);
    const accepted = tree.filter((entry) => !entry.symlink && this.pathAllowed(entry.path, includes, connection.excludePaths));
    const chunks: RepositoryContentChunkDto[] = [];
    let totalBytes = 0;
    let fileCount = 0;
    let skippedFiles = tree.length - accepted.length;

    onStage?.("REPOSITORY_FILE");
    for (const entry of accepted) {
      if (fileCount >= connection.maximumFileCount || entry.size > connection.maximumFileBytes || totalBytes + entry.size > connection.maximumTotalBytes) {
        skippedFiles += 1;
        continue;
      }
      const content = await this.file(connection, commitSha, entry.path);
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > connection.maximumFileBytes || totalBytes + bytes > connection.maximumTotalBytes || this.hasLikelySecret(content)) {
        skippedFiles += 1;
        continue;
      }
      const repositoryReference = connection.providerType === "local" ? `local:${connection.id}` : connection.repositoryIdentifier;
      chunks.push(...this.chunk(repositoryReference, commitSha, entry.path, content));
      totalBytes += bytes;
      fileCount += 1;
    }

    if (chunks.length === 0) throw new BadRequestException("Repository snapshot contains no permitted safe text files");
    return {
      repositoryConnectionId: connection.id,
      repository: connection.providerType === "local" ? `local:${connection.id}` : connection.repositoryIdentifier,
      requestedRef: safeRef,
      commitSha,
      chunks,
      fileCount,
      totalBytes,
      skippedFiles
    };
  }

  private async resolveCommit(connection: RepositoryUseConfiguration, ref: string): Promise<string> {
    if (connection.providerType === "local") return this.sha(await this.git(connection, ["rev-parse", "--verify", `${ref}^{commit}`]));
    if (connection.providerType === "github") {
      const data = this.record(await this.remoteJson(connection, `/repos/${this.githubPath(connection)}/commits/${encodeURIComponent(ref)}`));
      return this.sha(data.sha);
    }
    const data = this.record(await this.remoteJson(connection, `/projects/${encodeURIComponent(this.gitlabPath(connection))}/repository/commits/${encodeURIComponent(ref)}`));
    return this.sha(data.id);
  }

  private async tree(connection: RepositoryUseConfiguration, commitSha: string): Promise<TreeEntry[]> {
    if (connection.providerType === "local") {
      const output = await this.git(connection, ["ls-tree", "-r", "-l", commitSha]);
      return output.split(/\r?\n/).filter(Boolean).map((line) => {
        const match = /^(\d+)\s+blob\s+[a-f0-9]+\s+(\d+|-)\t(.+)$/.exec(line);
        if (!match) throw new BadGatewayException("Local repository tree response is invalid");
        return { path: this.safePath(match[3]!), size: match[2] === "-" ? 0 : Number(match[2]), symlink: match[1] === "120000" };
      });
    }
    if (connection.providerType === "github") {
      const data = this.record(await this.remoteJson(connection, `/repos/${this.githubPath(connection)}/git/trees/${commitSha}?recursive=1`));
      if (data.truncated === true) throw new BadGatewayException("Repository tree response is truncated");
      if (!Array.isArray(data.tree)) throw new BadGatewayException("Repository tree response is invalid");
      return data.tree.filter((item) => this.record(item).type === "blob").map((item) => {
        const record = this.record(item);
        return { path: this.safePath(record.path), size: typeof record.size === "number" ? record.size : 0, symlink: record.mode === "120000" };
      });
    }
    const data = await this.gitlabTree(connection, commitSha);
    return data.filter((item) => this.record(item).type === "blob").map((item) => ({ path: this.safePath(this.record(item).path), size: 0, symlink: false }));
  }

  private async file(connection: RepositoryUseConfiguration, commitSha: string, path: string): Promise<string> {
    if (connection.providerType === "local") return this.git(connection, ["show", `${commitSha}:${path}`], connection.maximumFileBytes + 1);
    if (connection.providerType === "github") {
      const data = this.record(await this.remoteJson(connection, `/repos/${this.githubPath(connection)}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${commitSha}`));
      if (data.encoding !== "base64" || typeof data.content !== "string") throw new BadGatewayException("Repository file response is invalid");
      return Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf8");
    }
    return this.remoteText(connection, `/projects/${encodeURIComponent(this.gitlabPath(connection))}/repository/files/${encodeURIComponent(path)}/raw?ref=${commitSha}`);
  }

  private chunk(repository: string, commitSha: string, path: string, content: string): RepositoryContentChunkDto[] {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const result: RepositoryContentChunkDto[] = [];
    for (let index = 0; index < lines.length; index += 120) {
      const selected = lines.slice(index, index + 120);
      if (!selected.join("").trim()) continue;
      const startLine = index + 1;
      const endLine = index + selected.length;
      result.push({
        citationId: `${path}#L${startLine}-L${endLine}`,
        repository,
        commitSha,
        path,
        startLine,
        endLine,
        content: selected.join("\n").slice(0, 24_000)
      });
    }
    return result;
  }

  private pathAllowed(path: string, includes: string[], excludes: string[]): boolean {
    const lower = path.toLowerCase();
    const segments = lower.split("/");
    const name = segments.at(-1) ?? "";
    if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment)) || name === ".env" || name.startsWith(".env.")) return false;
    if (FORBIDDEN_EXTENSIONS.has(posix.extname(name))) return false;
    return includes.some((pattern) => this.glob(pattern, path)) && !excludes.some((pattern) => this.glob(pattern, path));
  }

  private glob(pattern: string, path: string): boolean {
    if (pattern === "**/*" || pattern === "**") return true;
    if (pattern.endsWith("/**") && path === pattern.slice(0, -3)) return true;
    const regex = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "__DOUBLE_STAR__").replace(/\*/g, "[^/]*").replace(/__DOUBLE_STAR__/g, ".*");
    return new RegExp(`^${regex}$`).test(path);
  }

  private validateRequestedIncludes(requested: string[], configured: string[]): string[] {
    if (requested.length > 20) throw new BadRequestException("includePaths exceeds the V1 limit");
    return requested.map((path) => {
      const safe = this.safePath(path);
      if (!configured.some((pattern) => this.glob(pattern, safe) || this.glob(pattern, `${safe}/placeholder`))) {
        throw new BadRequestException("includePaths exceeds the configured repository scope");
      }
      return safe.includes("*") ? safe : `${safe.replace(/\/$/, "")}/**`;
    });
  }

  private requestedRef(value: string, allowedBranches: string[]): string {
    if (/^[a-f0-9]{40}$/i.test(value)) return value.toLowerCase();
    if (!allowedBranches.includes(value)) throw new BadRequestException("Requested branch is not allowed for this repository connection");
    return value;
  }

  private hasLikelySecret(content: string): boolean {
    return SECRET_PATTERNS.some((pattern) => pattern.test(content));
  }

  private async remoteJson(connection: RepositoryUseConfiguration, path: string): Promise<unknown> {
    const response = await this.remote(connection, path, "application/json");
    return (await response.json()) as unknown;
  }

  private async remoteText(connection: RepositoryUseConfiguration, path: string): Promise<string> {
    const response = await this.remote(connection, path, "text/plain");
    return response.text();
  }

  private async remote(connection: RepositoryUseConfiguration, path: string, accept: string): Promise<Response> {
    const base = connection.providerType === "github"
      ? "https://api.github.com"
      : `${gitlabRepositoryCoordinates(connection.repositoryIdentifier).baseUrl}/api/v4`;
    const headers: Record<string, string> = { accept, "user-agent": "sekhem-rd-radar-read-only" };
    if (connection.credential) {
      if (connection.providerType === "github") headers.authorization = `Bearer ${connection.credential}`;
      else headers["private-token"] = connection.credential;
    }
    try {
      const response = await this.fetcher(`${base}${path}`, { method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(connection.timeoutMs) });
      if (!response.ok) throw new BadGatewayException("Repository read failed");
      return response;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException("Repository read failed");
    }
  }

  private githubPath(connection: RepositoryUseConfiguration): string {
    const identifier = connection.repositoryIdentifier.replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(identifier)) throw new BadRequestException("GitHub repository identifier is invalid");
    return identifier.split("/").map(encodeURIComponent).join("/");
  }

  private gitlabPath(connection: RepositoryUseConfiguration): string {
    return gitlabRepositoryCoordinates(connection.repositoryIdentifier).projectPath;
  }

  private async gitlabTree(connection: RepositoryUseConfiguration, commitSha: string): Promise<unknown[]> {
    const items: unknown[] = [];
    const path = `/projects/${encodeURIComponent(this.gitlabPath(connection))}/repository/tree?recursive=true&per_page=100&ref=${commitSha}`;
    for (let page = 1; page <= 100; page += 1) {
      const response = await this.remote(connection, `${path}&page=${page}`, "application/json");
      const data = (await response.json()) as unknown;
      if (!Array.isArray(data)) throw new BadGatewayException("Repository tree response is invalid");
      items.push(...data);
      const nextPage = response.headers.get("x-next-page")?.trim() ?? "";
      if (!nextPage && data.length < 100) return items;
      if (nextPage && Number(nextPage) !== page + 1) throw new BadGatewayException("Repository tree pagination is invalid");
    }
    throw new BadGatewayException("Repository tree exceeds the bounded pagination limit");
  }

  private async git(connection: RepositoryUseConfiguration, args: string[], maxBuffer = connection.maximumTotalBytes + 65_536): Promise<string> {
    try {
      const repositoryPath = validatedLocalRepositoryPath(connection.repositoryIdentifier);
      const { stdout } = await execFileAsync("git", ["-C", repositoryPath, ...args], {
        timeout: connection.timeoutMs,
        maxBuffer,
        windowsHide: true,
        encoding: "utf8"
      });
      return stdout.trimEnd();
    } catch {
      throw new BadGatewayException("Local repository read failed");
    }
  }

  private safePath(value: unknown): string {
    const path = this.required(value).replace(/\\/g, "/");
    const normalized = posix.normalize(path);
    if (path.startsWith("/") || path.split("/").includes("..") || normalized.startsWith("../") || normalized === ".." || normalized.includes("\0")) {
      throw new BadRequestException("Repository path is unsafe");
    }
    return normalized;
  }

  private sha(value: unknown): string {
    const sha = this.required(value);
    if (!/^[a-f0-9]{40}$/i.test(sha)) throw new BadGatewayException("Repository commit SHA is invalid");
    return sha.toLowerCase();
  }

  private required(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) throw new BadGatewayException("Repository response is incomplete");
    return value.trim();
  }

  private record(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadGatewayException("Repository response is invalid");
    return value as Record<string, unknown>;
  }
}
