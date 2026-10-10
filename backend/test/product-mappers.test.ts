import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapActivityActorType,
  mapActivityEvent,
  mapActivityStatus,
  mapActivityType,
  mapApprovalStatus,
  mapApprovalSummary,
  mapApprovalType,
  mapAuditActorType,
  mapAuditEvent,
  mapAuditRiskLevel,
  mapBlockerStatus,
  mapBlockerSummary,
  mapBlockerType,
  mapBusinessValue,
  mapCodeDraftWorkspace,
  mapEvidenceRelevance,
  mapEvidenceSource,
  mapEvidenceType,
  mapExecutionPath,
  mapExecutionPathRiskLevel,
  mapExecutionPathStatus,
  mapInfrastructureNode,
  mapInfrastructureNodeStatus,
  mapInfrastructureNodeType,
  mapInitiativeCategory,
  mapInitiativeStatus,
  mapInitiativeSummary,
  mapModuleCategory,
  mapModulePhase,
  mapModuleStatus,
  mapModuleSummary,
  mapProjectPhase,
  mapProjectPlatform,
  mapProjectStatus,
  mapProjectSummary,
  mapRDSignal,
  mapRDSignalType,
  mapReleaseApprovalChecklistStatus,
  mapReleaseArtifactStatus,
  mapReleaseArtifactType,
  mapReleaseCandidateDetail,
  mapReleaseCandidateStatus,
  mapReleaseCandidateSummary,
  mapRiskLevel,
  mapRollbackPlanStatus,
  mapSandboxedArtifactStatus,
  mapSandboxedArtifactType,
  mapSecurityCheckStatus,
  mapSecurityCheckType,
  mapSecurityFindingStatus,
  mapSecurityGateDetail,
  mapSecurityGateStatus,
  mapServiceStatus,
  mapServiceStatusStatus,
  mapSeverity,
  mapSourceType,
  mapTask,
  mapTaskLane,
  mapTaskStatus,
  mapTechnicalMemo,
  mapTechnicalMemoStatus
} from "../src/data-access/product-mappers";

