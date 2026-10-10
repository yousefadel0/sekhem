import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import type { RepositoryUseConfiguration } from "../src/ai-gateway/runtime-configuration.dto";
import { RepositoryContentService } from "../src/repository-source/repository-content.service";
import { RepositorySourceService } from "../src/repository-source/repository-source.service";

const sha = "a".repeat(40);
const connection: RepositoryUseConfiguration = {
  id: "repository-test", displayName: "Public test", providerType: "github", repositoryIdentifier: "owner/repository",
  credentialConfigured: false, credential: null, defaultBranch: "main", allowedBranches: ["main"], includePaths: ["src/**"], excludePaths: [],
  maximumFileBytes: 50_000, maximumTotalBytes: 100_000, maximumFileCount: 10, timeoutMs: 1_000, enabled: true,
  createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z"
};

describe("read-only repository content collection", () => {
  it("pins a branch to a SHA, filters unsafe content, and creates accurate line citations using GET only", async () => {
    const methods: string[] = [];
    const stages: string[] = [];
    const lines = Array.from({ length: 121 }, (_, index) => `line-${index + 1}`).join("\n");
    const service = new RepositoryContentService(async (input, init) => {
      methods.push(init?.method ?? "GET");
      const url = String(input);
      if (url.includes("/commits/main")) return Response.json({ sha });
      if (url.includes("/git/trees/")) return Response.json({ tree: [
        { type: "blob", mode: "100644", path: "src/live.ts", size: lines.length },
        { type: "blob", mode: "100644", path: ".env", size: 20 },
        { type: "blob", mode: "120000", path: "src/link.ts", size: 10 },
        { type: "blob", mode: "100644", path: "node_modules/ignored.js", size: 10 },
      ] });
      return Response.json({ encoding: "base64", content: Buffer.from(lines).toString("base64") });
    });
    const snapshot = await service.snapshot(connection, "main", undefined, (stage) => stages.push(stage));
    assert.equal(snapshot.commitSha, sha);
    assert.equal(snapshot.fileCount, 1);
    assert.equal(snapshot.chunks.length, 2);
    assert.deepEqual(snapshot.chunks.map((chunk) => [chunk.path, chunk.startLine, chunk.endLine]), [["src/live.ts", 1, 120], ["src/live.ts", 121, 121]]);
    assert.equal(methods.every((method) => method === "GET"), true);
    assert.deepEqual(stages, ["REPOSITORY_COMMIT", "REPOSITORY_TREE", "REPOSITORY_FILE"]);
  });

  it("rejects traversal and excludes likely secrets before model submission", async () => {
    const service = new RepositoryContentService(async (input) => {
      const url = String(input);
      if (url.includes("/commits/main")) return Response.json({ sha });
      if (url.includes("/git/trees/")) return Response.json({ tree: [{ type: "blob", mode: "100644", path: "src/config.ts", size: 100 }] });
      return Response.json({ encoding: "base64", content: Buffer.from('apiKey="this-is-a-long-test-secret"').toString("base64") });
    });
    await assert.rejects(() => service.snapshot(connection, "main", ["../outside"]), BadRequestException);
    await assert.rejects(() => service.snapshot(connection, "main"), /no permitted safe text files/i);
  });

  it("fails closed when GitHub reports a truncated recursive tree", async () => {
    const service = new RepositoryContentService(async (input, init) => {
      assert.equal(init?.redirect, "error");
      const url = String(input);
      if (url.includes("/commits/main")) return Response.json({ sha });
      return Response.json({ truncated: true, tree: [] });
    });

    await assert.rejects(() => service.snapshot(connection, "main"), /tree response is truncated/i);
  });

  it("reads every bounded GitLab tree page from an explicitly allowed self-managed origin", async () => {
    const previousBase = process.env.SEKHEM_GITLAB_BASE_URL;
    const previousAllowed = process.env.SEKHEM_GITLAB_ALLOWED_BASE_URLS;
    process.env.SEKHEM_GITLAB_BASE_URL = "https://gitlab.internal.test";
    process.env.SEKHEM_GITLAB_ALLOWED_BASE_URLS = "https://gitlab.internal.test";
    const gitlabConnection = { ...connection, providerType: "gitlab" as const, repositoryIdentifier: "group/project", maximumFileCount: 1 };
    const treePages: number[] = [];
    const service = new RepositoryContentService(async (input, init) => {
      assert.equal(init?.redirect, "error");
      const url = String(input);
      assert.equal(url.startsWith("https://gitlab.internal.test/api/v4/"), true);
      if (url.includes("/commits/main")) return Response.json({ id: sha });
      if (url.includes("/repository/tree")) {
        const page = Number(new URL(url).searchParams.get("page"));
        treePages.push(page);
        const entries = page === 1
          ? Array.from({ length: 100 }, (_, index) => ({ type: "blob", path: `src/file-${index}.ts` }))
          : [{ type: "blob", path: "src/file-100.ts" }];
        return Response.json(entries, { headers: page === 1 ? { "x-next-page": "2" } : {} });
      }
      return new Response("export const safe = true;");
    });

    try {
      const snapshot = await service.snapshot(gitlabConnection, "main");
      assert.deepEqual(treePages, [1, 2]);
      assert.equal(snapshot.fileCount, 1);
      assert.equal(snapshot.skippedFiles, 100);
    } finally {
      if (previousBase === undefined) delete process.env.SEKHEM_GITLAB_BASE_URL;
      else process.env.SEKHEM_GITLAB_BASE_URL = previousBase;
      if (previousAllowed === undefined) delete process.env.SEKHEM_GITLAB_ALLOWED_BASE_URLS;
      else process.env.SEKHEM_GITLAB_ALLOWED_BASE_URLS = previousAllowed;
    }
  });

  it("fails the repository connection test when filtering leaves zero allowed branches", async () => {
    const configurations = { repositoryForUse: async () => connection };
    const reader = { branches: async () => [] };
    const service = new RepositorySourceService({} as never, configurations as never, reader as never);

    await assert.rejects(() => service.testConnection(connection.id), /no configured allowed branch/i);
  });
});
