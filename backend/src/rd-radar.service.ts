import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "./data-access/prisma.service";
import { createHash, randomUUID } from "node:crypto";
import type {
  CollectPreviewRequestDto,
  CreateCandidateInitiativeRequestDto,
  CreateCandidateInitiativeResponseDto,
  CreateEvidenceReviewRequestDto,
  CreateRDRadarEvidenceReviewRequestDto,
  CreateRDRadarEvidenceReviewResponseDto,
  CreatePMDecisionRequestDto,
  CreatePMDecisionResponseDto,
  CreateWorkflowRunSummaryResponseDto,
  RDRadarCandidateDto,
  RDRadarEvidenceReviewDto,
  RDRadarEvidenceItemDto,
  RDRadarEvidenceResponseDto,
  RDRadarGithubSonicPreviewResponseDto,
  RDRadarGithubSonicRiskArea,
  RDRadarGithubSonicTechnicalDomain,
  RDRadarGithubStatusDto,
  RDRadarNextGate,
  RDRadarPMDecisionDto,
  RDRadarRealInputEvidenceItemDto,
  RDRadarRealInputRequestDto,
  RDRadarRealInputResponseDto,
  RDRadarReviewSummaryDto,
  RDRadarStatusDto,
  RDRadarWorkflowStatus,
  RDRadarWorkflowRunSummaryDto
} from "./rd-radar.dto";
import {
  rdRadarCandidateFixtures,
  rdRadarEvidenceFixtures,
  rdRadarGithubSonicPreviewFixture,
  rdRadarGithubStatusFixture,
  rdRadarPMDecisionFixtures,
  rdRadarReviewSummaryFixture,
  rdRadarWorkflowRunFixtures
} from "./rd-radar.fixtures";
import { RuntimeConfigService } from "./runtime-config.service";

const WORKFLOW_STATUSES: RDRadarWorkflowStatus[] = ["PASS", "FAIL", "ABORTED"];
const GITHUB_SONIC_TECHNICAL_DOMAINS: RDRadarGithubSonicTechnicalDomain[] = [
  "build_image",
  "swss_orchagent",
  "sai_syncd",
  "management_testing",
  "platform_abstraction",
  "reliability",
  "security"
];
const GITHUB_SONIC_RISK_AREAS: RDRadarGithubSonicRiskArea[] = [
  "build_stability",
  "control_plane_behavior",
  "sai_adapter_dependency",
  "validation_coverage",
  "platform_driver_assumption",
  "reboot_health",
  "configuration_drift"
];
const NEXT_GATES: RDRadarNextGate[] = [
  "PM_REVIEW_REQUIRED",
  "SECURITY_REVIEW_REQUIRED",
  "RUNTIME_VERIFICATION_REQUIRED",
  "NO_ACTION_REQUIRED"
];
const FORBIDDEN_SANITIZED_FIELDS = ["rawHtml", "rawContent", "fullHeaders", "secrets"];

type Delegate<T> = {
  findMany(args?: unknown): Promise<T[]>;
  upsert?(args: unknown): Promise<T>;
  create?(args: unknown): Promise<T>;
};

type PrismaRdRadarClient = {
  evidenceSourceV2: Delegate<PrismaEvidenceSource>;
  evidenceItem: Delegate<PrismaEvidenceItem>;
  evidenceReview: Delegate<PrismaEvidenceReview>;
  candidateInitiative: Delegate<PrismaCandidateInitiative>;
  pMDecision: Delegate<PrismaPMDecision>;
  workflowRunSummary: Delegate<PrismaWorkflowRunSummary>;
  gitHubIntegrationStatus: Delegate<PrismaGitHubIntegrationStatus>;
};

type PrismaEvidenceSource = {
  id: string;
  url: string;
  title: string;
  sourceType: string;
};

type PrismaEvidenceItem = {
  id: string;
  sourceId: string;
  title: string;
  sourceUrl: string;
  sourceType?: string;
  sanitizedFinding: string;
  collectionStatus: string;
  reviewerDecision: string | null;
  collectedAt: Date;
  reviews?: PrismaEvidenceReview[];
  source?: PrismaEvidenceSource;
};

type PrismaEvidenceReview = {
  id: string;
  evidenceItemId: string;
  relevance: number;
  reliability: number;
  freshness: number;
  businessApplicability: number;
  reviewerDecision: string;
  reviewerRole: string;
  notes: string | null;
  createdAt: Date;
  evidenceItem?: PrismaEvidenceItem;
};

type PrismaCandidateInitiative = {
  candidateId: string;
  title: string;
  status: string;
  problemStatement: string;
  evidenceSummary: string;
  expectedBusinessValue: string;
  uncertaintyRisks: unknown;
  requiredAdditionalEvidence: unknown;
  nextGate: string;
  requiresPMApproval: boolean;
  runtimeVerificationRequired: boolean;
  createdAsDraftOnly: boolean;
  createdAt: Date;
};

type PrismaPMDecision = {
  id: string;
  candidateId: string;
  decision: string;
  decisionReason: string;
  approvedScopeIfAny: string | null;
  nextGate: string;
  runtimeVerificationRequired: boolean;
  createdAt: Date;
};

