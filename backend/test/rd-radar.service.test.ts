import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { RDRadarService } from "../src/rd-radar.service";
import type { RuntimeConfig } from "../src/runtime-config.service";

type RDRadarServiceTestHarness = RDRadarService & {
  runtimeConfig: {
    load: () => RuntimeConfig;
  };
};

describe("RDRadarService evidence review contract", () => {
  it("rejects candidate-specific evidence review filtering in PostgreSQL mode", async () => {
    const service = new RDRadarService() as RDRadarServiceTestHarness;
    service.runtimeConfig = {
      load: () => ({
        runtimeMode: "postgres_read",
        dataSource: "postgres_read",
        dbWriteMode: "rd_radar_only",
        dbMigrationsAllowed: false,
        dbSeedAllowed: false,
        externalAdaptersAllowed: false
      })
    };

    await assert.rejects(
      () => service.evidenceReviews("candidate-unrelated-001"),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === "candidate-specific evidence review filtering is not supported by current schema"
    );
  });
});

describe("RDRadarService real input preview", () => {
  it("persists only approved R&D Radar draft records in PostgreSQL mode", async () => {
    const calls = {
      evidenceSourceUpsert: 0,
      evidenceItemUpsert: 0,
      candidateUpsert: 0,
      workflowCreate: 0,
      githubCreate: 0
    };
    let evidenceItemUpsertArgs: {
      update: { sourceId: string };
      create: { sourceId: string };
    } | undefined;
    const findMany = async () => [];
    const service = new RDRadarService() as RDRadarServiceTestHarness;
    service.runtimeConfig = {
      load: () => ({
        runtimeMode: "postgres_read",
        dataSource: "postgres_read",
        dbWriteMode: "rd_radar_only",
        dbMigrationsAllowed: false,
        dbSeedAllowed: false,
        externalAdaptersAllowed: false
      })
    };
    Object.defineProperty(service, "prismaClient", {
      value: {
        evidenceSourceV2: {
          findMany,
          upsert: async () => {
            calls.evidenceSourceUpsert += 1;
            return { id: "source-nist-csf-main-001" };
          }
        },
        evidenceItem: {
          findMany,
          upsert: async ({ update, create }: { update: { sourceId: string }; create: { sourceId: string } }) => {
            calls.evidenceItemUpsert += 1;
            evidenceItemUpsertArgs = { update, create };
            return {};
          }
        },
        candidateInitiative: {
          findMany,
          upsert: async () => {
            calls.candidateUpsert += 1;
            return {};
          }
        },
        evidenceReview: { findMany },
        pMDecision: { findMany },
        workflowRunSummary: {
          findMany,
          create: async () => {
            calls.workflowCreate += 1;
            return {};
          }
        },
        gitHubIntegrationStatus: {
          findMany,
          create: async () => {
            calls.githubCreate += 1;
            return {};
          }
        }
      }
    });

    const result = await service.realInputPreview({
      inputText: "Customer wants to evaluate NIST CSF readiness for infrastructure cybersecurity risk.",
      sourceUrl: "https://www.nist.gov/cyberframework",
      category: "security",
      submittedBy: "pm",
      purpose: "Assess whether this signal should become a reviewed R&D Radar candidate."
    });

    assert.equal(result.accepted, true);
    assert.equal(result.persistence, true);
    assert.equal(result.evidenceItems.length, 1);
    assert.equal(result.recommendedInitiative.humanApprovalRequired, true);
    assert.equal(result.recommendedInitiative.nextGate, "PM_REVIEW_REQUIRED");
    assert.equal(result.recommendedInitiative.createdAsDraftOnly, true);
    assert.equal(evidenceItemUpsertArgs?.update.sourceId, "source-nist-csf-main-001");
    assert.equal(evidenceItemUpsertArgs?.create.sourceId, "source-nist-csf-main-001");
    assert.deepEqual(calls, {
      evidenceSourceUpsert: 1,
      evidenceItemUpsert: 1,
      candidateUpsert: 1,
      workflowCreate: 0,
      githubCreate: 0
    });
  });

  it("returns deterministic manual-source output without persistence in fixture mode", async () => {
    const service = new RDRadarService();
    const payload = {
      inputText: "Customer requests a readiness review.",
      category: "operations",
      submittedBy: "pm",
      purpose: "Review a customer signal."
    };

    const first = await service.realInputPreview(payload);
    const second = await service.realInputPreview(payload);

    assert.equal(first.persistence, false);
    assert.deepEqual(first, second);
    assert.match(first.evidenceItems[0]?.sourceUrl ?? "", /^manual:\/\/rd-radar\//);
  });
});

describe("RDRadarService workflow run timestamp validation", () => {
  it("keeps valid PostgreSQL persistence and rejects invalid timestamps before persistence", async () => {
    let createCalls = 0;
    const service = new RDRadarService() as RDRadarServiceTestHarness;
    service.runtimeConfig = {
      load: () => ({
        runtimeMode: "postgres_read",
        dataSource: "postgres_read",
        dbWriteMode: "rd_radar_only",
        dbMigrationsAllowed: false,
        dbSeedAllowed: false,
        externalAdaptersAllowed: false
      })
    };
    Object.defineProperty(service, "prismaClient", {
      value: {
        workflowRunSummary: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createCalls += 1;
            return data;
          }
        }
      }
    });

    const validPayload = {
      workflowStatus: "PASS",
      evidenceCount: 1,
      reviewStatus: "PASS",
      candidateId: "candidate-test-001",
      nextGate: "PM_REVIEW_REQUIRED",
      runtimeVerificationRequired: true,
      forbiddenActionsObserved: false,
      source: "manual-internal",
      receivedAt: "2026-05-20T11:22:54.000Z"
    };
    const result = await service.createWorkflowRun(validPayload);

    assert.equal(result.accepted, true);
    assert.equal(result.persistence, true);
    assert.equal(result.summary.createdAt, validPayload.receivedAt);
    assert.equal(createCalls, 1);

    await assert.rejects(
      () =>
        service.createWorkflowRun({
          ...validPayload,
          receivedAt: "not-a-valid-timestamp"
        }),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === "receivedAt must be a valid ISO-8601 timestamp"
    );
    assert.equal(createCalls, 1);
  });
});

