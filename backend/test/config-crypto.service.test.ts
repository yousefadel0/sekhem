import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { ConfigCryptoService } from "../src/config-crypto.service";
import { RuntimeConfigurationService } from "../src/ai-gateway/runtime-configuration.service";
import {
  ProviderDialectTestError,
  type ProviderDialectTestDiagnostic
} from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";

function dialectDiagnostic(overrides: Partial<ProviderDialectTestDiagnostic> = {}): ProviderDialectTestDiagnostic {
  return {
    stage: "DIALECT_SCHEMA_VALIDATE",
    attemptedDialect: "LLAMACPP_JSON_SCHEMA",
    reasonCode: null,
    upstreamHttpStatus: 200,
    transportErrorType: null,
    transportErrorCode: "SUCCESS",
    responseReceived: true,
    generationStarted: true,
    contentPresent: true,
    jsonParseResult: "PASS",
    schemaIssues: [],
    finishReason: "stop",
    promptTokens: 4,
    completionTokens: 2,
    ...overrides
  };
}

class FakeConfigurationPrisma {
  provider: Record<string, unknown> | null = null;
  model: Record<string, unknown> | null = null;
  repository: Record<string, unknown> | null = null;
  audits: Record<string, unknown>[] = [];
  failProviderUpdate = false;
  aiProviderConfiguration = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.provider = { ...data, createdAt: new Date(), updatedAt: new Date() };
      return this.provider;
    },
    findUnique: async () => this.provider,
    update: async ({ data }: { data: Record<string, unknown> }) => {
      if (this.failProviderUpdate) throw new Error("database detail must not leak");
      this.provider = { ...this.provider, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)), updatedAt: new Date() };
      return this.provider;
    }
  };
  aiModelConfiguration = {
    findFirst: async () => this.model
  };
  repositoryConnection = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      this.repository = { ...data, createdAt: new Date(), updatedAt: new Date() };
      return this.repository;
    }
  };
  configurationAuditEvent = {
    create: async ({ data }: { data: Record<string, unknown> }) => { this.audits.push(data); return data; }
  };
}