type PrismaWorkflowRunSummary = {
  id: string;
  workflowName: string;
  workflowId: string | null;
  executionId: string | null;
  sanitizedOutput?: unknown;
  workflowStatus: string;
  evidenceCount: number;
  reviewStatus: string;
  candidateId: string | null;
  nextGate: string;
  runtimeVerificationRequired: boolean;
  forbiddenActionsObserved: boolean;
  workflowActive: boolean;
  triggerType: string;
  createdAt: Date;
};

type PrismaGitHubIntegrationStatus = {
  repoFullName: string;
  branch: string;
  integrationStatus: string;
  requiredCheckName: string;
  latestCheckStatus: string | null;
  branchProtectionStatus: string;
  writeActionsExecuted: boolean;
  checkedAt: Date;
};

@Injectable()
export class RDRadarService {
  private readonly runtimeConfig = new RuntimeConfigService();
  private readonly prismaClient: PrismaRdRadarClient;

  constructor(@Optional() @Inject(PrismaService) prismaService?: PrismaService) {
    this.prismaClient = (prismaService ?? null) as unknown as PrismaRdRadarClient;
  }

  async status(): Promise<RDRadarStatusDto> {
    if (this.usesPostgres()) {
      const [evidence, candidates, workflowRuns, githubStatuses] = await Promise.all([
        this.prismaClient.evidenceItem.findMany(),
        this.prismaClient.candidateInitiative.findMany(),
        this.prismaClient.workflowRunSummary.findMany(),
        this.prismaClient.gitHubIntegrationStatus.findMany()
      ]);

      return {
        radarStatus: "READY_FOR_PM_REVIEW",
        persistenceMode: "prisma",
        evidenceCount: evidence.length,
        candidateCount: candidates.length,
        workflowRunCount: workflowRuns.length,
        githubIntegrationStatus: githubStatuses[0]?.integrationStatus ?? "pending",
        nextGate: candidates[0]?.nextGate ?? "PM_REVIEW_REQUIRED",
        forbiddenActionsObserved: workflowRuns.some((item) => item.forbiddenActionsObserved)
      };
    }

    return {
      radarStatus: "READY_FOR_PM_REVIEW",
      persistenceMode: "fixture",
      evidenceCount: rdRadarEvidenceFixtures.length,
      candidateCount: rdRadarCandidateFixtures.length,
      workflowRunCount: rdRadarWorkflowRunFixtures.length,
      githubIntegrationStatus: rdRadarGithubStatusFixture.status,
      nextGate: "PM_REVIEW_REQUIRED",
      forbiddenActionsObserved: false
    };
  }

  async evidence(): Promise<RDRadarEvidenceResponseDto> {
    if (this.usesPostgres()) {
      const evidence = await this.prismaClient.evidenceItem.findMany({
        include: {
          source: true,
          reviews: true
        },
        orderBy: {
          collectedAt: "desc"
        }
      });

      return {
        evidence: evidence.map((item) => this.mapEvidence(item)),
        reviewSummary: this.reviewSummary(evidence)
      };
    }

    return {
      evidence: rdRadarEvidenceFixtures,
      reviewSummary: rdRadarReviewSummaryFixture
    };
  }

  async collectPreview(body: CollectPreviewRequestDto): Promise<RDRadarEvidenceResponseDto> {
    void body;

    if (this.usesPostgres()) {
      for (const item of rdRadarEvidenceFixtures) {
        if (!this.prismaClient.evidenceSourceV2.upsert || !this.prismaClient.evidenceItem.upsert) {
          throw new Error("Prisma R&D Radar client is not generated for persistence models");
        }

        await this.prismaClient.evidenceSourceV2.upsert({
          where: {
            url: item.sourceUrl
          },
          update: {
            title: item.title,
            sourceType: item.sourceType,
            status: "approved",
            lastCollectedAt: new Date(item.collectedAt)
          },
          create: {
            id: item.sourceId,
            url: item.sourceUrl,
            title: item.title,
            sourceType: item.sourceType,
            status: "approved",
            lastCollectedAt: new Date(item.collectedAt)
          }
        });

        await this.prismaClient.evidenceItem.upsert({
          where: {
            id: item.id
          },
          update: {
            title: item.title,
            sourceUrl: item.sourceUrl,
            sanitizedFinding: item.sanitizedFinding,
            collectionStatus: item.collectionStatus,
            reviewerDecision: item.reviewerDecision,
            collectedAt: new Date(item.collectedAt)
          },
          create: {
            id: item.id,
            sourceId: item.sourceId,
            title: item.title,
            sourceUrl: item.sourceUrl,
            sanitizedFinding: item.sanitizedFinding,
            collectionStatus: item.collectionStatus,
            reviewerDecision: item.reviewerDecision,
            collectedAt: new Date(item.collectedAt)
          }
        });
      }
    }

    return this.evidence();
  }