describe("RDRadarService SONiC GitHub preview", () => {
  it("returns a capped static fixture without touching Prisma delegates", () => {
    const service = new RDRadarService();
    Object.defineProperty(service, "prismaClient", {
      value: new Proxy(
        {},
        {
          get: () => {
            throw new Error("githubSonicPreview must not access Prisma");
          }
        }
      )
    });

    const result = service.githubSonicPreview();

    assert.equal(result.githubEvidenceSource.collectionMode, "read_only");
    assert.equal(result.githubEvidenceSource.persistence, false);
    assert.equal(result.githubEvidenceSource.repo, "sonic-net/sonic-buildimage");
    assert.equal(result.githubEvidenceSource.approvedRepos.length, 5);
    assert.equal(result.repositorySignals.length, 11);
    assert.ok(result.repositorySignals.length <= result.githubEvidenceSource.maxItems);
    assert.equal(new Set(result.repositorySignals.map((item) => item.repo)).size, 5);
    for (const signal of result.repositorySignals) {
      assert.ok(signal.customerSafeSummary.length > 0);
      assert.ok(signal.whyItMatters.length > 0);
      assert.ok(signal.priorityScore >= 1 && signal.priorityScore <= 5);
    }
    assert.equal(
      Object.values(result.classificationSummary.byTechnicalDomain).reduce((total, count) => total + count, 0),
      result.repositorySignals.length
    );
    assert.equal(
      Object.values(result.classificationSummary.byRiskArea).reduce((total, count) => total + count, 0),
      result.repositorySignals.length
    );
    assert.equal(result.classificationSummary.topRisks.length, 5);
    assert.equal(result.classificationSummary.topRisks[0]?.priorityScore, 5);
    assert.equal(result.draftRecommendations.length, 5);
    for (const recommendation of result.draftRecommendations) {
      assert.equal(recommendation.nextGate, "PM_REVIEW_REQUIRED");
      assert.equal(recommendation.humanApprovalRequired, true);
      assert.equal(recommendation.createdAsDraftOnly, true);
    }
  });
});

