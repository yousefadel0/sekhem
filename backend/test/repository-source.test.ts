import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { GithubRepositorySourceAdapter } from "../src/repository-source/providers/github/github-repository-source.adapter";
import { GitlabRepositorySourceAdapter } from "../src/repository-source/providers/gitlab/gitlab-repository-source.adapter";
import { LocalRepositorySourceAdapter } from "../src/repository-source/providers/local/local-repository-source.adapter";
import type { RepositorySourceAdapter } from "../src/repository-source/repository-source.adapter";
import { RepositorySourceController } from "../src/repository-source/repository-source.controller";
import type { RepositorySourceCapabilitiesDto, RepositorySourceProviderName, RepositorySourceStatusDto } from "../src/repository-source/repository-source.dto";
import { RepositorySourceProviderRegistry } from "../src/repository-source/repository-source.provider-registry";
import { RepositorySourceService } from "../src/repository-source/repository-source.service";

const readOnlyCapabilities: RepositorySourceCapabilitiesDto = {
  readStatus: true,
  listBranches: true,
  readLatestCommit: true,
  createBranch: false,
  createCommit: false,
  createPullRequest: false,
  createIssue: false,
  triggerWorkflow: false
};

const statusFor = (providerName: RepositorySourceProviderName, providerType: RepositorySourceStatusDto["providerType"] = "hosted_git"): RepositorySourceStatusDto => ({
  providerType,
  providerName,
  repository: {
    namespace: providerName === "local" ? "local" : "sonic-net",
    name: providerName === "local" ? "repository" : "sonic-buildimage",
    fullName: providerName === "local" ? "local/repository" : "sonic-net/sonic-buildimage",
    webUrl: providerName === "local" ? "local://repository" : "https://example.invalid/sonic-net/sonic-buildimage",
    defaultBranch: "master"
  },
  branches: [
    {
      name: "master",
      isDefault: true,
      protectionEnabled: providerName !== "local",
      latestCommitSha: "abc123"
    }
  ],
  latestCommit: {
    sha: "abc123",
    title: "Read-only repository summary",
    committedAt: "2026-05-31T00:00:00.000Z"
  },
  readiness: "ready",
  capabilities: readOnlyCapabilities,
  lastCheckedAt: "2026-05-31T00:00:00.000Z",
  message: "Repository readiness is available in read-only mode.",
  errorCode: null
});

const assertWriteCapabilitiesFalse = (capabilities: RepositorySourceCapabilitiesDto): void => {
  assert.equal(capabilities.createBranch, false);
  assert.equal(capabilities.createCommit, false);
  assert.equal(capabilities.createPullRequest, false);
  assert.equal(capabilities.createIssue, false);
  assert.equal(capabilities.triggerWorkflow, false);
};

class SwitcherTestRegistry {
  resolve(provider?: RepositorySourceProviderName): RepositorySourceAdapter {
    if (provider === undefined || provider === "github") {
      return { readStatus: async () => statusFor("github") };
    }

    if (provider === "gitlab") {
      return { readStatus: async () => statusFor("gitlab") };
    }

    if (provider === "local") {
      return { readStatus: async () => statusFor("local", "local_git") };
    }

    throw new BadRequestException("Repository source provider is unavailable for read-only status.");
  }
}

@Module({
  controllers: [RepositorySourceController],
  providers: [
    RepositorySourceService,
    {
      provide: RepositorySourceProviderRegistry,
      useValue: new SwitcherTestRegistry()
    }
  ]
})
class RepositorySourceTestModule {}

describe("GithubRepositorySourceAdapter read-only provider", () => {
  it("uses GET only and maps provider data into provider-neutral status", async () => {
    const methods: string[] = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      methods.push(init?.method ?? "GET");
      const url = String(input);

      if (url.endsWith("/branches?per_page=5")) {
        return Response.json([{ name: "master", protected: true, commit: { sha: "abc123" } }]);
      }

      if (url.endsWith("/commits/master")) {
        return Response.json({ sha: "abc123", commit: { message: "Read-only repository summary\nDetails", committer: { date: "2026-05-31T00:00:00.000Z" } } });
      }

      return Response.json({
        name: "sonic-buildimage",
        full_name: "sonic-net/sonic-buildimage",
        html_url: "https://example.invalid/sonic-net/sonic-buildimage",
        default_branch: "master",
        owner: { login: "sonic-net" }
      });
    };
    const adapter = new GithubRepositorySourceAdapter(fetcher, "sonic-net/sonic-buildimage");

    const status = await adapter.readStatus();

    assert.deepEqual(methods, ["GET", "GET", "GET"]);
    assert.equal(status.providerType, "hosted_git");
    assert.equal(status.providerName, "github");
    assert.equal(status.readiness, "ready");
    assert.equal(status.repository?.fullName, "sonic-net/sonic-buildimage");
    assert.equal(status.latestCommit?.title, "Read-only repository summary");
    assertWriteCapabilitiesFalse(status.capabilities);
  });

  it("returns a safe unavailable status without leaking provider errors", async () => {
    const adapter = new GithubRepositorySourceAdapter(async () => {
      throw new Error("token=secret provider failure");
    });

    const status = await adapter.readStatus();
    const serialized = JSON.stringify(status);

    assert.equal(status.providerName, "github");
    assert.equal(status.readiness, "unavailable");
    assert.equal(status.errorCode, "REPOSITORY_SOURCE_UNAVAILABLE");
    assert.equal(serialized.includes("token"), false);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("provider failure"), false);
    assertWriteCapabilitiesFalse(status.capabilities);
  });
});