  async realInputPreview(body: RDRadarRealInputRequestDto): Promise<RDRadarRealInputResponseDto> {
    this.assertNoForbiddenFields(body);

    const inputText = this.requiredString(body.inputText, "inputText");
    const category = this.requiredString(body.category, "category");
    const submittedBy = this.requiredString(body.submittedBy, "submittedBy");
    const purpose = this.requiredString(body.purpose, "purpose");
    const sanitizedFinding = this.sanitizeFinding(inputText);
    const digest = this.stableDigest([sanitizedFinding, category, submittedBy, purpose, body.sourceUrl ?? "manual"]);
    const sourceUrl = this.realInputSourceUrl(body.sourceUrl, digest);
    const sourceId = `source-real-input-${digest}`;
    const evidenceId = `evidence-real-input-${digest}`;
    const candidateId = `candidate-real-input-${digest}`;
    const title = `${this.titleCase(category)} readiness signal`;
    const relevanceScore = this.realInputRelevanceScore(sanitizedFinding, category, purpose);
    const riskLevel = this.realInputRiskLevel(sanitizedFinding, category);
    const businessValue = this.realInputBusinessValue(sanitizedFinding, purpose);
    const recommendedInitiative = {
      candidateId,
      title: `Draft Candidate: ${this.titleCase(category)} readiness review path`,
      recommendedPath: `Review the submitted ${category.toLowerCase()} signal with PM oversight before any initiative promotion.`,
      expectedBusinessValue: `A reviewed ${category.toLowerCase()} readiness path can turn the submitted customer signal into a structured, evidence-backed decision.`,
      riskLevel,
      humanApprovalRequired: true as const,
      nextGate: "PM_REVIEW_REQUIRED" as const,
      createdAsDraftOnly: true as const
    };
    const evidenceItem: RDRadarRealInputEvidenceItemDto = {
      id: evidenceId,
      title,
      sourceUrl,
      sanitizedFinding,
      relevanceScore,
      riskLevel,
      businessValue
    };

    if (this.usesRdRadarPersistence()) {
      if (
        !this.prismaClient.evidenceSourceV2.upsert ||
        !this.prismaClient.evidenceItem.upsert ||
        !this.prismaClient.candidateInitiative.upsert
      ) {
        throw new Error("Prisma R&D Radar client is not generated for real-input persistence models");
      }

      const collectedAt = new Date();
      const source = await this.prismaClient.evidenceSourceV2.upsert({
        where: { url: sourceUrl },
        update: {
          title,
          sourceType: "manual",
          status: "approved",
          lastCollectedAt: collectedAt
        },
        create: {
          id: sourceId,
          url: sourceUrl,
          title,
          sourceType: "manual",
          status: "approved",
          lastCollectedAt: collectedAt
        }
      });

      await this.prismaClient.evidenceItem.upsert({
        where: { id: evidenceId },
        update: {
          sourceId: source.id,
          title,
          sourceUrl,
          sanitizedFinding,
          collectionStatus: "EVIDENCE_COLLECTED",
          reviewerDecision: "PM_REVIEW_REQUIRED",
          collectedAt
        },
        create: {
          id: evidenceId,
          sourceId: source.id,
          title,
          sourceUrl,
          sanitizedFinding,
          collectionStatus: "EVIDENCE_COLLECTED",
          reviewerDecision: "PM_REVIEW_REQUIRED",
          collectedAt
        }
      });

      await this.prismaClient.candidateInitiative.upsert({
        where: { candidateId },
        update: {
          title: recommendedInitiative.title,
          problemStatement: sanitizedFinding,
          evidenceSummary: sanitizedFinding,
          expectedBusinessValue: recommendedInitiative.expectedBusinessValue,
          nextGate: "PM_REVIEW_REQUIRED",
          requiresPMApproval: true,
          runtimeVerificationRequired: true,
          createdAsDraftOnly: true
        },
        create: {
          id: candidateId,
          candidateId,
          title: recommendedInitiative.title,
          problemStatement: sanitizedFinding,
          evidenceSummary: sanitizedFinding,
          expectedBusinessValue: recommendedInitiative.expectedBusinessValue,
          nextGate: "PM_REVIEW_REQUIRED",
          requiresPMApproval: true,
          runtimeVerificationRequired: true,
          createdAsDraftOnly: true,
          uncertaintyRisks: [`${riskLevel} rule-based review risk; PM review remains required.`],
          requiredAdditionalEvidence: ["PM review is required before promotion beyond draft candidate state."]
        }
      });
    }

    return {
      accepted: true,
      persistence: this.usesRdRadarPersistence(),
      evidenceItems: [evidenceItem],
      recommendedInitiative
    };
  }

  async createReview(body: CreateEvidenceReviewRequestDto): Promise<{ id: string; accepted: true }> {
    this.assertScore(body.relevance, "relevance");
    this.assertScore(body.reliability, "reliability");
    this.assertScore(body.freshness, "freshness");
    this.assertScore(body.businessApplicability, "businessApplicability");

    if (this.usesPostgres()) {
      if (!this.prismaClient.evidenceReview.create) {
        throw new Error("Prisma R&D Radar client is not generated for persistence models");
      }

      const review = await this.prismaClient.evidenceReview.create({
        data: {
          id: `review-${randomUUID()}`,
          evidenceItemId: body.evidenceItemId,
          relevance: body.relevance,
          reliability: body.reliability,
          freshness: body.freshness,
          businessApplicability: body.businessApplicability,
          reviewerDecision: body.reviewerDecision,
          reviewerRole: body.reviewerRole ?? "pm_reviewer",
          notes: body.notes
        }
      });

      return {
        id: review.id,
        accepted: true
      };
    }

    return {
      id: `review-${randomUUID()}`,
      accepted: true
    };
  }

