import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadGatewayException } from "@nestjs/common";
import { AiGatewayService } from "../src/ai-gateway/ai-gateway.service";
import { LlmJsonCompatibilityError } from "../src/ai-gateway/llm-json.parser";
import { RDRadarOutputSchemaError, RD_RADAR_OUTPUT_SCHEMA } from "../src/ai-gateway/rd-radar-output.schema";
import { RDRadarAnalysisService } from "../src/rd-radar-analysis.service";

const commitSha = "b".repeat(40);
const chunk = {
  citationId: "src/example.ts#L1-L2", repository: "owner/repository", commitSha, path: "src/example.ts", startLine: 1, endLine: 2, content: "export const safe = true;"
};

class FakePrisma {
  runs = new Map<string, Record<string, unknown>>();
  evidence: Record<string, unknown>[] = [];
  candidates: Record<string, unknown>[] = [];
  sources: Record<string, unknown>[] = [];
  failPersistence = false;

  rDRadarAnalysisRun: Record<string, unknown>;

  constructor() {
    this.rDRadarAnalysisRun = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = { ...data, commitSha: null, sanitizedFailureReason: null, result: {}, candidateId: null, cancellationRequested: false, startedAt: new Date(), completedAt: null, createdAt: new Date(), updatedAt: new Date() };
        this.runs.set(String(data.id), item);
        return item;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const item = { ...this.runs.get(where.id), ...data, updatedAt: new Date() };
        this.runs.set(where.id, item);
        return item;
      },
      findUnique: async ({ where, select }: { where: { id: string }; select?: { cancellationRequested?: boolean } }) => {
        const item = this.runs.get(where.id) ?? null;
        return select ? { cancellationRequested: item?.cancellationRequested === true } : item;
      },
      findMany: async () => [...this.runs.values()],
      findFirst: async ({ where }: { where: { id: { startsWith: string } } }) =>
        [...this.runs.values()].find((item) => String(item.id).startsWith(where.id.startsWith)) ?? null
    } as never;
  }

  evidenceSourceV2 = {
    upsert: async ({ create }: { create: Record<string, unknown> }) => { this.sources.push(create); return create; }
  };
  evidenceItem = {
    create: async ({ data }: { data: Record<string, unknown> }) => { this.evidence.push(data); return data; }
  };
  candidateInitiative = {
    create: async ({ data }: { data: Record<string, unknown> }) => { this.candidates.push(data); return data; }
  };

  async $transaction<T>(callback: (tx: FakePrisma) => Promise<T>): Promise<T> {
    if (this.failPersistence) throw new Error("database detail that must not persist");
    return callback(this);
  }
}

function result(citationId = chunk.citationId) {
  return {
    schemaVersion: "rd-radar-analysis.v1",
    summary: "Bounded repository analysis.",
    findings: [{
      title: "Validated finding", category: "risk_review", severity: "medium", confidence: 0.8, citations: [citationId],
      businessImpact: "Review may reduce risk.", technicalRisk: "A bounded risk was observed.", recommendation: "Review the cited code.",
      uncertainty: "Runtime behavior was not executed.", requiredAdditionalEvidence: ["PM review"], candidateDraftRecommendation: "Create a draft only."
    }]
  };
}

function serviceWith(gatewayResult: unknown, gatewayStage: "LLM_REQUEST" | "LLM_JSON" = "LLM_JSON") {
  const prisma = new FakePrisma();
  const configurations = {
    repositoryForUse: async () => ({ id: "repository-test" }),
    providerForUse: async () => ({ id: "provider-test", providerType: "mock" }),
    modelForUse: async () => ({ id: "model-test", providerId: "provider-test" })
  };
  const repositories = { snapshot: async (_repository: unknown, _reference: string, _includes: string[] | undefined, onStage?: (stage: string) => void) => {
    onStage?.("REPOSITORY_COMMIT");
    onStage?.("REPOSITORY_TREE");
    onStage?.("REPOSITORY_FILE");
    return { repositoryConnectionId: "repository-test", repository: "owner/repository", requestedRef: "main", commitSha, chunks: [chunk], fileCount: 1, totalBytes: 20, skippedFiles: 0 };
  } };
  const gateway = { analyzeRepository: async (input: { onStage?: (stage: "LLM_REQUEST" | "LLM_JSON") => void }) => {
    input.onStage?.(gatewayStage);
    if (gatewayResult instanceof Error) throw gatewayResult;
    return { structured: gatewayResult, metadata: null };
  } };
  const service = new RDRadarAnalysisService(configurations as never, repositories as never, gateway as never);
  (service as unknown as { prisma: FakePrisma }).prisma = prisma;
  return { service, prisma };
}