describe("GitlabRepositorySourceAdapter read-only provider", () => {
  it("uses GET only and maps GitLab data into provider-neutral status", async () => {
    const methods: string[] = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      methods.push(init?.method ?? "GET");
      const url = String(input);

      if (url.endsWith("/repository/branches?per_page=5")) {
        return Response.json([{ name: "main", protected: true, commit: { id: "def456" } }]);
      }

      if (url.endsWith("/repository/commits/main")) {
        return Response.json({ id: "def456", title: "Read-only GitLab summary", committed_date: "2026-05-31T00:00:00.000Z" });
      }

      return Response.json({
        path: "gitlab",
        path_with_namespace: "gitlab-org/gitlab",
        web_url: "https://example.invalid/gitlab-org/gitlab",
        default_branch: "main",
        namespace: { full_path: "gitlab-org" }
      });
    };
    const adapter = new GitlabRepositorySourceAdapter(fetcher, "gitlab-org/gitlab");

    const status = await adapter.readStatus();

    assert.deepEqual(methods, ["GET", "GET", "GET"]);
    assert.equal(status.providerType, "hosted_git");
    assert.equal(status.providerName, "gitlab");
    assert.equal(status.readiness, "ready");
    assert.equal(status.repository?.fullName, "gitlab-org/gitlab");
    assert.equal(status.latestCommit?.title, "Read-only GitLab summary");
    assertWriteCapabilitiesFalse(status.capabilities);
  });

  it("returns safe unavailable GitLab status without leaking errors", async () => {
    const adapter = new GitlabRepositorySourceAdapter(async () => {
      throw new Error("token=secret gitlab provider failure");
    });

    const status = await adapter.readStatus();
    const serialized = JSON.stringify(status);

    assert.equal(status.providerName, "gitlab");
    assert.equal(status.readiness, "unavailable");
    assert.equal(status.errorCode, "REPOSITORY_SOURCE_UNAVAILABLE");
    assert.equal(serialized.includes("token"), false);
    assert.equal(serialized.includes("secret"), false);
    assertWriteCapabilitiesFalse(status.capabilities);
  });

  it("uses an explicitly allowed self-managed GitLab base without redirects", async () => {
    const urls: string[] = [];
    const adapter = new GitlabRepositorySourceAdapter(async (input, init) => {
      urls.push(String(input));
      assert.equal(init?.method, "GET");
      assert.equal(init?.redirect, "error");
      const url = String(input);
      if (url.endsWith("/repository/branches?per_page=5")) return Response.json([{ name: "main", protected: true, commit: { id: "def456" } }]);
      if (url.endsWith("/repository/commits/main")) return Response.json({ id: "def456", title: "Commit", committed_date: null });
      return Response.json({ path: "project", path_with_namespace: "group/project", web_url: "https://gitlab.internal.test/group/project", default_branch: "main", namespace: { full_path: "group" } });
    }, "group/project", "https://gitlab.internal.test", {
      SEKHEM_GITLAB_ALLOWED_BASE_URLS: "https://gitlab.internal.test"
    });

    const status = await adapter.readStatus();
    assert.equal(status.readiness, "ready");
    assert.equal(urls.length, 3);
    assert.equal(urls.every((url) => url.startsWith("https://gitlab.internal.test/api/v4/")), true);
  });
});