  async evidenceReviews(candidateId?: string): Promise<RDRadarEvidenceReviewDto[]> {
    if (this.usesPostgres()) {
      if (candidateId) {
        throw new BadRequestException("candidate-specific evidence review filtering is not supported by current schema");
      }

      const data = await this.prismaClient.evidenceReview.findMany({
        include: {
          evidenceItem: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });

      return data.map((item) => this.mapEvidenceReview(item, null));
    }

    const fixtureCandidateId = rdRadarCandidateFixtures[0]?.candidateId ?? "fixture-candidate";
    if (candidateId && candidateId !== fixtureCandidateId) {
      return [];
    }

    return rdRadarEvidenceFixtures.map((item) => ({
      id: `review-${item.id}`,
      candidateId: fixtureCandidateId,
      evidenceId: item.id,
      sourceId: item.sourceId,
      relevanceScore: item.scores.relevance,
      credibilityScore: item.scores.reliability,
      riskScore: item.scores.businessApplicability,
      reviewerDecision: item.reviewerDecision,
      reviewerNotes: "Fixture fallback review only.",
      createdAt: item.collectedAt
    }));
  }

  async createEvidenceReview(
    body: CreateRDRadarEvidenceReviewRequestDto
  ): Promise<CreateRDRadarEvidenceReviewResponseDto> {
    this.assertNoForbiddenFields(body);
    this.assertScore(body.relevanceScore, "relevanceScore");
    this.assertScore(body.credibilityScore, "credibilityScore");
    this.assertScore(body.riskScore, "riskScore");

    const candidateId = this.requiredString(body.candidateId, "candidateId");
    const evidenceId = this.optionalString(body.evidenceId, "evidenceId");
    const sourceId = this.optionalString(body.sourceId, "sourceId");
    const reviewerDecision = this.requiredString(body.reviewerDecision, "reviewerDecision");
    const reviewerNotes = body.reviewerNotes === undefined ? undefined : this.requiredString(body.reviewerNotes, "reviewerNotes");

    if (!evidenceId && !sourceId) {
      throw new BadRequestException("evidenceId or sourceId is required");
    }

    if (this.usesPostgres()) {
      if (!this.prismaClient.evidenceReview.create) {
        throw new Error("Prisma R&D Radar client is not generated for persistence models");
      }

      const evidenceItemId = evidenceId ?? (await this.resolveEvidenceItemIdFromSource(sourceId));
      const review = await this.prismaClient.evidenceReview.create({
        data: {
          id: `review-${randomUUID()}`,
          evidenceItemId,
          relevance: body.relevanceScore,
          reliability: body.credibilityScore,
          freshness: body.riskScore,
          businessApplicability: body.riskScore,
          reviewerDecision,
          reviewerRole: "pm_reviewer",
          notes: reviewerNotes
        },
        include: {
          evidenceItem: true
        }
      });

      return {
        accepted: true,
        persistence: true,
        review: this.mapEvidenceReview(review, null)
      };
    }

    const fallbackEvidenceId = evidenceId ?? sourceId ?? "fixture-evidence";
    return {
      accepted: true,
      persistence: false,
      review: {
        id: `review-${randomUUID()}`,
        candidateId,
        evidenceId: fallbackEvidenceId,
        sourceId: sourceId ?? null,
        relevanceScore: body.relevanceScore,
        credibilityScore: body.credibilityScore,
        riskScore: body.riskScore,
        reviewerDecision,
        reviewerNotes: reviewerNotes ?? null,
        createdAt: new Date().toISOString()
      }
    };
  }

  async candidates(): Promise<RDRadarCandidateDto[]> {
    if (this.usesPostgres()) {
      const data = await this.prismaClient.candidateInitiative.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      return data.map((item) => this.mapCandidate(item));
    }

    return rdRadarCandidateFixtures;
  }

  async createCandidate(body: CreateCandidateInitiativeRequestDto): Promise<CreateCandidateInitiativeResponseDto> {
    this.assertNoForbiddenFields(body);

    if (this.usesPostgres()) {
      if (!this.prismaClient.candidateInitiative.create) {
        throw new Error("Prisma R&D Radar client is not generated for persistence models");
      }

      const candidate = await this.prismaClient.candidateInitiative.create({
        data: {
          id: `candidate-${randomUUID()}`,
          candidateId: body.candidateId,
          title: body.title,
          problemStatement: body.problemStatement,
          evidenceSummary: body.evidenceSummary,
          expectedBusinessValue: body.expectedBusinessValue,
          uncertaintyRisks: body.uncertaintyRisks ?? [],
          requiredAdditionalEvidence: body.requiredAdditionalEvidence ?? [],
          nextGate: body.nextGate ?? "PM_REVIEW_REQUIRED",
          requiresPMApproval: true,
          runtimeVerificationRequired: true,
          createdAsDraftOnly: true
        }
      });

      return {
        accepted: true,
        persistence: true,
        candidate: this.mapCandidate(candidate)
      };
    }

    return {
      accepted: true,
      persistence: false,
      candidate: {
        candidateId: body.candidateId,
        title: body.title,
        status: "DRAFT_ONLY",
        problemStatement: body.problemStatement,
        evidenceSummary: body.evidenceSummary,
        expectedBusinessValue: body.expectedBusinessValue,
        uncertaintyRisks: body.uncertaintyRisks ?? [],
        requiredAdditionalEvidence: body.requiredAdditionalEvidence ?? [],
        nextGate: body.nextGate ?? "PM_REVIEW_REQUIRED",
        requiresPMApproval: true,
        runtimeVerificationRequired: true,
        createdAsDraftOnly: true,
        createdAt: new Date().toISOString()
      }
    };
  }

  async pmDecisions(candidateId?: string): Promise<RDRadarPMDecisionDto[]> {
    if (this.usesPostgres()) {
      const data = await this.prismaClient.pMDecision.findMany({
        where: candidateId ? { candidateId } : undefined,
        orderBy: {
          createdAt: "desc"
        }
      });

      return data.map((item) => this.mapPMDecision(item));
    }

    return candidateId
      ? rdRadarPMDecisionFixtures.filter((item) => item.candidateId === candidateId)
      : rdRadarPMDecisionFixtures;
  }

  async createPMDecision(body: CreatePMDecisionRequestDto): Promise<CreatePMDecisionResponseDto> {
    this.assertNoForbiddenFields(body);

    if (this.usesPostgres()) {
      if (!this.prismaClient.pMDecision.create) {
        throw new Error("Prisma R&D Radar client is not generated for persistence models");
      }

      const decision = await this.prismaClient.pMDecision.create({
        data: {
          id: `pm-decision-${randomUUID()}`,
          candidateId: body.candidateId,
          decision: body.decision,
          decisionReason: body.decisionReason,
          approvedScopeIfAny: body.approvedScopeIfAny,
          nextGate: body.nextGate,
          runtimeVerificationRequired: true
        }
      });

      return {
        accepted: true,
        persistence: true,
        decision: this.mapPMDecision(decision)
      };
    }

    return {
      accepted: true,
      persistence: false,
      decision: {
        id: `pm-decision-${randomUUID()}`,
        candidateId: body.candidateId,
        decision: body.decision,
        decisionReason: body.decisionReason,
        approvedScopeIfAny: body.approvedScopeIfAny ?? null,
        nextGate: body.nextGate,
        runtimeVerificationRequired: true,
        createdAt: new Date().toISOString()
      }
    };
  }

  async workflowRuns(): Promise<RDRadarWorkflowRunSummaryDto[]> {
    if (this.usesPostgres()) {
      const data = await this.prismaClient.workflowRunSummary.findMany({
        orderBy: {
          createdAt: "desc"
        }
      });

      return data.map((item) => this.mapWorkflowRun(item));
    }

    return rdRadarWorkflowRunFixtures;
  }

  async createWorkflowRun(body: unknown): Promise<CreateWorkflowRunSummaryResponseDto> {
    const payload = this.validateWorkflowRunSummary(body);
    const receivedAt = payload.receivedAt ?? new Date().toISOString();
    const summary: RDRadarWorkflowRunSummaryDto = {
      id: `workflow-summary-${randomUUID()}`,
      workflowName: payload.source,
      workflowId: payload.workflowId ?? null,
      executionId: payload.executionId ?? null,
      correlationId: payload.correlationId ?? null,
      workflowStatus: payload.workflowStatus,
      evidenceCount: payload.evidenceCount,
      reviewStatus: payload.reviewStatus,
      candidateId: payload.candidateId,
      nextGate: payload.nextGate,
      runtimeVerificationRequired: payload.runtimeVerificationRequired,
      forbiddenActionsObserved: payload.forbiddenActionsObserved,
      workflowActive: false,
      triggerType: "manual/internal only",
      createdAt: receivedAt
    };

    if (this.usesRdRadarPersistence()) {
      if (!this.prismaClient.workflowRunSummary.create) {
        throw new Error("Prisma R&D Radar client is not generated for WorkflowRunSummary persistence");
      }

      const persisted = await this.prismaClient.workflowRunSummary.create({
        data: {
          id: summary.id,
          workflowName: summary.workflowName,
          workflowId: summary.workflowId,
          executionId: summary.executionId,
          workflowStatus: summary.workflowStatus,
          evidenceCount: summary.evidenceCount,
          reviewStatus: summary.reviewStatus,
          candidateId: summary.candidateId,
          nextGate: summary.nextGate,
          runtimeVerificationRequired: summary.runtimeVerificationRequired,
          forbiddenActionsObserved: summary.forbiddenActionsObserved,
          sanitizedOutput: {
            source: payload.source,
            workflowId: payload.workflowId,
            executionId: payload.executionId,
            correlationId: payload.correlationId,
            executedAt: payload.executedAt,
            receivedAt
          },
          workflowActive: false,
          triggerType: summary.triggerType,
          createdAt: new Date(receivedAt)
        }
      });

      return {
        accepted: true,
        persistence: true,
        summary: this.mapWorkflowRun(persisted)
      };
    }

    return {
      accepted: true,
      persistence: false,
      summary
    };
  }

  async githubStatus(): Promise<RDRadarGithubStatusDto> {
    if (this.usesPostgres()) {
      const data = await this.prismaClient.gitHubIntegrationStatus.findMany({
        orderBy: {
          checkedAt: "desc"
        },
        take: 1
      });

      if (data[0]) {
        return this.mapGithubStatus(data[0]);
      }
    }

    return rdRadarGithubStatusFixture;
  }

  githubSonicPreview(): RDRadarGithubSonicPreviewResponseDto {
    const repositorySignals = rdRadarGithubSonicPreviewFixture.repositorySignals.slice(
      0,
      rdRadarGithubSonicPreviewFixture.githubEvidenceSource.maxItems
    );
    const byTechnicalDomain = Object.fromEntries(
      GITHUB_SONIC_TECHNICAL_DOMAINS.map((domain) => [domain, 0])
    ) as Record<RDRadarGithubSonicTechnicalDomain, number>;
    const byRiskArea = Object.fromEntries(
      GITHUB_SONIC_RISK_AREAS.map((riskArea) => [riskArea, 0])
    ) as Record<RDRadarGithubSonicRiskArea, number>;

    for (const signal of repositorySignals) {
      byTechnicalDomain[signal.technicalDomain] += 1;
      byRiskArea[signal.riskArea] += 1;
    }

    return {
      githubEvidenceSource: rdRadarGithubSonicPreviewFixture.githubEvidenceSource,
      repositorySignals,
      draftRecommendations: rdRadarGithubSonicPreviewFixture.draftRecommendations,
      classificationSummary: {
        byTechnicalDomain,
        byRiskArea,
        topRisks: [...repositorySignals].sort((left, right) => right.priorityScore - left.priorityScore).slice(0, 5)
      }
    };
  }

  private usesPostgres(): boolean {
    const config = this.runtimeConfig.load();
    return config.runtimeMode === "postgres_read" && config.dataSource === "postgres_read";
  }

  private usesRdRadarPersistence(): boolean {
    const config = this.runtimeConfig.load();
    return config.runtimeMode === "postgres_read" && config.dataSource === "postgres_read" && config.dbWriteMode === "rd_radar_only";
  }

  private validateWorkflowRunSummary(value: unknown): {
    workflowStatus: RDRadarWorkflowStatus;
    evidenceCount: number;
    reviewStatus: RDRadarWorkflowStatus;
    candidateId: string;
    nextGate: RDRadarNextGate;
    runtimeVerificationRequired: boolean;
    forbiddenActionsObserved: boolean;
    source: string;
    workflowId?: string;
    executionId?: string;
    correlationId?: string;
    executedAt?: string;
    receivedAt?: string;
  } {
    this.assertNoForbiddenFields(value);

    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }

    const workflowId = this.optionalExecutionIdentifier(value.workflowId, "workflowId");
    const executionId = this.optionalExecutionIdentifier(value.executionId, "executionId");
    const correlationId = this.optionalExecutionIdentifier(value.correlationId, "correlationId");
    const executedAt = this.optionalString(value.executedAt, "executedAt");
    const receivedAt = this.optionalString(value.receivedAt, "receivedAt");
    this.assertIsoTimestamp(executedAt, "executedAt");
    this.assertIsoTimestamp(receivedAt, "receivedAt");

    if (!executedAt && !receivedAt) {
      throw new BadRequestException("executedAt or receivedAt is required");
    }

    return {
      workflowStatus: this.requiredEnum(value.workflowStatus, "workflowStatus", WORKFLOW_STATUSES),
      evidenceCount: this.requiredNumber(value.evidenceCount, "evidenceCount"),
      reviewStatus: this.requiredEnum(value.reviewStatus, "reviewStatus", WORKFLOW_STATUSES),
      candidateId: this.requiredString(value.candidateId, "candidateId"),
      nextGate: this.requiredEnum(value.nextGate, "nextGate", NEXT_GATES),
      runtimeVerificationRequired: this.requiredBoolean(value.runtimeVerificationRequired, "runtimeVerificationRequired"),
      forbiddenActionsObserved: this.requiredBoolean(value.forbiddenActionsObserved, "forbiddenActionsObserved"),
      source: this.requiredString(value.source, "source"),
      workflowId,
      executionId,
      correlationId,
      executedAt,
      receivedAt
    };
  }