describe("product-mappers strict domain mapping and validation", () => {
  describe("ActivityEvent mappings", () => {
    it("validates valid ActivityEvent types", () => {
      const validTypes = [
        "signal",
        "evidence",
        "recommendation",
        "path_selection",
        "memo",
        "task",
        "code",
        "security",
        "approval",
        "blocker",
        "release",
        "support"
      ] as const;

      for (const t of validTypes) {
        assert.equal(mapActivityType(t), t);
      }
    });

    it("throws on unknown ActivityEvent type without silent coercion", () => {
      assert.throws(() => mapActivityType("unknown_type"), /Invalid ActivityEvent type: unknown_type/);
      assert.throws(() => mapActivityType(123), /Invalid ActivityEvent type: 123/);
      assert.throws(() => mapActivityType(null), /Invalid ActivityEvent type: null/);
    });

    it("validates valid ActivityEvent actorTypes", () => {
      assert.equal(mapActivityActorType("system"), "system");
      assert.equal(mapActivityActorType("assistant"), "assistant");
      assert.equal(mapActivityActorType("user"), "user");
    });

    it("throws on unknown ActivityEvent actorType", () => {
      assert.throws(() => mapActivityActorType("robot"), /Invalid ActivityEvent actorType: robot/);
      assert.throws(() => mapActivityActorType(""), /Invalid ActivityEvent actorType:/);
    });

    it("maps complete ActivityEvent without extra unwanted properties", () => {
      const event = mapActivityEvent({
        id: "act-1",
        projectId: "proj-1",
        initiativeSlug: "init-slug",
        type: "security",
        title: "Security scan passed",
        description: "Gate validated",
        actor: "scanner",
        actorType: "system",
        status: "completed",
        sourceType: "workflow",
        createdAt: new Date("2026-05-01T12:00:00Z")
      });

      assert.equal(event.id, "act-1");
      assert.equal(event.projectId, "proj-1");
      assert.equal(event.initiativeSlug, "init-slug");
      assert.equal(event.type, "security");
      assert.equal(event.actorType, "system");
      assert.equal(event.status, "completed");
      assert.equal(event.sourceType, "workflow");
      assert.equal(event.createdAt, "2026-05-01T12:00:00.000Z");
    });
  });

  describe("AuditEvent mappings", () => {
    it("validates valid AuditEvent actorTypes", () => {
      assert.equal(mapAuditActorType("user"), "user");
      assert.equal(mapAuditActorType("assistant"), "assistant");
      assert.equal(mapAuditActorType("system"), "system");
    });

    it("throws on unknown AuditEvent actorType", () => {
      assert.throws(() => mapAuditActorType("admin"), /Invalid AuditEvent actorType: admin/);
      assert.throws(() => mapAuditActorType(null), /Invalid AuditEvent actorType: null/);
    });

    it("validates valid AuditEvent riskLevels and handles default", () => {
      assert.equal(mapAuditRiskLevel("low"), "low");
      assert.equal(mapAuditRiskLevel("medium"), "medium");
      assert.equal(mapAuditRiskLevel("high"), "high");
      assert.equal(mapAuditRiskLevel(null), "low");
      assert.equal(mapAuditRiskLevel(undefined), "low");
    });

    it("throws on invalid AuditEvent riskLevel", () => {
      assert.throws(() => mapAuditRiskLevel("extreme"), /Invalid AuditEvent riskLevel: extreme/);
    });

    it("maps complete AuditEvent conforming strictly to AuditEventDto", () => {
      const audit = mapAuditEvent({
        id: "audit-1",
        projectId: "proj-1",
        timestamp: new Date("2026-05-01T12:00:00Z"),
        action: "APPROVAL_GRANT",
        actor: "Lead PM",
        actorType: "user",
        target: "Approval gate",
        module: "Security Gate",
        details: "Approved with condition",
        riskLevel: "medium",
        sourceType: "manual"
      });

      assert.equal(audit.id, "audit-1");
      assert.equal(audit.projectId, "proj-1");
      assert.equal(audit.actorType, "user");
      assert.equal(audit.riskLevel, "medium");
      assert.equal(audit.sourceType, "manual");
      assert.equal(audit.details, "Approved with condition");
    });
  });

  describe("SecurityGate & ReleaseCandidate mappings", () => {
    it("populates securityGateId from actual relations in checks and findings", () => {
      const gate = mapSecurityGateDetail({
        id: "gate-100",
        projectId: "proj-1",
        initiativeSlug: "init-1",
        title: "Production Gate",
        status: "passed",
        riskLevel: "low",
        summary: "All checks passed",
        lastCheckedAt: new Date("2026-05-01T10:00:00Z"),
        checks: [
          {
            id: "chk-1",
            securityGateId: "gate-100",
            title: "Static Analysis",
            checkType: "policy",
            status: "passed",
            severity: "low",
            evidence: "report.json"
          }
        ],
        findings: [
          {
            id: "fnd-1",
            securityGateId: "gate-100",
            title: "Outdated Dependency",
            description: "Minor library update",
            severity: "low",
            status: "open",
            recommendation: "Update package",
            owner: "SecOps"
          }
        ]
      });

      assert.equal(gate.id, "gate-100");
      assert.equal(gate.checks[0].securityGateId, "gate-100");
      assert.equal(gate.findings[0].securityGateId, "gate-100");
      assert.equal(gate.checks[0].checkType, "policy");
      assert.equal(gate.checks[0].status, "passed");
    });

    it("maps absent rollbackPlan to null in ReleaseCandidateDetailDto", () => {
      const rc = mapReleaseCandidateDetail({
        id: "rc-1",
        projectId: "proj-1",
        version: "1.0.0-rc1",
        title: "Release 1",
        description: "Initial RC",
        status: "review",
        securityScore: 98,
        testsPassed: 40,
        testsTotal: 40,
        changeCount: 5,
        blockingIssues: 0,
        artifactCount: 2,
        createdAt: new Date("2026-05-01T12:00:00Z"),
        artifacts: [
          {
            id: "art-1",
            releaseCandidateId: "rc-1",
            artifactType: "release_note",
            fileName: "RELEASE.md",
            status: "available"
          }
        ],
        approvalChecklist: [
          {
            id: "chk-1",
            releaseCandidateId: "rc-1",
            title: "QA Signoff",
            status: "passed",
            requiredRole: "QA Lead"
          }
        ],
        rollbackPlan: null
      });

      assert.equal(rc.rollbackPlan, null);
      assert.equal(rc.artifacts.length, 1);
      assert.equal(rc.artifacts[0].releaseCandidateId, "rc-1");
      assert.equal(rc.approvalChecklist.length, 1);
      assert.equal(rc.approvalChecklist[0].releaseCandidateId, "rc-1");
    });

    it("maps present rollbackPlan with releaseCandidateId", () => {
      const rc = mapReleaseCandidateDetail({
        id: "rc-1",
        projectId: "proj-1",
        version: "1.0.0-rc1",
        title: "Release 1",
        description: "Initial RC",
        status: "approved",
        securityScore: 100,
        testsPassed: 50,
        testsTotal: 50,
        changeCount: 2,
        blockingIssues: 0,
        artifactCount: 1,
        createdAt: new Date("2026-05-01T12:00:00Z"),
        rollbackPlan: {
          id: "rb-1",
          releaseCandidateId: "rc-1",
          title: "Rollback to 0.9.0",
          summary: "Revert manifest and restore database snapshot",
          status: "draft"
        }
      });

      assert.notEqual(rc.rollbackPlan, null);
      assert.equal(rc.rollbackPlan?.id, "rb-1");
      assert.equal(rc.rollbackPlan?.releaseCandidateId, "rc-1");
      assert.equal(rc.rollbackPlan?.status, "draft");
    });
  });

  describe("Initiative & Project summary mappings", () => {
    it("maps initiative summary without moduleId property", () => {
      const init = mapInitiativeSummary({
        id: "init-1",
        projectId: "proj-1",
        slug: "evpn-validation",
        title: "EVPN Validation",
        name: "EVPN Validation",
        description: "Validation test pack",
        status: "in_progress",
        category: "validation",
        businessValue: "high",
        technicalRisk: "medium",
        recommendedPath: "governed",
        tags: ["sonic", "bgp"],
        humanApprovalRequired: true,
        createdAt: new Date("2026-05-01T12:00:00Z"),
        lastActivityAt: new Date("2026-05-02T12:00:00Z"),
        evidence: [{ id: "e1" }, { id: "e2" }],
        tasks: [{ status: "done" }, { status: "in_progress" }],
        blockers: [{ status: "open" }],
        approvals: [{ status: "pending" }]
      });

      assert.equal(init.id, "init-1");
      assert.equal(init.evidenceSources, 2);
      assert.equal(init.taskCount, 2);
      assert.equal(init.completedTaskCount, 1);
      assert.equal(init.openBlockerCount, 1);
      assert.equal(init.pendingApprovalCount, 1);
      assert.equal("moduleId" in init, false);
    });

    it("maps project summary with aggregated counts", () => {
      const proj = mapProjectSummary({
        id: "proj-1",
        slug: "sonic-program",
        name: "SONiC Program",
        customerFacingName: "SONiC Program",
        description: "Main workspace",
        status: "active",
        phase: "phase_1_activation",
        platform: "SONiC",
        createdAt: new Date("2026-04-01T00:00:00Z"),
        updatedAt: new Date("2026-05-01T00:00:00Z"),
        modules: [{ status: "enabled" }, { status: "locked" }],
        initiatives: [{ status: "recommended" }, { status: "in_progress" }],
        approvals: [{ status: "pending" }, { status: "approved" }],
        blockers: [{ status: "open" }]
      });

      assert.equal(proj.activeModulesCount, 1);
      assert.equal(proj.recommendedInitiativesCount, 1);
      assert.equal(proj.pendingApprovalsCount, 1);
      assert.equal(proj.openBlockersCount, 1);
      assert.equal(proj.status, "active");
      assert.equal(proj.phase, "phase_1_activation");
      assert.equal(proj.platform, "SONiC");
    });
  });
});