describe("persisted configuration encryption", () => {
  const previous = { ...process.env };
  beforeEach(() => { process.env.SEKHEM_PROVIDER_URL_ALLOWLIST = "http://100.64.0.20:8000"; });
  afterEach(() => { process.env = { ...previous }; });

  it("encrypts credentials with authenticated encryption and never embeds plaintext", () => {
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
    const crypto = new ConfigCryptoService();
    const encrypted = crypto.encrypt("test-only-sensitive-value");
    assert.match(encrypted, /^v1:/);
    assert.equal(encrypted.includes("test-only-sensitive-value"), false);
    assert.equal(crypto.decrypt(encrypted), "test-only-sensitive-value");
  });

  it("supports a controlled previous-key rotation window", () => {
    const crypto = new ConfigCryptoService();
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 8).toString("hex");
    const encrypted = crypto.encrypt("rotation-test-value");
    process.env.SEKHEM_CONFIG_MASTER_KEY_PREVIOUS = process.env.SEKHEM_CONFIG_MASTER_KEY;
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 9).toString("hex");
    assert.equal(crypto.decrypt(encrypted), "rotation-test-value");
  });

  it("stores provider and repository credentials encrypted while DTOs and audits expose only configured flags", async () => {
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 10).toString("base64");
    const prisma = new FakeConfigurationPrisma();
    const service = new RuntimeConfigurationService(new ConfigCryptoService(), { testConnection: async () => undefined } as never);
    (service as unknown as { prisma: FakeConfigurationPrisma }).prisma = prisma;
    const provider = await service.createProvider({ displayName: "Local test", providerType: "vllm_openai_compatible", baseUrl: "http://100.64.0.20:8000", apiKey: "test-provider-credential", defaultTimeoutMs: 5_000 });
    const repository = await service.createRepository({ displayName: "Private test", providerType: "github", repositoryIdentifier: "owner/repository", credential: "test-repository-credential", defaultBranch: "main", allowedBranches: ["main"], includePaths: ["src/**"], excludePaths: [] });
    assert.equal(provider.apiKeyConfigured, true);
    assert.equal(repository.credentialConfigured, true);
    assert.equal(JSON.stringify(provider).includes("test-provider-credential"), false);
    assert.equal(JSON.stringify(repository).includes("test-repository-credential"), false);
    assert.equal(String(prisma.provider?.encryptedApiKey).includes("test-provider-credential"), false);
    assert.equal(String(prisma.repository?.encryptedCredential).includes("test-repository-credential"), false);
    assert.equal(JSON.stringify(prisma.audits).includes("test-provider-credential"), false);
    assert.equal(JSON.stringify(prisma.audits).includes("test-repository-credential"), false);
  });

  it("accepts bounded provider timeouts and preserves provider configuration and encrypted credentials", async () => {
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
    const prisma = new FakeConfigurationPrisma();
    const service = new RuntimeConfigurationService(new ConfigCryptoService(), { testConnection: async () => undefined } as never);
    (service as unknown as { prisma: FakeConfigurationPrisma }).prisma = prisma;
    const created = await service.createProvider({
      displayName: "Local test",
      providerType: "vllm_openai_compatible",
      baseUrl: "http://100.64.0.20:8000",
      apiKey: "test-provider-credential",
      defaultTimeoutMs: 120_000
    });
    const encryptedCredential = prisma.provider?.encryptedApiKey;

    assert.equal(created.defaultTimeoutMs, 120_000);
    const updated = await service.updateProvider(created.id, { defaultTimeoutMs: 600_000 });
    assert.equal(updated.defaultTimeoutMs, 600_000);
    assert.equal(updated.displayName, created.displayName);
    assert.equal(updated.baseUrl, created.baseUrl);
    assert.equal(updated.apiKeyConfigured, true);
    assert.equal(prisma.provider?.encryptedApiKey, encryptedCredential);
    await assert.rejects(() => service.updateProvider(created.id, { defaultTimeoutMs: 600_001 }), BadRequestException);
    assert.equal(prisma.provider?.defaultTimeoutMs, 600_000);
    assert.equal(prisma.provider?.encryptedApiKey, encryptedCredential);
  });

  it("detects and verifies the llama.cpp structured-output dialect before activation", async () => {
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 12).toString("base64");
    const prisma = new FakeConfigurationPrisma();
    let verifiedDialect: string | null = null;
    let verifiedMaxOutputTokens: number | null = null;
    const service = new RuntimeConfigurationService(new ConfigCryptoService(), {
      discoverModelMetadata: async () => [{ id: "live-model", ownedBy: "llamacpp" }],
      testStructuredOutputDialect: async (_configuration: unknown, _modelId: string, dialect: string, maxOutputTokens: number) => {
        verifiedDialect = dialect;
        verifiedMaxOutputTokens = maxOutputTokens;
        return dialectDiagnostic();
      }
    } as never);
    (service as unknown as { prisma: FakeConfigurationPrisma }).prisma = prisma;
    const provider = await service.createProvider({ displayName: "Local test", providerType: "vllm_openai_compatible", baseUrl: "http://100.64.0.20:8000", apiKey: "test-provider-credential" });
    prisma.model = { id: "model-config", providerId: provider.id, modelId: "live-model", enabled: true, defaultForProvider: true, maxOutputTokens: 3072 };
    const tested = await service.testProvider(provider.id);
    assert.equal(verifiedDialect, "LLAMACPP_JSON_SCHEMA");
    assert.equal(verifiedMaxOutputTokens, 3072);
    assert.equal(tested.structuredOutputDialect, "LLAMACPP_JSON_SCHEMA");
    assert.ok(tested.structuredOutputVerifiedAt);
    assert.equal(tested.healthState, "healthy");
    const activated = await service.setProviderEnabled(provider.id, true);
    assert.equal(activated.enabled, true);
  });

  it("persists a sanitized dialect failure and keeps the provider disabled", async () => {
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 13).toString("base64");
    const prisma = new FakeConfigurationPrisma();
    const failure = new ProviderDialectTestError("DIALECT_JSON_INVALID", dialectDiagnostic({
      stage: "DIALECT_JSON_PARSE",
      reasonCode: "DIALECT_JSON_INVALID",
      jsonParseResult: "FAIL"
    }));
    const service = new RuntimeConfigurationService(new ConfigCryptoService(), {
      discoverModelMetadata: async () => [{ id: "live-model", ownedBy: "llamacpp" }],
      testStructuredOutputDialect: async () => { throw failure; }
    } as never);
    (service as unknown as { prisma: FakeConfigurationPrisma }).prisma = prisma;
    const provider = await service.createProvider({
      displayName: "Local test",
      providerType: "vllm_openai_compatible",
      baseUrl: "http://100.64.0.20:8000",
      apiKey: "credential-must-not-leak"
    });
    prisma.model = { id: "model-config", providerId: provider.id, modelId: "live-model", enabled: true, defaultForProvider: true };

    await assert.rejects(() => service.testProvider(provider.id), (error: unknown) => {
      assert.ok(error instanceof BadGatewayException);
      assert.equal(error.message, "DIALECT_JSON_INVALID");
      return true;
    });
    assert.equal(prisma.provider?.healthState, "unavailable");
    assert.equal(prisma.provider?.enabled, false);
    const audit = prisma.audits.at(-1) as { sanitizedDetails?: { healthy?: boolean; diagnostic?: ProviderDialectTestDiagnostic } };
    assert.equal(audit.sanitizedDetails?.healthy, false);
    assert.equal(audit.sanitizedDetails?.diagnostic?.reasonCode, "DIALECT_JSON_INVALID");
    assert.equal(JSON.stringify(prisma.audits).includes("credential-must-not-leak"), false);
  });

  it("returns DIALECT_PERSISTENCE without leaking database errors", async () => {
    process.env.SEKHEM_CONFIG_MASTER_KEY = Buffer.alloc(32, 14).toString("base64");
    const prisma = new FakeConfigurationPrisma();
    let dialectCallExecuted = false;
    const service = new RuntimeConfigurationService(new ConfigCryptoService(), {
      discoverModelMetadata: async () => [{ id: "live-model", ownedBy: "llamacpp" }],
      testStructuredOutputDialect: async () => { dialectCallExecuted = true; return dialectDiagnostic(); }
    } as never);
    (service as unknown as { prisma: FakeConfigurationPrisma }).prisma = prisma;
    const provider = await service.createProvider({
      displayName: "Local test",
      providerType: "vllm_openai_compatible",
      baseUrl: "http://100.64.0.20:8000",
      apiKey: "credential-must-not-leak"
    });
    prisma.model = { id: "model-config", providerId: provider.id, modelId: "live-model", enabled: true, defaultForProvider: true };
    prisma.failProviderUpdate = true;

    await assert.rejects(() => service.testProvider(provider.id), (error: unknown) => {
      assert.ok(error instanceof BadGatewayException);
      assert.equal(error.message, "DIALECT_PERSISTENCE");
      assert.equal(error.message.includes("database detail must not leak"), false);
      return true;
    });
    assert.equal(dialectCallExecuted, false);
    const audit = prisma.audits.at(-1) as { sanitizedDetails?: { diagnostic?: ProviderDialectTestDiagnostic } };
    assert.equal(audit.sanitizedDetails?.diagnostic?.reasonCode, "DIALECT_PERSISTENCE");
  });
});