  private async resolveEvidenceItemIdFromSource(sourceId: string | undefined): Promise<string> {
    if (!sourceId) {
      throw new BadRequestException("sourceId must be a non-empty string");
    }

    const evidence = await this.prismaClient.evidenceItem.findMany({
      where: {
        sourceId
      },
      take: 1
    });

    if (!evidence[0]) {
      throw new BadRequestException("sourceId does not match a persisted evidence item");
    }

    return evidence[0].id;
  }

  private mapEvidence(item: PrismaEvidenceItem): RDRadarEvidenceItemDto {
    const latestReview = item.reviews?.[0];

    return {
      id: item.id,
      sourceId: item.sourceId,
      title: item.title,
      sourceUrl: item.sourceUrl,
      sourceType: item.source?.sourceType ?? item.sourceType ?? "unknown",
      sanitizedFinding: item.sanitizedFinding,
      collectionStatus: item.collectionStatus,
      reviewerDecision: latestReview?.reviewerDecision ?? item.reviewerDecision ?? "pending_review",
      scores: {
        relevance: latestReview?.relevance ?? 0,
        reliability: latestReview?.reliability ?? 0,
        freshness: latestReview?.freshness ?? 0,
        businessApplicability: latestReview?.businessApplicability ?? 0
      },
      collectedAt: item.collectedAt.toISOString()
    };
  }