const request = { idempotencyKey: "rd-radar-test-request", repositoryConnectionId: "repository-test", branch: "main", providerId: "provider-test", modelId: "model-test", analysisPurpose: "Review a bounded path." };
const actorId = "auth-user-a";

describe("R&D Radar live analysis pipeline", () => {
  it("rejects an unverified structured-output dialect before repository snapshot", async () => {
    let snapshots = 0;
    const configurations = {
      repositoryForUse: async () => ({ id: "repository-test" }),
      providerForUse: async () => { throw new BadGatewayException("Structured output dialect is unsupported"); },
      modelForUse: async () => ({ id: "model-test" })
    };
    const repositories = { snapshot: async () => { snapshots += 1; throw new Error("must not execute"); } };
    const service = new RDRadarAnalysisService(configurations as never, repositories as never, {} as never);
    (service as unknown as { prisma: FakePrisma }).prisma = new FakePrisma();
    await assert.rejects(() => service.run(request, actorId), BadGatewayException);
    assert.equal(snapshots, 0);
  });

  it("records the real AI Gateway request and JSON parsing stages without storing model content", async () => {
    const stages: string[] = [];
    const runtime = {
      providerForUse: async () => ({ id: "provider-test", providerType: "vllm_openai_compatible", baseUrl: "http://provider.invalid", apiKey: null, defaultTimeoutMs: 1_000, structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" }),
      modelForUse: async () => ({ id: "model-test", providerId: "provider-test", modelId: "model-test", supportedTasks: ["repository_analysis"], contextWindow: 8_000, maxOutputTokens: 1_000 })
    };
    const metadata = { providerCallExecuted: true as const, durationMs: 25, httpClassification: "SUCCESS" as const, httpStatus: 200, finishReason: "stop", promptTokens: 30, completionTokens: 40, configuredMaxOutputTokens: 1000 };
    let structuredOutput: unknown;
    let systemPrompt = "";
    const vllm = { chat: async (_configuration: unknown, request: { structuredOutput?: unknown; systemPrompt: string }) => { structuredOutput = request.structuredOutput; systemPrompt = request.systemPrompt; return { content: JSON.stringify(result()), metadata }; } };
    const gateway = new AiGatewayService({} as never, {} as never, {} as never, {} as never, {} as never, "mock", runtime as never, vllm as never);

    const output = await gateway.analyzeRepository({
      providerId: "provider-test",
      modelId: "model-test",
      analysisPurpose: "Review a bounded path.",
      chunks: [chunk],
      onStage: (stage) => stages.push(stage)
    });

    assert.deepEqual(output, { structured: result(), metadata });
    assert.deepEqual(stages, ["LLM_REQUEST", "LLM_JSON"]);
    assert.equal((structuredOutput as { dialect: string }).dialect, "LLAMACPP_JSON_SCHEMA");
    assert.deepEqual((structuredOutput as { schema: unknown }).schema, RD_RADAR_OUTPUT_SCHEMA);
    assert.match(systemPrompt, /Produce 1-5 findings/);
    assert.match(systemPrompt, /Each finding must contain 1-20 allowed citation IDs/);
  });

  it("rejects an impossible model context budget before a provider call", async () => {
    let calls = 0;
    const runtime = {
      providerForUse: async () => ({ id: "provider-test", providerType: "vllm_openai_compatible", baseUrl: "http://provider.invalid", apiKey: null, defaultTimeoutMs: 1_000, structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" }),
      modelForUse: async () => ({ id: "model-test", providerId: "provider-test", modelId: "model-test", supportedTasks: ["repository_analysis"], contextWindow: 4_096, maxOutputTokens: 4_096 })
    };
    const vllm = { chat: async () => { calls += 1; throw new Error("must not execute"); } };
    const gateway = new AiGatewayService({} as never, {} as never, {} as never, {} as never, {} as never, "mock", runtime as never, vllm as never);
    await assert.rejects(() => gateway.analyzeRepository({ providerId: "provider-test", modelId: "model-test", analysisPurpose: "bounded", chunks: [chunk] }), /context budget/i);
    assert.equal(calls, 0);
  });

  it("persists only safe provider metadata alongside a validated result", async () => {
    const safeMetadata = { providerCallExecuted: true, durationMs: 20, httpClassification: "SUCCESS", httpStatus: 200, finishReason: "stop", promptTokens: 10, completionTokens: 20, configuredMaxOutputTokens: 4096 };
    const prisma = new FakePrisma();
    const configurations = { repositoryForUse: async () => ({ id: "repository-test" }), providerForUse: async () => ({ id: "provider-test" }), modelForUse: async () => ({ id: "model-test" }) };
    const repositories = { snapshot: async () => ({ repositoryConnectionId: "repository-test", repository: "owner/repository", requestedRef: "main", commitSha, chunks: [chunk], fileCount: 1, totalBytes: 20, skippedFiles: 0 }) };
    const gateway = { analyzeRepository: async () => ({ structured: result(), metadata: safeMetadata }) };
    const service = new RDRadarAnalysisService(configurations as never, repositories as never, gateway as never);
    (service as unknown as { prisma: FakePrisma }).prisma = prisma;
    const run = await service.run(request, actorId);
    assert.deepEqual((run.result as { runtimeMetadata?: unknown }).runtimeMetadata, safeMetadata);
    assert.equal(JSON.stringify(run).includes("raw model response"), false);
  });

  it("persists validated evidence and a PM-review-only candidate draft pinned to a commit", async () => {
    const { service, prisma } = serviceWith(result());
    const run = await service.run(request, actorId);
    assert.equal(run.status, "REVIEW_REQUIRED");
    assert.equal(run.commitSha, commitSha);
    assert.equal(run.evidenceItemIds.length, 1);
    assert.match(run.candidateId ?? "", /^RD-CANDIDATE-/);
    assert.equal(prisma.evidence.length, 1);
    assert.equal(prisma.candidates[0]?.status, "DRAFT_ONLY");
    assert.equal(prisma.candidates[0]?.nextGate, "PM_REVIEW_REQUIRED");
    assert.equal(String(prisma.evidence[0]?.sanitizedFinding).includes(chunk.citationId), true);
  });

  it("returns the existing run for a repeated idempotency key without a second provider call", async () => {
    let calls = 0;
    const prisma = new FakePrisma();
    const configurations = {
      repositoryForUse: async () => ({ id: "repository-test" }),
      providerForUse: async () => ({ id: "provider-test" }),
      modelForUse: async () => ({ id: "model-test" })
    };
    const repositories = { snapshot: async () => ({ repositoryConnectionId: "repository-test", repository: "owner/repository", requestedRef: "main", commitSha, chunks: [chunk], fileCount: 1, totalBytes: 20, skippedFiles: 0 }) };
    const gateway = { analyzeRepository: async () => { calls += 1; return { structured: result(), metadata: null }; } };
    const service = new RDRadarAnalysisService(configurations as never, repositories as never, gateway as never);
    (service as unknown as { prisma: FakePrisma }).prisma = prisma;

    const first = await service.run(request, actorId);
    const duplicate = await service.run(request, actorId);
    assert.equal(duplicate.id, first.id);
    assert.equal(calls, 1);

    await assert.rejects(
      () => service.run({ ...request, analysisPurpose: "A different request." }, actorId),
      /Idempotency key was already used/
    );
    assert.equal(calls, 1);

    const otherUser = await service.run(request, "auth-user-b");
    assert.notEqual(otherUser.id, first.id);
    assert.equal(calls, 2);
  });

  it("rejects invented citations and saves no evidence or candidate", async () => {
    const { service, prisma } = serviceWith(result("src/not-collected.ts#L1-L2"));
    await assert.rejects(() => service.run(request, actorId), BadGatewayException);
    assert.equal(prisma.evidence.length, 0);
    assert.equal(prisma.candidates.length, 0);
    assert.equal([...prisma.runs.values()][0]?.status, "FAIL");
    assert.match(String([...prisma.runs.values()][0]?.sanitizedFailureReason), /^CITATION_VALIDATION:/);
  });

  it("classifies invalid structured schema before citation validation", async () => {
    const { service, prisma } = serviceWith({ schemaVersion: "rd-radar-analysis.v1", summary: "Missing findings." });
    await assert.rejects(() => service.run(request, actorId), RDRadarOutputSchemaError);
    assert.equal([...prisma.runs.values()][0]?.sanitizedFailureReason, "LLM_JSON_SCHEMA_INVALID");
    assert.deepEqual((([...prisma.runs.values()][0]?.result as { validationIssues?: unknown[] }).validationIssues), [
      { path: "$.findings", code: "REQUIRED", expectedType: "array" }
    ]);
    assert.equal(prisma.evidence.length, 0);
    assert.equal(prisma.candidates.length, 0);
  });

  it("persists semantic schema issue paths without rejected values or raw content", async () => {
    const invalid = result();
    invalid.findings[0]!.confidence = 2;
    invalid.findings[0]!.technicalRisk = "raw-rejected-value-must-not-persist";
    invalid.findings[0]!.citations = [];
    const { service, prisma } = serviceWith(invalid);
    await assert.rejects(() => service.run(request, actorId), RDRadarOutputSchemaError);
    const run = [...prisma.runs.values()][0];
    assert.equal(run?.sanitizedFailureReason, "LLM_JSON_SCHEMA_INVALID");
    assert.deepEqual((run?.result as { validationIssues?: unknown[] }).validationIssues, [
      { path: "$.findings[0].confidence", code: "RANGE", expectedType: "number from 0 to 1" },
      { path: "$.findings[0].citations", code: "MIN_ITEMS", expectedType: "array with at least 1 item(s)" }
    ]);
    assert.equal(JSON.stringify(run).includes("raw-rejected-value-must-not-persist"), false);
    assert.equal(prisma.evidence.length, 0);
    assert.equal(prisma.candidates.length, 0);
  });

  it("records an explicit failed run when the selected provider fails without a mock fallback", async () => {
    const { service, prisma } = serviceWith(new BadGatewayException("provider detail that must not persist"), "LLM_REQUEST");
    await assert.rejects(() => service.run(request, actorId), BadGatewayException);
    const run = [...prisma.runs.values()][0];
    assert.equal(run?.status, "FAIL");
    assert.equal(run?.sanitizedFailureReason, "LLM_REQUEST: Provider or repository read failed");
    assert.equal(JSON.stringify(run).includes("provider detail"), false);
  });

  it("records malformed model JSON and persistence failures with safe stage codes", async () => {
    const malformed = serviceWith(new LlmJsonCompatibilityError("LLM_JSON_MALFORMED"), "LLM_JSON");
    await assert.rejects(() => malformed.service.run(request, actorId), LlmJsonCompatibilityError);
    const malformedRun = [...malformed.prisma.runs.values()][0];
    assert.equal(malformedRun?.sanitizedFailureReason, "LLM_JSON_MALFORMED");
    assert.equal(JSON.stringify(malformedRun).includes("raw model"), false);

    const persistence = serviceWith(result());
    persistence.prisma.failPersistence = true;
    await assert.rejects(() => persistence.service.run(request, actorId));
    const persistedRun = [...persistence.prisma.runs.values()][0];
    assert.equal(persistedRun?.sanitizedFailureReason, "PERSISTENCE: Analysis failed without exposing transport details");
    assert.equal(JSON.stringify(persistedRun).includes("database detail"), false);
  });
});