describe("LocalRepositorySourceAdapter read-only provider", () => {
  it("uses local git read-only output without exposing absolute paths", async () => {
    const calls: string[][] = [];
    const runner = async (args: string[]): Promise<string> => {
      calls.push(args);

      switch (args.join(" ")) {
        case "branch --show-current":
          return "main";
        case "rev-parse HEAD":
          return "ghi789";
        case "log -1 --pretty=%s":
          return "Read-only local summary";
        case "log -1 --format=%cI":
          return "2026-05-31T00:00:00.000Z";
        case "branch --format=%(refname:short)|%(objectname)":
          return "main|ghi789\nfeature/read-only|jkl012";
        default:
          throw new Error("unexpected git command");
      }
    };
    const adapter = new LocalRepositorySourceAdapter(runner);

    const status = await adapter.readStatus();
    const serialized = JSON.stringify(status);

    assert.deepEqual(calls, [
      ["branch", "--show-current"],
      ["rev-parse", "HEAD"],
      ["log", "-1", "--pretty=%s"],
      ["log", "-1", "--format=%cI"],
      ["branch", "--format=%(refname:short)|%(objectname)"]
    ]);
    assert.equal(status.providerType, "local_git");
    assert.equal(status.providerName, "local");
    assert.equal(status.readiness, "ready");
    assert.equal(status.repository?.fullName, "local/repository");
    assert.equal(status.branches.length, 2);
    assert.equal(serialized.includes("C:\\"), false);
    assert.equal(serialized.includes("/home/"), false);
    assertWriteCapabilitiesFalse(status.capabilities);
  });

  it("returns safe unavailable local status without leaking errors", async () => {
    const adapter = new LocalRepositorySourceAdapter(async () => {
      throw new Error("C:\\internal\\secret\\path");
    });

    const status = await adapter.readStatus();
    const serialized = JSON.stringify(status);

    assert.equal(status.providerName, "local");
    assert.equal(status.readiness, "unavailable");
    assert.equal(status.errorCode, "REPOSITORY_SOURCE_UNAVAILABLE");
    assert.equal(serialized.includes("C:\\"), false);
    assert.equal(serialized.includes("secret"), false);
    assertWriteCapabilitiesFalse(status.capabilities);
  });
});

describe("RepositorySourceProviderRegistry", () => {
  it("selects GitHub, GitLab, and local providers safely", () => {
    const registry = new RepositorySourceProviderRegistry();

    assert.equal(registry.resolve("github") instanceof GithubRepositorySourceAdapter, true);
    assert.equal(registry.resolve("gitlab") instanceof GitlabRepositorySourceAdapter, true);
    assert.equal(registry.resolve("local") instanceof LocalRepositorySourceAdapter, true);
  });

  it("fails closed for invalid providers", () => {
    const registry = new RepositorySourceProviderRegistry();

    assert.throws(() => registry.resolve("bitbucket" as RepositorySourceProviderName), BadRequestException);
  });
});

describe("Repository source HTTP contract", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    app = await NestFactory.create(RepositorySourceTestModule, { logger: false });
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0);

    const server = app.getHttpServer() as { address: () => string | { port: number } | null };
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Expected HTTP server to listen on a local port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
  });

  it("preserves default wrapped provider-neutral read-only status", async () => {
    const response = await fetch(`${baseUrl}/api/repository-source/status`);
    const body = (await response.json()) as { data: RepositorySourceStatusDto; errors: unknown[] };

    assert.equal(response.status, 200);
    assert.equal(body.data.providerName, "github");
    assert.equal(body.data.providerType, "hosted_git");
    assert.equal(body.data.repository?.fullName, "sonic-net/sonic-buildimage");
    assert.equal(body.data.branches.length, 1);
    assert.equal(body.data.latestCommit?.sha, "abc123");
    assert.equal(body.data.readiness, "ready");
    assertWriteCapabilitiesFalse(body.data.capabilities);
    assert.deepEqual(body.errors, []);
  });

  it("selects requested providers by safe query contract", async () => {
    for (const provider of ["github", "gitlab", "local"] as const) {
      const response = await fetch(`${baseUrl}/api/repository-source/status?provider=${provider}`);
      const body = (await response.json()) as { data: RepositorySourceStatusDto; errors: unknown[] };

      assert.equal(response.status, 200);
      assert.equal(body.data.providerName, provider);
      assertWriteCapabilitiesFalse(body.data.capabilities);
      assert.deepEqual(body.errors, []);
    }
  });

  it("fails closed for invalid providers with normalized safe error", async () => {
    const response = await fetch(`${baseUrl}/api/repository-source/status?provider=bitbucket`);
    const body = (await response.json()) as { data: null; errors: Array<{ message: string }> };
    const serialized = JSON.stringify(body);

    assert.equal(response.status, 400);
    assert.equal(body.data, null);
    assert.equal(body.errors[0]?.message, "Repository source provider is unavailable for read-only status.");
    assert.equal(serialized.includes("token"), false);
    assert.equal(serialized.includes("secret"), false);
  });

  it("does not expose write methods", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/repository-source/status`, { method });
      assert.equal(response.status >= 400, true);
    }
  });
});