  private mapEvidenceReview(item: PrismaEvidenceReview, candidateId: string | null): RDRadarEvidenceReviewDto {
    return {
      id: item.id,
      candidateId,
      evidenceId: item.evidenceItemId,
      sourceId: item.evidenceItem?.sourceId ?? null,
      relevanceScore: item.relevance,
      credibilityScore: item.reliability,
      riskScore: item.businessApplicability,
      reviewerDecision: item.reviewerDecision,
      reviewerNotes: item.notes,
      createdAt: item.createdAt.toISOString()
    };
  }

  private reviewSummary(evidence: PrismaEvidenceItem[]): RDRadarReviewSummaryDto {
    const reviewed = evidence.flatMap((item) => item.reviews ?? []);
    const divisor = reviewed.length || 1;

    return {
      averageScores: {
        relevance: this.average(reviewed.map((item) => item.relevance), divisor),
        reliability: this.average(reviewed.map((item) => item.reliability), divisor),
        freshness: this.average(reviewed.map((item) => item.freshness), divisor),
        businessApplicability: this.average(reviewed.map((item) => item.businessApplicability), divisor)
      },
      overallDecision: reviewed.length ? "PASS_WITH_PM_REVIEW_REQUIRED" : "PENDING_REVIEW",
      evidenceWasSanitized: true,
      rawPageContentIncluded: false,
      aiGeneratedConclusion: false
    };
  }

