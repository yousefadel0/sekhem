import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatedProviderBaseUrl } from "../src/ai-gateway/provider-url.policy";
import { validatedLocalRepositoryPath } from "../src/repository-source/repository-path.policy";
import { gitlabRepositoryCoordinates, validatedGitlabBaseUrl } from "../src/repository-source/gitlab-url.policy";

describe("Outbound provider and local repository policies", () => {
  it("accepts the Teletech GLM API base exactly once under /v1", () => {
    const baseUrl = "https://teltech.tailb1fa44.ts.net/glm52/v1";
    assert.equal(
      validatedProviderBaseUrl(baseUrl, "vllm_openai_compatible", { SEKHEM_PROVIDER_URL_ALLOWLIST: baseUrl }),
      baseUrl
    );
  });

  it("requires an exact provider URL allowlist entry for HTTPS and HTTP", () => {
    assert.throws(
      () => validatedProviderBaseUrl("https://provider.example.test/v1", "vllm_openai_compatible", {}),
      BadRequestException
    );
    assert.equal(
      validatedProviderBaseUrl("https://provider.example.test/v1", "vllm_openai_compatible", {
        SEKHEM_PROVIDER_URL_ALLOWLIST: "https://provider.example.test/v1"
      }),
      "https://provider.example.test/v1"
    );
    assert.throws(
      () => validatedProviderBaseUrl("http://provider.example.test/v1", "vllm_openai_compatible", {}),
      BadRequestException
    );
    assert.equal(
      validatedProviderBaseUrl("http://provider.example.test/v1", "vllm_openai_compatible", {
        SEKHEM_PROVIDER_URL_ALLOWLIST: "http://provider.example.test/v1"
      }),
      "http://provider.example.test/v1"
    );
    assert.throws(
      () => validatedProviderBaseUrl("http://provider.example.test/other", "vllm_openai_compatible", {
        SEKHEM_PROVIDER_URL_ALLOWLIST: "http://provider.example.test/v1"
      }),
      BadRequestException
    );
  });

  it("rejects embedded credentials and query-shaped provider configuration", () => {
    for (const value of ["https://user:pass@provider.example.test", "https://provider.example.test?token=value", "https://provider.example.test/#fragment"]) {
      assert.throws(() => validatedProviderBaseUrl(value, "vllm_openai_compatible", {}), BadRequestException);
    }
  });

  it("does not treat encoded, DNS-suffix, numeric, or IPv6 variants as an allowlisted provider", () => {
    const env = { SEKHEM_PROVIDER_URL_ALLOWLIST: "https://provider.example.test/v1" };
    for (const value of [
      "https://provider.example.test%2e.attacker/v1",
      "https://provider.example.test./v1",
      "http://2130706433:8000",
      "http://[::ffff:127.0.0.1]:8000"
    ]) {
      assert.throws(() => validatedProviderBaseUrl(value, "vllm_openai_compatible", env), BadRequestException);
    }
  });

  it("allows only canonical paths beneath an explicit root and rejects a symlink escape", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "sekhem-repository-policy-"));
    const root = join(temporaryRoot, "allowed");
    const child = join(root, "product");
    const outside = join(temporaryRoot, "private");
    mkdirSync(child, { recursive: true });
    mkdirSync(outside, { recursive: true });

    try {
      assert.equal(validatedLocalRepositoryPath(child, { SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS: root }).endsWith("product"), true);
      assert.throws(
        () => validatedLocalRepositoryPath(outside, { SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS: root }),
        BadRequestException
      );
      assert.throws(() => validatedLocalRepositoryPath(child, {}), BadRequestException);

      const escape = join(root, "escape");
      symlinkSync(outside, escape, process.platform === "win32" ? "junction" : "dir");
      assert.throws(
        () => validatedLocalRepositoryPath(escape, { SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS: root }),
        BadRequestException
      );
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("allows only configured HTTPS self-managed GitLab origins", () => {
    const env = {
      SEKHEM_GITLAB_BASE_URL: "https://gitlab.internal.test",
      SEKHEM_GITLAB_ALLOWED_BASE_URLS: "https://gitlab.internal.test"
    };
    assert.equal(validatedGitlabBaseUrl(env.SEKHEM_GITLAB_BASE_URL, env), "https://gitlab.internal.test");
    assert.deepEqual(gitlabRepositoryCoordinates("https://gitlab.internal.test/group/project.git", env), {
      baseUrl: "https://gitlab.internal.test",
      projectPath: "group/project"
    });
    assert.throws(() => validatedGitlabBaseUrl("http://gitlab.internal.test", env), BadRequestException);
    assert.throws(() => gitlabRepositoryCoordinates("https://unapproved.test/group/project", env), BadRequestException);
  });

  it("rejects GitLab URL credential, encoding, traversal, DNS-suffix, and IPv6 bypass variants", () => {
    const env = { SEKHEM_GITLAB_ALLOWED_BASE_URLS: "https://gitlab.internal.test" };
    for (const value of [
      "https://user:pass@gitlab.internal.test/group/project",
      "https://gitlab.internal.test/group/project?private_token=value",
      "https://gitlab.internal.test/group/project#fragment",
      "https://gitlab.internal.test%2e.attacker/group/project",
      "https://gitlab.internal.test./group/project",
      "https://[::1]/group/project",
      "https://gitlab.internal.test/group/%252e%252e/project"
    ]) {
      assert.throws(() => gitlabRepositoryCoordinates(value, env), BadRequestException);
    }
  });
});