describe("RDRadarService workflow run execution identity capture", () => {
  it("persists workflowId, executionId, and correlationId when provided", async () => {
    let persistedData: Record<string, unknown> | undefined;
    const service = new RDRadarService() as RDRadarServiceTestHarness;

    service.runtimeConfig = {
      load: () => ({
        runtimeMode: "postgres_read",
        dataSource: "postgres_read",
        dbWriteMode: "rd_radar_only",
        dbMigrationsAllowed: false,
        dbSeedAllowed: false,
        externalAdaptersAllowed: false
      })
    };

    Object.defineProperty(service, "prismaClient", {
      value: {
        workflowRunSummary: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            persistedData = data;
            return data;
          }
        }
      }
    });

    const result = await service.createWorkflowRun({
      workflowStatus: "PASS",
      evidenceCount: 3,
      reviewStatus: "PASS",
      candidateId: "candidate-csf-guided-risk-assessment-001",
      nextGate: "PM_REVIEW_REQUIRED",
      runtimeVerificationRequired: true,
      forbiddenActionsObserved: false,
      source: "n8n/manual-internal",
      workflowId: "  prodTrackRdRadar0520112154  ",
      executionId: "  12345  ",
      correlationId: "  corr-prod-03-009-b-001  ",
      executedAt: "2026-06-28T14:24:38.565Z"
    });

    assert.equal(result.accepted, true);
    assert.equal(result.persistence, true);
    assert.equal(result.summary.workflowId, "prodTrackRdRadar0520112154");
    assert.equal(result.summary.executionId, "12345");
    assert.equal(result.summary.correlationId, "corr-prod-03-009-b-001");
    assert.equal(persistedData?.workflowId, "prodTrackRdRadar0520112154");
    assert.equal(persistedData?.executionId, "12345");
    assert.equal((persistedData?.sanitizedOutput as Record<string, unknown>).correlationId, "corr-prod-03-009-b-001");
  });

  it("rejects unsafe execution identifiers before persistence", async () => {
    const service = new RDRadarService();

    await assert.rejects(
      () =>
        service.createWorkflowRun({
          workflowStatus: "PASS",
          evidenceCount: 1,
          reviewStatus: "PASS",
          candidateId: "candidate-csf-guided-risk-assessment-001",
          nextGate: "PM_REVIEW_REQUIRED",
          runtimeVerificationRequired: true,
          forbiddenActionsObserved: false,
          source: "n8n/manual-internal",
          workflowId: "prodTrackRdRadar0520112154",
          executionId: "12345",
          correlationId: "unsafe correlation value",
          executedAt: "2026-06-28T14:24:38.565Z"
        }),
      /correlationId must be a safe execution identifier/
    );
  });

  it("persists explicit correlationId when n8n executionId is unavailable", async () => {
    let persistedData: Record<string, unknown> | undefined;
    const service = new RDRadarService() as RDRadarServiceTestHarness;

    service.runtimeConfig = {
      load: () => ({
        runtimeMode: "postgres_read",
        dataSource: "postgres_read",
        dbWriteMode: "rd_radar_only",
        dbMigrationsAllowed: false,
        dbSeedAllowed: false,
        externalAdaptersAllowed: false
      })
    };

    Object.defineProperty(service, "prismaClient", {
      value: {
        workflowRunSummary: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            persistedData = data;
            return data;
          }
        }
      }
    });

    const result = await service.createWorkflowRun({
      workflowStatus: "PASS",
      evidenceCount: 3,
      reviewStatus: "PASS",
      candidateId: "candidate-csf-guided-risk-assessment-001",
      nextGate: "PM_REVIEW_REQUIRED",
      runtimeVerificationRequired: true,
      forbiddenActionsObserved: false,
      source: "n8n/manual-internal",
      workflowId: "prodTrackRdRadar0520112154",
      correlationId: "corr-prod-03-009-b-002",
      executedAt: "2026-06-28T14:24:38.565Z"
    });

    assert.equal(result.summary.workflowId, "prodTrackRdRadar0520112154");
    assert.equal(result.summary.executionId, null);
    assert.equal(result.summary.correlationId, "corr-prod-03-009-b-002");
    assert.equal(persistedData?.executionId, null);
    assert.equal((persistedData?.sanitizedOutput as Record<string, unknown>).correlationId, "corr-prod-03-009-b-002");
  });
});