  private average(values: number[], divisor: number): number {
    const total = values.reduce((sum, value) => sum + value, 0);
    return Number((total / divisor).toFixed(2));
  }

  private mapCandidate(item: PrismaCandidateInitiative): RDRadarCandidateDto {
    return {
      candidateId: item.candidateId,
      title: item.title,
      status: item.status,
      problemStatement: item.problemStatement,
      evidenceSummary: item.evidenceSummary,
      expectedBusinessValue: item.expectedBusinessValue,
      uncertaintyRisks: this.stringArray(item.uncertaintyRisks),
      requiredAdditionalEvidence: this.stringArray(item.requiredAdditionalEvidence),
      nextGate: item.nextGate,
      requiresPMApproval: item.requiresPMApproval,
      runtimeVerificationRequired: item.runtimeVerificationRequired,
      createdAsDraftOnly: item.createdAsDraftOnly,
      createdAt: item.createdAt.toISOString()
    };
  }

  private mapPMDecision(item: PrismaPMDecision): RDRadarPMDecisionDto {
    return {
      id: item.id,
      candidateId: item.candidateId,
      decision: item.decision,
      decisionReason: item.decisionReason,
      approvedScopeIfAny: item.approvedScopeIfAny,
      nextGate: item.nextGate,
      runtimeVerificationRequired: item.runtimeVerificationRequired,
      createdAt: item.createdAt.toISOString()
    };
  }

  private mapWorkflowRun(item: PrismaWorkflowRunSummary): RDRadarWorkflowRunSummaryDto {
    return {
      id: item.id,
      workflowName: item.workflowName,
      workflowId: item.workflowId,
      executionId: item.executionId,
      correlationId: this.workflowRunCorrelationId(item),
      workflowStatus: item.workflowStatus,
      evidenceCount: item.evidenceCount,
      reviewStatus: item.reviewStatus,
      candidateId: item.candidateId ?? "",
      nextGate: item.nextGate,
      runtimeVerificationRequired: item.runtimeVerificationRequired,
      forbiddenActionsObserved: item.forbiddenActionsObserved,
      workflowActive: item.workflowActive,
      triggerType: item.triggerType,
      createdAt: item.createdAt.toISOString()
    };
  }


  private workflowRunCorrelationId(item: PrismaWorkflowRunSummary): string | null {
    if (!this.isRecord(item.sanitizedOutput)) {
      return null;
    }

    const value = item.sanitizedOutput.correlationId;
    return typeof value === "string" && value.trim() ? value : null;
  }

