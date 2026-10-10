import { BadGatewayException, BadRequestException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./data-access/prisma.service";
import { createHash, randomUUID } from "node:crypto";
import { AiGatewayService } from "./ai-gateway/ai-gateway.service";
import { LlmContextBudgetError } from "./ai-gateway/ai-gateway.service";
import { vllmMetadataFromError, type VllmCallMetadata } from "./ai-gateway/providers/vllm-openai-compatible.adapter";
import { LlmJsonCompatibilityError } from "./ai-gateway/llm-json.parser";
import { RDRadarOutputSchemaError, validateRdRadarOutputSchema } from "./ai-gateway/rd-radar-output.schema";
import { RuntimeConfigurationService } from "./ai-gateway/runtime-configuration.service";
import type {
  RDRadarAnalysisRequestDto,
  RDRadarAnalysisResultDto,
  RDRadarAnalysisRunDto,
  RDRadarCitationDto,
  RDRadarFindingDto
} from "./rd-radar-analysis.dto";
import type { RepositoryContentChunkDto } from "./repository-source/repository-content.dto";
import { RepositoryContentService, type RepositorySnapshotStage } from "./repository-source/repository-content.service";

const PROMPT_VERSION = "rd-radar-analysis.v1";
const SEVERITIES = new Set(["info", "low", "medium", "high", "critical"]);
type AnalysisStage = RepositorySnapshotStage | "LLM_REQUEST" | "LLM_JSON" | "CITATION_VALIDATION" | "PERSISTENCE";
type ValidatedFindingInput = Omit<RDRadarFindingDto, "citations"> & { citationIds: string[] };

@Injectable()
export class RDRadarAnalysisService {
  constructor(
    @Inject(RuntimeConfigurationService) private readonly configurations: RuntimeConfigurationService,
    @Inject(RepositoryContentService) private readonly repositories: RepositoryContentService,
    @Inject(AiGatewayService) private readonly gateway: AiGatewayService,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService
  ) {}

  private get db(): PrismaService {
    if (!this.prisma) {
      throw new ServiceUnavailableException("Database persistence is required for R&D Radar Analysis");
    }
    return this.prisma;
  }

  async run(body: unknown, actorId: string): Promise<RDRadarAnalysisRunDto> {
    const request = this.request(body);
    const requestedRef = request.commit ?? request.branch ?? request.reference!;
    const requestFingerprint = this.requestFingerprint(request);
    const idPrefix = `rd-analysis-idem-${this.hash(`${actorId}\0${request.idempotencyKey}`).slice(0, 24)}-`;
    const id = `${idPrefix}${requestFingerprint.slice(0, 24)}`;
    const existing = await this.db.rDRadarAnalysisRun.findFirst({
      where: { id: { startsWith: idPrefix } },
      orderBy: { createdAt: "desc" }
    });
    if (existing) {
      if (existing.id !== id) throw new BadRequestException("Idempotency key was already used for a different analysis request");
      return this.runDto(existing);
    }

    const repository = await this.configurations.repositoryForUse(request.repositoryConnectionId);
    await this.configurations.providerForUse(request.providerId);
    await this.configurations.modelForUse(request.modelId, request.providerId);
    try {
      await this.db.rDRadarAnalysisRun.create({
        data: {
          id,
          repositoryConnectionId: request.repositoryConnectionId,
          providerId: request.providerId,
          modelId: request.modelId,
          requestedRef,
          analysisPurpose: request.analysisPurpose,
          promptVersion: PROMPT_VERSION,
          status: "RUNNING",
          evidenceItemIds: []
        }
      });
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const duplicate = await this.db.rDRadarAnalysisRun.findUnique({ where: { id } });
      if (!duplicate) throw error;
      return this.runDto(duplicate);
    }

    let stage: AnalysisStage = "REPOSITORY_COMMIT";
    let runtimeMetadata: VllmCallMetadata | null = null;
    try {
      const snapshot = await this.repositories.snapshot(repository, requestedRef, request.includePaths, (nextStage) => { stage = nextStage; });
      await this.abortIfRequested(id);
      await this.db.rDRadarAnalysisRun.update({ where: { id }, data: { commitSha: snapshot.commitSha } });
      const gatewayResult = await this.gateway.analyzeRepository({
        providerId: request.providerId,
        modelId: request.modelId,
        analysisPurpose: request.analysisPurpose,
        chunks: snapshot.chunks,
        onStage: (nextStage) => { stage = nextStage; }
      });
      runtimeMetadata = gatewayResult.metadata;
      if (runtimeMetadata) {
        await this.db.rDRadarAnalysisRun.update({ where: { id }, data: { result: { runtimeMetadata } as unknown as Prisma.InputJsonValue } });
      }
      await this.abortIfRequested(id);
      stage = "LLM_JSON";
      const result = this.validateResult(gatewayResult.structured, snapshot.chunks, () => { stage = "CITATION_VALIDATION"; });
      if (runtimeMetadata) result.runtimeMetadata = runtimeMetadata;
      stage = "PERSISTENCE";
      const persisted = await this.persistResult(id, result, snapshot.repository, snapshot.commitSha);
      return this.runDto(persisted);
    } catch (error) {
      runtimeMetadata ??= vllmMetadataFromError(error);
      const validationIssues = error instanceof RDRadarOutputSchemaError ? error.issues : null;
      const aborted = error instanceof AnalysisCancelledError;
      await this.db.rDRadarAnalysisRun.update({
        where: { id },
        data: {
          status: aborted ? "ABORTED" : "FAIL",
          sanitizedFailureReason: aborted ? "Analysis was cancelled" : this.sanitizedFailure(stage, error),
          result: runtimeMetadata || validationIssues
            ? ({ ...(runtimeMetadata ? { runtimeMetadata } : {}), ...(validationIssues ? { validationIssues } : {}) } as unknown as Prisma.InputJsonValue)
            : undefined,
          completedAt: new Date()
        }
      });
      if (aborted) return this.get(id);
      if (error instanceof BadRequestException || error instanceof BadGatewayException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("Repository analysis failed");
    }
  }

  async list(): Promise<RDRadarAnalysisRunDto[]> {
    return (await this.db.rDRadarAnalysisRun.findMany({ orderBy: { createdAt: "desc" }, take: 50 })).map((item) => this.runDto(item));
  }

  async get(id: string): Promise<RDRadarAnalysisRunDto> {
    const item = await this.db.rDRadarAnalysisRun.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("R&D Radar analysis run was not found");
    return this.runDto(item);
  }

  async cancel(id: string): Promise<RDRadarAnalysisRunDto> {
    const item = await this.db.rDRadarAnalysisRun.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("R&D Radar analysis run was not found");
    if (item.status !== "RUNNING") return this.runDto(item);
    return this.runDto(await this.db.rDRadarAnalysisRun.update({ where: { id }, data: { cancellationRequested: true } }));
  }

  private async persistResult(id: string, result: RDRadarAnalysisResultDto, repository: string, commitSha: string) {
    return this.db.$transaction(async (tx) => {
      const evidenceItemIds: string[] = [];
      for (const finding of result.findings) {
        const citation = finding.citations[0]!;
        const sourceUrl = `repository://${encodeURIComponent(repository)}/${commitSha}/${citation.path}`;
        const sourceId = `evidence-source-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24)}`;
        const source = await tx.evidenceSourceV2.upsert({
          where: { url: sourceUrl },
          update: { lastCollectedAt: new Date(), status: "approved" },
          create: { id: sourceId, url: sourceUrl, title: `${citation.path}@${commitSha.slice(0, 12)}`, sourceType: "repository", lastCollectedAt: new Date() }
        });
        const evidenceId = `evidence-item-${randomUUID()}`;
        evidenceItemIds.push(evidenceId);
        await tx.evidenceItem.create({
          data: {
            id: evidenceId,
            sourceId: source.id,
            title: finding.title,
            sourceUrl,
            sanitizedFinding: JSON.stringify(finding),
            collectionStatus: "EVIDENCE_COLLECTED"
          }
        });
      }
      const candidateId = `RD-CANDIDATE-${randomUUID()}`;
      const primary = result.findings[0]!;
      await tx.candidateInitiative.create({
        data: {
          id: `candidate-${randomUUID()}`,
          candidateId,
          title: primary.title,
          status: "DRAFT_ONLY",
          problemStatement: primary.technicalRisk,
          evidenceSummary: result.summary,
          expectedBusinessValue: primary.businessImpact,
          nextGate: "PM_REVIEW_REQUIRED",
          requiresPMApproval: true,
          runtimeVerificationRequired: true,
          createdAsDraftOnly: true,
          requiredAdditionalEvidence: result.findings.flatMap((finding) => finding.requiredAdditionalEvidence).slice(0, 50),
          uncertaintyRisks: result.findings.map((finding) => finding.uncertainty).slice(0, 25)
        }
      });
      return tx.rDRadarAnalysisRun.update({
        where: { id },
        data: {
          status: "REVIEW_REQUIRED",
          result: result as unknown as Prisma.InputJsonValue,
          evidenceItemIds,
          candidateId,
          completedAt: new Date()
        }
      });
    });
  }

  private validateResult(raw: unknown, chunks: RepositoryContentChunkDto[], onCitationValidation: () => void): RDRadarAnalysisResultDto {
    let summary: string;
    let findingsInput: ValidatedFindingInput[];
    try {
      const schemaIssues = validateRdRadarOutputSchema(raw);
      if (schemaIssues.length > 0) throw new RDRadarOutputSchemaError(schemaIssues);
      const value = this.record(raw, "Structured result");
      if (value.schemaVersion !== PROMPT_VERSION) throw new BadGatewayException("Provider returned an unsupported structured output version");
      summary = this.text(value.summary, "summary", 8_000);
      if (!Array.isArray(value.findings) || value.findings.length === 0 || value.findings.length > 5) {
        throw new BadGatewayException("Provider returned an invalid findings collection");
      }
      findingsInput = value.findings.map((item) => this.findingSchema(item));
    } catch (error) {
      if (error instanceof RDRadarOutputSchemaError) throw error;
      if (error instanceof BadGatewayException) throw new LlmJsonCompatibilityError("LLM_JSON_SCHEMA_INVALID");
      throw error;
    }

    onCitationValidation();
    const byCitation = new Map(chunks.map((chunk) => [chunk.citationId, chunk]));
    const findings = findingsInput.map((item) => this.finding(item, byCitation));
    return { schemaVersion: PROMPT_VERSION, summary, findings };
  }

  private findingSchema(raw: unknown): ValidatedFindingInput {
    const value = this.record(raw, "Finding");
    const severity = this.text(value.severity, "severity", 20);
    if (!SEVERITIES.has(severity)) throw new BadGatewayException("Provider returned an invalid finding severity");
    if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
      throw new BadGatewayException("Provider returned an invalid finding confidence");
    }
    if (!Array.isArray(value.citations) || value.citations.length === 0 || value.citations.length > 20) {
      throw new BadGatewayException("Every finding must contain bounded repository citations");
    }
    const citationIds = value.citations.map((citationId) => this.text(citationId, "citations", 500));
    return {
      title: this.text(value.title, "title", 300),
      category: this.text(value.category, "category", 100),
      severity: severity as RDRadarFindingDto["severity"],
      confidence: value.confidence,
      citationIds,
      businessImpact: this.text(value.businessImpact, "businessImpact", 4_000),
      technicalRisk: this.text(value.technicalRisk, "technicalRisk", 4_000),
      recommendation: this.text(value.recommendation, "recommendation", 4_000),
      uncertainty: this.text(value.uncertainty, "uncertainty", 4_000),
      requiredAdditionalEvidence: this.textArray(value.requiredAdditionalEvidence, "requiredAdditionalEvidence"),
      candidateDraftRecommendation: this.text(value.candidateDraftRecommendation, "candidateDraftRecommendation", 4_000)
    };
  }

  private finding(value: ValidatedFindingInput, chunks: Map<string, RepositoryContentChunkDto>): RDRadarFindingDto {
    const citations: RDRadarCitationDto[] = value.citationIds.map((citationId) => {
      if (typeof citationId !== "string" || !chunks.has(citationId)) throw new BadGatewayException("Provider returned a citation outside the collected snapshot");
      const chunk = chunks.get(citationId)!;
      return {
        citationId,
        repository: chunk.repository,
        commitSha: chunk.commitSha,
        path: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine
      };
    });
    return {
      title: value.title,
      category: value.category,
      severity: value.severity,
      confidence: value.confidence,
      citations,
      businessImpact: value.businessImpact,
      technicalRisk: value.technicalRisk,
      recommendation: value.recommendation,
      uncertainty: value.uncertainty,
      requiredAdditionalEvidence: value.requiredAdditionalEvidence,
      candidateDraftRecommendation: value.candidateDraftRecommendation
    };
  }

  private request(raw: unknown): RDRadarAnalysisRequestDto {
    const value = this.record(raw, "Request");
    const branch = value.branch === undefined ? undefined : this.ref(value.branch, "branch");
    const commit = value.commit === undefined ? undefined : this.sha(value.commit);
    const reference = value.reference === undefined ? undefined : this.refOrSha(value.reference, "reference");
    if ([branch, commit, reference].filter(Boolean).length !== 1) throw new BadRequestException("Provide exactly one branch, commit, or reference");
    const includePaths = value.includePaths === undefined ? undefined : this.pathArray(value.includePaths);
    return {
      idempotencyKey: this.idempotencyKey(value.idempotencyKey),
      repositoryConnectionId: this.inputText(value.repositoryConnectionId, "repositoryConnectionId", 200),
      branch,
      commit,
      reference,
      providerId: this.inputText(value.providerId, "providerId", 200),
      modelId: this.inputText(value.modelId, "modelId", 200),
      analysisPurpose: this.inputText(value.analysisPurpose, "analysisPurpose", 2_000),
      includePaths
    };
  }

  private idempotencyKey(value: unknown): string {
    const key = this.inputText(value, "idempotencyKey", 200);
    if (key.length < 8 || !/^[A-Za-z0-9._:-]+$/.test(key)) throw new BadRequestException("idempotencyKey is invalid");
    return key;
  }

  private requestFingerprint(request: RDRadarAnalysisRequestDto): string {
    return this.hash(JSON.stringify({
      repositoryConnectionId: request.repositoryConnectionId,
      branch: request.branch ?? null,
      commit: request.commit ?? null,
      reference: request.reference ?? null,
      providerId: request.providerId,
      modelId: request.modelId,
      analysisPurpose: request.analysisPurpose,
      includePaths: request.includePaths ?? []
    }));
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
  }

  private async abortIfRequested(id: string): Promise<void> {
    const item = await this.db.rDRadarAnalysisRun.findUnique({ where: { id }, select: { cancellationRequested: true } });
    if (item?.cancellationRequested) throw new AnalysisCancelledError();
  }

  private runDto(item: {
    id: string; repositoryConnectionId: string; providerId: string; modelId: string; requestedRef: string; commitSha: string | null;
    analysisPurpose: string; promptVersion: string; status: string; sanitizedFailureReason: string | null; result: unknown;
    evidenceItemIds: string[]; candidateId: string | null; startedAt: Date; completedAt: Date | null;
  }): RDRadarAnalysisRunDto {
    const status = item.status === "FAIL" || item.status === "ABORTED" || item.status === "REVIEW_REQUIRED" ? item.status : "RUNNING";
    return {
      ...item,
      status,
      result: this.isRecord(item.result) ? item.result as unknown as RDRadarAnalysisRunDto["result"] : {},
      evidenceItemIds: [...item.evidenceItemIds],
      startedAt: item.startedAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null
    };
  }

  private failureReason(error: unknown): string {
    if (error instanceof BadRequestException) return "Analysis input or structured output validation failed";
    if (error instanceof BadGatewayException) return "Provider or repository read failed";
    return "Analysis failed without exposing transport details";
  }

  private sanitizedFailure(stage: AnalysisStage, error: unknown): string {
    if (error instanceof LlmContextBudgetError) return error.code;
    if (error instanceof RDRadarOutputSchemaError) return error.code;
    return error instanceof LlmJsonCompatibilityError ? error.code : `${stage}: ${this.failureReason(error)}`;
  }

  private record(value: unknown, label: string): Record<string, unknown> {
    if (!this.isRecord(value)) throw new BadGatewayException(`${label} must be an object`);
    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private text(value: unknown, field: string, maximum: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new BadGatewayException(`${field} is invalid`);
    return value.trim();
  }

  private textArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.length > 25) throw new BadGatewayException(`${field} is invalid`);
    return value.map((item) => this.text(item, field, 1_000));
  }

  private inputText(value: unknown, field: string, maximum: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new BadRequestException(`${field} is invalid`);
    return value.trim();
  }

  private ref(value: unknown, field: string): string {
    const text = this.inputText(value, field, 200);
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(text) || text.includes("..")) throw new BadRequestException(`${field} is invalid`);
    return text;
  }

  private sha(value: unknown): string {
    const text = this.inputText(value, "commit", 40);
    if (!/^[a-f0-9]{40}$/i.test(text)) throw new BadRequestException("commit must be a full SHA");
    return text.toLowerCase();
  }

  private refOrSha(value: unknown, field: string): string {
    return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : this.ref(value, field);
  }

  private pathArray(value: unknown): string[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw new BadRequestException("includePaths must be a bounded array");
    return value.map((item) => {
      const path = this.inputText(item, "includePaths", 300).replace(/\\/g, "/");
      if (path.startsWith("/") || path.includes("..") || path.includes("\0")) throw new BadRequestException("includePaths contains an unsafe path");
      return path;
    });
  }
}

class AnalysisCancelledError extends Error {}
