import { BadGatewayException, BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../data-access/prisma.service";
import { randomUUID } from "node:crypto";
import { ConfigCryptoService } from "../config-crypto.service";
import type {
  RepositoryConnectionDto,
  RepositoryConnectionProviderType,
  RepositoryUseConfiguration,
  RuntimeModelDto,
  RuntimeProviderDto,
  RuntimeProviderType,
  RuntimeProviderUseConfiguration,
  RuntimeTaskCategory,
  StructuredOutputDialect
} from "./runtime-configuration.dto";
import {
  ProviderDialectTestError,
  VllmOpenAiCompatibleAdapter,
  type ProviderDialectFailureCode,
  type ProviderDialectTestDiagnostic
} from "./providers/vllm-openai-compatible.adapter";
import { validatedProviderBaseUrl } from "./provider-url.policy";
import { validatedLocalRepositoryPath } from "../repository-source/repository-path.policy";
import { gitlabRepositoryCoordinates } from "../repository-source/gitlab-url.policy";

const PROVIDER_TYPES = new Set<RuntimeProviderType>(["vllm_openai_compatible", "mock"]);
const REPOSITORY_TYPES = new Set<RepositoryConnectionProviderType>(["github", "gitlab", "local"]);
const TASKS = new Set<RuntimeTaskCategory>(["repository_analysis", "risk_review", "evidence_summary"]);
export const DEFAULT_PROVIDER_TIMEOUT_MS = 120_000;
const MAX_PROVIDER_TIMEOUT_MS = 600_000;
const STRUCTURED_OUTPUT_DIALECTS = new Set<StructuredOutputDialect>(["LLAMACPP_JSON_SCHEMA", "OPENAI_JSON_SCHEMA", "VLLM_STRUCTURED_OUTPUTS", "JSON_OBJECT_ONLY"]);

@Injectable()
export class RuntimeConfigurationService {
  private readonly prisma: PrismaService;
  private readonly logger = new Logger(RuntimeConfigurationService.name);

  constructor(
    @Inject(ConfigCryptoService) private readonly crypto: ConfigCryptoService,
    @Inject(VllmOpenAiCompatibleAdapter) private readonly vllm: VllmOpenAiCompatibleAdapter,
    @Optional() @Inject(PrismaService) prismaService?: PrismaService
  ) {
    this.prisma = prismaService!;
  }

  async providers(): Promise<RuntimeProviderDto[]> {
    return (await this.prisma.aiProviderConfiguration.findMany({ orderBy: { displayName: "asc" } })).map((item) => this.providerDto(item));
  }

  async createProvider(body: unknown): Promise<RuntimeProviderDto> {
    const value = this.record(body);
    const providerType = this.providerType(value.providerType);
    const item = await this.prisma.aiProviderConfiguration.create({
      data: {
        id: `ai-provider-${randomUUID()}`,
        displayName: this.text(value.displayName, "displayName", 120),
        providerType,
        baseUrl: this.providerUrl(value.baseUrl, providerType),
        encryptedApiKey: this.optionalCredential(value.apiKey),
        enabled: false,
        healthState: "untested",
        defaultTimeoutMs: this.integer(value.defaultTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS, "defaultTimeoutMs", 1_000, MAX_PROVIDER_TIMEOUT_MS)
      }
    });
    await this.audit(value.changedBy, "provider_created", "ai_provider", item.id, { providerType, apiKeyConfigured: Boolean(item.encryptedApiKey) });
    return this.providerDto(item);
  }

  async updateProvider(id: string, body: unknown): Promise<RuntimeProviderDto> {
    const current = await this.providerRecord(id);
    const value = this.record(body);
    const providerType = value.providerType === undefined ? this.providerType(current.providerType) : this.providerType(value.providerType);
    const dialectChanged = value.structuredOutputDialect !== undefined;
    const connectionChanged = value.baseUrl !== undefined || value.apiKey !== undefined || value.providerType !== undefined || dialectChanged;
    const item = await this.prisma.aiProviderConfiguration.update({
      where: { id },
      data: {
        displayName: value.displayName === undefined ? undefined : this.text(value.displayName, "displayName", 120),
        providerType: value.providerType === undefined ? undefined : providerType,
        baseUrl: value.baseUrl === undefined ? undefined : this.providerUrl(value.baseUrl, providerType),
        encryptedApiKey: value.apiKey === undefined ? undefined : this.optionalCredential(value.apiKey),
        defaultTimeoutMs:
          value.defaultTimeoutMs === undefined ? undefined : this.integer(value.defaultTimeoutMs, "defaultTimeoutMs", 1_000, MAX_PROVIDER_TIMEOUT_MS),
        structuredOutputDialect: dialectChanged ? this.structuredOutputDialect(value.structuredOutputDialect) : undefined,
        structuredOutputVerifiedAt: connectionChanged ? null : undefined,
        healthState: connectionChanged ? "untested" : undefined,
        enabled: connectionChanged ? false : undefined
      }
    });
    await this.audit(value.changedBy, "provider_updated", "ai_provider", id, { apiKeyReplaced: value.apiKey !== undefined });
    return this.providerDto(item);
  }

  async setProviderEnabled(id: string, enabled: boolean, actor?: unknown): Promise<RuntimeProviderDto> {
    const current = await this.providerRecord(id);
    if (enabled && current.providerType !== "mock" && (current.healthState !== "healthy" || !current.structuredOutputDialect || !current.structuredOutputVerifiedAt)) {
      throw new BadRequestException("Provider must pass a connection test before activation");
    }
    const item = await this.prisma.aiProviderConfiguration.update({ where: { id }, data: { enabled } });
    await this.audit(actor, enabled ? "provider_activated" : "provider_disabled", "ai_provider", id, { enabled });
    return this.providerDto(item);
  }

  async testProvider(id: string, actor?: unknown): Promise<RuntimeProviderDto> {
    const provider = await this.providerForUse(id, false);
    let healthy = provider.providerType === "mock";
    let diagnostic: ProviderDialectTestDiagnostic | null = null;
    let failureCode: ProviderDialectFailureCode | null = null;
    if (provider.providerType === "vllm_openai_compatible") {
      try {
        await this.prisma.aiProviderConfiguration.update({
          where: { id },
          data: { enabled: false, structuredOutputVerifiedAt: null }
        });
      } catch {
        diagnostic = this.persistenceDiagnostic(null, provider.structuredOutputDialect);
        try {
          await this.audit(actor, "provider_connection_tested", "ai_provider", id, { healthy: false, diagnostic });
        } catch {
          // The safe journal event remains available if persistence itself is unavailable.
        }
        this.logDialectDiagnostic(id, diagnostic);
        throw new BadGatewayException("DIALECT_PERSISTENCE");
      }
      try {
        const configuration = { baseUrl: provider.baseUrl, apiKey: provider.apiKey, timeoutMs: provider.defaultTimeoutMs };
        const discovered = await this.vllm.discoverModelMetadata(configuration);
        const configuredModel = await this.prisma.aiModelConfiguration.findFirst({ where: { providerId: id, enabled: true }, orderBy: { defaultForProvider: "desc" } });
        const model = configuredModel ? discovered.find((item) => item.id === configuredModel.modelId) : discovered[0];
        if (!model) throw new BadRequestException("Provider model metadata is unavailable");
        const dialect = provider.structuredOutputDialect ?? this.inferStructuredOutputDialect(model.ownedBy);
        diagnostic = await this.vllm.testStructuredOutputDialect(configuration, model.id, dialect, configuredModel?.maxOutputTokens ?? 4096);
        provider.structuredOutputDialect = dialect;
        healthy = true;
      } catch (error) {
        healthy = false;
        const failure = error instanceof ProviderDialectTestError
          ? error
          : new ProviderDialectTestError("DIALECT_NO_CONTENT", this.fallbackDialectDiagnostic(provider.structuredOutputDialect));
        failureCode = failure.reasonCode;
        diagnostic = failure.diagnostic;
      }
    }
    let item;
    try {
      item = await this.prisma.aiProviderConfiguration.update({
        where: { id },
        data: {
          healthState: healthy ? "healthy" : "unavailable",
          enabled: healthy ? undefined : false,
          structuredOutputDialect: healthy ? provider.structuredOutputDialect : undefined,
          structuredOutputVerifiedAt: healthy ? new Date() : null
        }
      });
      await this.audit(actor, "provider_connection_tested", "ai_provider", id, { healthy, diagnostic });
    } catch {
      failureCode = "DIALECT_PERSISTENCE";
      diagnostic = this.persistenceDiagnostic(diagnostic, provider.structuredOutputDialect);
      this.logDialectDiagnostic(id, diagnostic);
      throw new BadGatewayException(failureCode);
    }
    if (diagnostic) this.logDialectDiagnostic(id, diagnostic);
    if (failureCode) throw new BadGatewayException(failureCode);
    return this.providerDto(item);
  }

  async discoverModels(providerId: string): Promise<string[]> {
    const provider = await this.providerForUse(providerId, false);
    if (provider.providerType === "mock") return ["mock-deterministic"];
    return this.vllm.discoverModels({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, timeoutMs: provider.defaultTimeoutMs });
  }

  async models(providerId?: string): Promise<RuntimeModelDto[]> {
    const items = await this.prisma.aiModelConfiguration.findMany({
      where: providerId ? { providerId } : undefined,
      orderBy: [{ providerId: "asc" }, { displayName: "asc" }]
    });
    return items.map((item) => this.modelDto(item));
  }

  async createModel(body: unknown): Promise<RuntimeModelDto> {
    const value = this.record(body);
    const providerId = this.text(value.providerId, "providerId", 200);
    await this.providerRecord(providerId);
    const defaultForProvider = value.defaultForProvider === true;
    if (defaultForProvider) {
      await this.prisma.aiModelConfiguration.updateMany({ where: { providerId }, data: { defaultForProvider: false } });
    }
    const item = await this.prisma.aiModelConfiguration.create({
      data: {
        id: `ai-model-${randomUUID()}`,
        providerId,
        modelId: this.text(value.modelId, "modelId", 200),
        displayName: this.text(value.displayName, "displayName", 120),
        enabled: value.enabled === undefined ? true : this.boolean(value.enabled, "enabled"),
        defaultForProvider,
        contextWindow: this.integer(value.contextWindow, "contextWindow", 1_024, 2_000_000),
        maxOutputTokens: this.integer(value.maxOutputTokens, "maxOutputTokens", 1, 65_536),
        supportedTasks: this.tasks(value.supportedTasks)
      }
    });
    await this.audit(value.changedBy, "model_created", "ai_model", item.id, { providerId, modelId: item.modelId });
    return this.modelDto(item);
  }

  async updateModel(id: string, body: unknown): Promise<RuntimeModelDto> {
    const current = await this.modelRecord(id);
    const value = this.record(body);
    if (value.defaultForProvider === true) {
      await this.prisma.aiModelConfiguration.updateMany({ where: { providerId: current.providerId }, data: { defaultForProvider: false } });
    }
    const item = await this.prisma.aiModelConfiguration.update({
      where: { id },
      data: {
        modelId: value.modelId === undefined ? undefined : this.text(value.modelId, "modelId", 200),
        displayName: value.displayName === undefined ? undefined : this.text(value.displayName, "displayName", 120),
        enabled: value.enabled === undefined ? undefined : this.boolean(value.enabled, "enabled"),
        defaultForProvider: value.defaultForProvider === undefined ? undefined : this.boolean(value.defaultForProvider, "defaultForProvider"),
        contextWindow: value.contextWindow === undefined ? undefined : this.integer(value.contextWindow, "contextWindow", 1_024, 2_000_000),
        maxOutputTokens:
          value.maxOutputTokens === undefined ? undefined : this.integer(value.maxOutputTokens, "maxOutputTokens", 1, 65_536),
        supportedTasks: value.supportedTasks === undefined ? undefined : this.tasks(value.supportedTasks)
      }
    });
    await this.audit(value.changedBy, "model_updated", "ai_model", id, { providerId: item.providerId, enabled: item.enabled });
    return this.modelDto(item);
  }

  async repositories(): Promise<RepositoryConnectionDto[]> {
    return (await this.prisma.repositoryConnection.findMany({ orderBy: { displayName: "asc" } })).map((item) => this.repositoryDto(item));
  }

  async createRepository(body: unknown): Promise<RepositoryConnectionDto> {
    const value = this.record(body);
    const providerType = this.repositoryType(value.providerType);
    const item = await this.prisma.repositoryConnection.create({
      data: {
        id: `repository-connection-${randomUUID()}`,
        displayName: this.text(value.displayName, "displayName", 120),
        providerType,
        repositoryIdentifier: this.repositoryIdentifier(value.repositoryIdentifier, providerType),
        encryptedCredential: this.optionalCredential(value.credential),
        defaultBranch: this.ref(value.defaultBranch, "defaultBranch"),
        allowedBranches: this.refs(value.allowedBranches, "allowedBranches"),
        includePaths: this.paths(value.includePaths ?? ["**/*"], "includePaths"),
        excludePaths: this.paths(value.excludePaths ?? [], "excludePaths"),
        maximumFileBytes: this.integer(value.maximumFileBytes ?? 131_072, "maximumFileBytes", 1_024, 2_000_000),
        maximumTotalBytes: this.integer(value.maximumTotalBytes ?? 1_048_576, "maximumTotalBytes", 1_024, 10_000_000),
        maximumFileCount: this.integer(value.maximumFileCount ?? 100, "maximumFileCount", 1, 500),
        timeoutMs: this.integer(value.timeoutMs ?? 15_000, "timeoutMs", 1_000, 120_000),
        enabled: false
      }
    });
    await this.audit(value.changedBy, "repository_connection_created", "repository_connection", item.id, {
      providerType,
      credentialConfigured: Boolean(item.encryptedCredential)
    });
    return this.repositoryDto(item);
  }

  async updateRepository(id: string, body: unknown): Promise<RepositoryConnectionDto> {
    const current = await this.repositoryRecord(id);
    const value = this.record(body);
    const providerType = value.providerType === undefined ? this.repositoryType(current.providerType) : this.repositoryType(value.providerType);
    const item = await this.prisma.repositoryConnection.update({
      where: { id },
      data: {
        displayName: value.displayName === undefined ? undefined : this.text(value.displayName, "displayName", 120),
        providerType: value.providerType === undefined ? undefined : providerType,
        repositoryIdentifier:
          value.repositoryIdentifier === undefined ? undefined : this.repositoryIdentifier(value.repositoryIdentifier, providerType),
        encryptedCredential: value.credential === undefined ? undefined : this.optionalCredential(value.credential),
        defaultBranch: value.defaultBranch === undefined ? undefined : this.ref(value.defaultBranch, "defaultBranch"),
        allowedBranches: value.allowedBranches === undefined ? undefined : this.refs(value.allowedBranches, "allowedBranches"),
        includePaths: value.includePaths === undefined ? undefined : this.paths(value.includePaths, "includePaths"),
        excludePaths: value.excludePaths === undefined ? undefined : this.paths(value.excludePaths, "excludePaths"),
        maximumFileBytes:
          value.maximumFileBytes === undefined ? undefined : this.integer(value.maximumFileBytes, "maximumFileBytes", 1_024, 2_000_000),
        maximumTotalBytes:
          value.maximumTotalBytes === undefined ? undefined : this.integer(value.maximumTotalBytes, "maximumTotalBytes", 1_024, 10_000_000),
        maximumFileCount:
          value.maximumFileCount === undefined ? undefined : this.integer(value.maximumFileCount, "maximumFileCount", 1, 500),
        timeoutMs: value.timeoutMs === undefined ? undefined : this.integer(value.timeoutMs, "timeoutMs", 1_000, 120_000),
        enabled: this.repositoryScopeChanged(value)
          ? false
          : value.enabled === undefined ? undefined : this.boolean(value.enabled, "enabled")
      }
    });
    await this.audit(value.changedBy, "repository_connection_updated", "repository_connection", id, {
      credentialReplaced: value.credential !== undefined,
      enabled: item.enabled
    });
    return this.repositoryDto(item);
  }

  async providerForUse(id: string, requireEnabled = true): Promise<RuntimeProviderUseConfiguration> {
    const item = await this.providerRecord(id);
    if (requireEnabled && !item.enabled) throw new BadRequestException("Selected provider is disabled");
    if (requireEnabled && item.providerType !== "mock" && (!item.structuredOutputDialect || !item.structuredOutputVerifiedAt)) {
      throw new BadRequestException("Selected provider structured output dialect is unverified");
    }
    return {
      ...this.providerDto(item),
      baseUrl: validatedProviderBaseUrl(item.baseUrl, this.providerType(item.providerType)),
      apiKey: item.encryptedApiKey ? this.crypto.decrypt(item.encryptedApiKey) : null
    };
  }

  async modelForUse(id: string, providerId: string): Promise<RuntimeModelDto> {
    const item = await this.modelRecord(id);
    if (!item.enabled || item.providerId !== providerId) throw new BadRequestException("Selected model is unavailable for the provider");
    return this.modelDto(item);
  }

  async repositoryForUse(id: string, requireEnabled = true): Promise<RepositoryUseConfiguration> {
    const item = await this.repositoryRecord(id);
    if (requireEnabled && !item.enabled) throw new BadRequestException("Selected repository connection is disabled");
    const repository = this.repositoryDto(item);
    return {
      ...repository,
      repositoryIdentifier: repository.providerType === "local"
        ? validatedLocalRepositoryPath(repository.repositoryIdentifier)
        : repository.providerType === "gitlab"
          ? this.repositoryIdentifier(repository.repositoryIdentifier, "gitlab")
          : repository.repositoryIdentifier,
      credential: item.encryptedCredential ? this.crypto.decrypt(item.encryptedCredential) : null
    };
  }

  private async providerRecord(id: string) {
    const item = await this.prisma.aiProviderConfiguration.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Provider configuration was not found");
    return item;
  }

  private async modelRecord(id: string) {
    const item = await this.prisma.aiModelConfiguration.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Model configuration was not found");
    return item;
  }

  private async repositoryRecord(id: string) {
    const item = await this.prisma.repositoryConnection.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("Repository connection was not found");
    return item;
  }

  private providerDto(item: {
    id: string; displayName: string; providerType: string; baseUrl: string; encryptedApiKey: string | null; enabled: boolean;
    healthState: string; defaultTimeoutMs: number; structuredOutputDialect: string | null; structuredOutputVerifiedAt: Date | null; createdAt: Date; updatedAt: Date;
  }): RuntimeProviderDto {
    return {
      id: item.id,
      displayName: item.displayName,
      providerType: this.providerType(item.providerType),
      baseUrl: item.baseUrl,
      apiKeyConfigured: Boolean(item.encryptedApiKey),
      enabled: item.enabled,
      healthState: item.healthState === "healthy" || item.healthState === "unavailable" ? item.healthState : "untested",
      defaultTimeoutMs: item.defaultTimeoutMs,
      structuredOutputDialect: item.structuredOutputDialect ? this.structuredOutputDialect(item.structuredOutputDialect) : null,
      structuredOutputVerifiedAt: item.structuredOutputVerifiedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  }

  private modelDto(item: {
    id: string; providerId: string; modelId: string; displayName: string; enabled: boolean; defaultForProvider: boolean;
    contextWindow: number; maxOutputTokens: number; supportedTasks: string[]; createdAt: Date; updatedAt: Date;
  }): RuntimeModelDto {
    return {
      ...item,
      supportedTasks: item.supportedTasks.map((task) => this.task(task)),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  }

  private repositoryDto(item: {
    id: string; displayName: string; providerType: string; repositoryIdentifier: string; encryptedCredential: string | null;
    defaultBranch: string; allowedBranches: string[]; includePaths: string[]; excludePaths: string[]; maximumFileBytes: number;
    maximumTotalBytes: number; maximumFileCount: number; timeoutMs: number; enabled: boolean; createdAt: Date; updatedAt: Date;
  }): RepositoryConnectionDto {
    return {
      id: item.id,
      displayName: item.displayName,
      providerType: this.repositoryType(item.providerType),
      repositoryIdentifier: item.repositoryIdentifier,
      credentialConfigured: Boolean(item.encryptedCredential),
      defaultBranch: item.defaultBranch,
      allowedBranches: [...item.allowedBranches],
      includePaths: [...item.includePaths],
      excludePaths: [...item.excludePaths],
      maximumFileBytes: item.maximumFileBytes,
      maximumTotalBytes: item.maximumTotalBytes,
      maximumFileCount: item.maximumFileCount,
      timeoutMs: item.timeoutMs,
      enabled: item.enabled,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  }

  private async audit(actor: unknown, action: string, resourceType: string, resourceId: string, details: Record<string, unknown>): Promise<void> {
    await this.prisma.configurationAuditEvent.create({
      data: {
        id: `configuration-audit-${randomUUID()}`,
        actor: typeof actor === "string" && actor.trim() ? actor.trim().slice(0, 120) : "admin_ui",
        action,
        resourceType,
        resourceId,
        sanitizedDetails: details as Prisma.InputJsonValue
      }
    });
  }

  private fallbackDialectDiagnostic(attemptedDialect: StructuredOutputDialect | null): ProviderDialectTestDiagnostic {
    return {
      stage: "DIALECT_REQUEST",
      attemptedDialect,
      reasonCode: "DIALECT_NO_CONTENT",
      upstreamHttpStatus: null,
      transportErrorType: "Error",
      transportErrorCode: null,
      responseReceived: false,
      generationStarted: null,
      contentPresent: false,
      jsonParseResult: "NOT_ATTEMPTED",
      schemaIssues: [],
      finishReason: null,
      promptTokens: null,
      completionTokens: null
    };
  }

  private persistenceDiagnostic(
    current: ProviderDialectTestDiagnostic | null,
    attemptedDialect: StructuredOutputDialect | null
  ): ProviderDialectTestDiagnostic {
    return {
      ...(current ?? this.fallbackDialectDiagnostic(attemptedDialect)),
      stage: "DIALECT_PERSISTENCE",
      reasonCode: "DIALECT_PERSISTENCE"
    };
  }

  private logDialectDiagnostic(providerId: string, diagnostic: ProviderDialectTestDiagnostic): void {
    this.logger.log(JSON.stringify({ event: "provider_dialect_test", providerId, diagnostic }));
  }

  private optionalCredential(value: unknown): string | null {
    if (value === null || value === "") return null;
    return this.crypto.encrypt(this.text(value, "credential", 8_192));
  }

  private repositoryScopeChanged(value: Record<string, unknown>): boolean {
    return ["providerType", "repositoryIdentifier", "credential", "allowedBranches", "includePaths", "excludePaths", "maximumFileBytes", "maximumTotalBytes", "maximumFileCount"].some(
      (field) => value[field] !== undefined
    );
  }

  private providerUrl(value: unknown, providerType: RuntimeProviderType): string {
    if (providerType === "mock" && (value === undefined || value === "")) return "http://mock.invalid";
    const text = this.text(value, "baseUrl", 2_048);
    return validatedProviderBaseUrl(text, providerType);
  }

  private repositoryIdentifier(value: unknown, providerType: RepositoryConnectionProviderType): string {
    const text = this.text(value, "repositoryIdentifier", 2_048);
    if (providerType === "local") {
      return validatedLocalRepositoryPath(text);
    }
    if (providerType === "gitlab") {
      const coordinates = gitlabRepositoryCoordinates(text);
      return text.includes("://") ? `${coordinates.baseUrl}/${coordinates.projectPath}` : coordinates.projectPath;
    }
    if (/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(text)) return text;
    let url: URL;
    try { url = new URL(text); } catch { throw new BadRequestException("Repository identifier is invalid"); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new BadRequestException("Repository URL is invalid");
    return url.toString().replace(/\/$/, "");
  }

  private paths(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.length > 50) throw new BadRequestException(`${field} must be a bounded array`);
    return value.map((item) => {
      const path = this.text(item, field, 300).replace(/\\/g, "/");
      if (path.startsWith("/") || path.includes("..") || path.includes("\0")) throw new BadRequestException(`${field} contains an unsafe path`);
      return path;
    });
  }

  private refs(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw new BadRequestException(`${field} must be a non-empty bounded array`);
    return value.map((item) => this.ref(item, field));
  }

  private ref(value: unknown, field: string): string {
    const text = this.text(value, field, 200);
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(text) || text.includes("..") || text.endsWith("/")) {
      throw new BadRequestException(`${field} contains an unsafe ref`);
    }
    return text;
  }

  private tasks(value: unknown): RuntimeTaskCategory[] {
    if (!Array.isArray(value) || value.length === 0) throw new BadRequestException("supportedTasks is required");
    return [...new Set(value.map((item) => this.task(item)))];
  }

  private task(value: unknown): RuntimeTaskCategory {
    if (typeof value !== "string" || !TASKS.has(value as RuntimeTaskCategory)) throw new BadRequestException("supportedTasks contains an invalid task");
    return value as RuntimeTaskCategory;
  }

  private providerType(value: unknown): RuntimeProviderType {
    if (typeof value !== "string" || !PROVIDER_TYPES.has(value as RuntimeProviderType)) throw new BadRequestException("providerType is invalid");
    return value as RuntimeProviderType;
  }

  private structuredOutputDialect(value: unknown): StructuredOutputDialect {
    if (typeof value !== "string" || !STRUCTURED_OUTPUT_DIALECTS.has(value as StructuredOutputDialect)) throw new BadRequestException("structuredOutputDialect is invalid");
    return value as StructuredOutputDialect;
  }

  private inferStructuredOutputDialect(ownedBy: string | null): StructuredOutputDialect {
    const owner = ownedBy?.trim().toLowerCase();
    if (owner === "llamacpp" || owner === "llama.cpp") return "LLAMACPP_JSON_SCHEMA";
    if (owner === "openai") return "OPENAI_JSON_SCHEMA";
    if (owner === "vllm") return "VLLM_STRUCTURED_OUTPUTS";
    throw new BadRequestException("Provider structured output dialect must be configured explicitly");
  }

  private repositoryType(value: unknown): RepositoryConnectionProviderType {
    if (typeof value !== "string" || !REPOSITORY_TYPES.has(value as RepositoryConnectionProviderType)) throw new BadRequestException("providerType is invalid");
    return value as RepositoryConnectionProviderType;
  }

  private integer(value: unknown, field: string, min: number, max: number): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new BadRequestException(`${field} is invalid`);
    return value;
  }

  private boolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") throw new BadRequestException(`${field} must be boolean`);
    return value;
  }

  private text(value: unknown, field: string, max: number): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new BadRequestException(`${field} is invalid`);
    return value.trim();
  }

  private record(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException("Request body must be an object");
    return value as Record<string, unknown>;
  }
}