  private mapGithubStatus(item: PrismaGitHubIntegrationStatus): RDRadarGithubStatusDto {
    const repositoryConfigured = Boolean(item.repoFullName);
    const repositoryAccessStatus = repositoryConfigured ? "ready" : "pending";
    const readinessStatus = item.writeActionsExecuted
      ? "unavailable"
      : this.githubReadinessStatus(item.latestCheckStatus ?? item.integrationStatus);

    return {
      status: readinessStatus,
      mode: "read_only",
      repository: {
        configured: repositoryConfigured,
        readOnly: true
      },
      checks: [
        {
          name: "Repository access",
          status: repositoryAccessStatus,
          message: repositoryConfigured ? "Repository readiness can be reviewed." : "Repository readiness is pending."
        },
        {
          name: "Read-only protection",
          status: item.writeActionsExecuted ? "unavailable" : "ready",
          message: item.writeActionsExecuted
            ? "Read-only readiness is unavailable."
            : "This view is read-only and does not make source-control changes."
        },
        {
          name: "Readiness Check",
          status: readinessStatus,
          message: readinessStatus === "ready" ? "Readiness Check is ready." : "Repository readiness is pending."
        }
      ],
      lastCheckedAt: item.checkedAt.toISOString()
    };
  }

  private githubReadinessStatus(value: string | null): "ready" | "pending" | "unavailable" {
    const normalized = value?.toLowerCase() ?? "";

    if (["ready", "pass", "passed", "success", "completed"].some((item) => normalized.includes(item))) {
      return "ready";
    }

    if (["fail", "failed", "error", "unavailable"].some((item) => normalized.includes(item))) {
      return "unavailable";
    }

    return "pending";
  }

  private assertNoForbiddenFields(value: unknown): void {
    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }

    for (const field of FORBIDDEN_SANITIZED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(value, field)) {
        throw new BadRequestException(`${field} is not accepted on sanitized R&D Radar payloads`);
      }
    }
  }

  private sanitizeFinding(value: string): string {
    const sanitized = value
      .replace(/<[^>]*>/g, " ")
      .replace(/\b(secret|token|password|api[_ -]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]")
      .replace(/\s+/g, " ")
      .trim();

    if (!sanitized) {
      throw new BadRequestException("inputText must contain a customer-safe finding");
    }

    return sanitized.slice(0, 500);
  }

  private stableDigest(values: string[]): string {
    return createHash("sha256")
      .update(values.map((value) => value.trim().toLowerCase()).join("|"))
      .digest("hex")
      .slice(0, 16);
  }

  private realInputSourceUrl(value: string | undefined, digest: string): string {
    if (value === undefined) {
      return `manual://rd-radar/${digest}`;
    }

    const sourceUrl = this.requiredString(value, "sourceUrl");

    try {
      const parsed = new URL(sourceUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("unsupported protocol");
      }
    } catch {
      throw new BadRequestException("sourceUrl must be a valid http or https URL");
    }

    return sourceUrl;
  }

  private realInputRelevanceScore(inputText: string, category: string, purpose: string): number {
    const text = `${inputText} ${category} ${purpose}`.toLowerCase();
    const matches = ["readiness", "risk", "security", "evaluate", "assessment", "framework"].filter((term) =>
      text.includes(term)
    ).length;

    return matches >= 4 ? 5 : matches >= 2 ? 4 : 3;
  }

  private realInputRiskLevel(inputText: string, category: string): "low" | "medium" | "high" {
    const text = `${inputText} ${category}`.toLowerCase();
    return ["security", "cybersecurity", "infrastructure", "compliance"].some((term) => text.includes(term))
      ? "high"
      : "medium";
  }

  private realInputBusinessValue(inputText: string, purpose: string): "low" | "medium" | "high" {
    const text = `${inputText} ${purpose}`.toLowerCase();
    return ["customer", "readiness", "risk", "evaluate", "assess"].some((term) => text.includes(term))
      ? "high"
      : "medium";
  }

  private titleCase(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\b[a-z]/g, (character) => character.toUpperCase());
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private requiredEnum<T extends string>(value: unknown, fieldName: string, allowed: T[]): T {
    if (typeof value !== "string" || !allowed.includes(value as T)) {
      throw new BadRequestException(`${fieldName} must be one of: ${allowed.join(", ")}`);
    }

    return value as T;
  }

  private requiredNumber(value: unknown, fieldName: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new BadRequestException(`${fieldName} must be a number`);
    }

    return value;
  }

  private requiredString(value: unknown, fieldName: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} must be a non-empty string`);
    }

    return value;
  }

  private optionalString(value: unknown, fieldName: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.requiredString(value, fieldName);
  }

  private optionalExecutionIdentifier(value: unknown, fieldName: string): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalized = this.requiredString(value, fieldName).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} must be a safe execution identifier`);
    }

    return normalized;
  }

  private assertIsoTimestamp(value: string | undefined, fieldName: string): void {
    if (value === undefined) {
      return;
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) {
      throw new BadRequestException(`${fieldName} must be a valid ISO-8601 timestamp`);
    }
  }

  private requiredBoolean(value: unknown, fieldName: string): boolean {
    if (typeof value !== "boolean") {
      throw new BadRequestException(`${fieldName} must be a boolean`);
    }

    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private assertScore(value: number, fieldName: string): void {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`${fieldName} must be an integer from 1 to 5`);
    }
  }
}
