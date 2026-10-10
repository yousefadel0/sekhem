import type {
  ActivityEventDto,
  ApprovalSummaryDto,
  AuditEventDto,
  BlockerSummaryDto,
  CodeDraftWorkspaceDto,
  EvidenceSourceDto,
  ExecutionPathDto,
  InfrastructureNodeDto,
  InitiativeDetailDto,
  InitiativeSummaryDto,
  ModuleDetailDto,
  ModuleSummaryDto,
  ProjectSummaryDto,
  RDSignalDto,
  ReleaseCandidateDetailDto,
  ReleaseCandidateSummaryDto,
  SecurityGateDetailDto,
  ServiceStatusDto,
  TaskDto,
  TechnicalMemoDto
} from "../dto";

const now = "2026-05-16T18:00:00.000Z";
const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";

export const projects: ProjectSummaryDto[] = [
  {
    id: projectId,
    slug: "community-sonic-sovereign-program",
    name: "Community SONiC Sovereign Program",
    customerFacingName: "Community SONiC Sovereign Program",
    description: "Phase 1 Activation workspace for governed open networking validation and release readiness.",
    status: "active",
    phase: "phase_1_activation",
    platform: "SONiC",
    activeModulesCount: 7,
    recommendedInitiativesCount: 2,
    pendingApprovalsCount: 2,
    openBlockersCount: 2,
    createdAt: "2026-04-20T09:00:00.000Z",
    updatedAt: now
  }
];

export const modules: ModuleDetailDto[] = [
  {
    id: "module-rd-radar",
    slug: "rd-radar",
    key: "rd_radar",
    name: "R&D Radar",
    customerFacingName: "R&D Radar",
    category: "intelligence",
    description: "Surfaces prioritized program signals and recommended initiatives.",
    phase: "phase_1_activation",
    status: "enabled",
    isLocked: false,
    route: "/demo/rd-radar",
    order: 1,
    capabilities: ["Signal review", "Opportunity scoring", "Initiative recommendation"],
    humanApprovalRequired: false,
    relatedInitiatives: [],
    relatedApprovals: [],
    relatedBlockers: [],
    relatedActivity: []
  },
  {
    id: "module-execution-path-selector",
    slug: "execution-path-selector",
    key: "execution_path_selector",
    name: "Execution Path Selector",
    customerFacingName: "Execution Path Selector",
    category: "execution",
    description: "Compares governed paths for delivery planning and approval routing.",
    phase: "phase_1_activation",
    status: "enabled",
    isLocked: false,
    route: "/demo/initiatives/evpn-bgp-validation-pack",
    order: 2,
    capabilities: ["Path comparison", "Approval gating", "Delivery scoping"],
    humanApprovalRequired: true,
    relatedInitiatives: [],
    relatedApprovals: [],
    relatedBlockers: [],
    relatedActivity: []
  },
  {
    id: "module-security-gate",
    slug: "security-gate",
    key: "security_gate",
    name: "Security Gate",
    customerFacingName: "Security Gate",
    category: "assurance",
    description: "Tracks policy, configuration, and manual review checks before release approval.",
    phase: "phase_1_activation",
    status: "enabled",
    isLocked: false,
    route: "/demo/security-gate",
    order: 3,
    capabilities: ["Risk checks", "Findings review", "Human approval handoff"],
    humanApprovalRequired: true,
    relatedInitiatives: [],
    relatedApprovals: [],
    relatedBlockers: [],
    relatedActivity: []
  },
  {
    id: "module-release-factory",
    slug: "release-factory",
    key: "release_factory",
    name: "Release Factory",
    customerFacingName: "Release Factory",
    category: "execution",
    description: "Organizes release candidates, artifacts, readiness checks, and rollback plans.",
    phase: "phase_1_activation",
    status: "enabled",
    isLocked: false,
    route: "/demo/release-factory",
    order: 4,
    capabilities: ["Candidate tracking", "Artifact checklist", "Rollback planning"],
    humanApprovalRequired: true,
    relatedInitiatives: [],
    relatedApprovals: [],
    relatedBlockers: [],
    relatedActivity: []
  },
  {
    id: "module-blocker-center",
    slug: "failure-blocker-center",
    key: "failure_blocker_center",
    name: "Failure / Blocker Center",
    customerFacingName: "Failure / Blocker Center",
    category: "support",
    description: "Central view of open delivery blockers and escalation next steps.",
    phase: "phase_1_activation",
    status: "enabled",
    isLocked: false,
    route: "/demo/failure-blocker-center",
    order: 5,
    capabilities: ["Blocker triage", "Evidence tracking", "Escalation routing"],
    humanApprovalRequired: true,
    relatedInitiatives: [],
    relatedApprovals: [],
    relatedBlockers: [],
    relatedActivity: []
  },
  {
    id: "module-repository-intelligence",
    slug: "repository-intelligence",
    key: "repository_intelligence",
    name: "Repository Intelligence",
    customerFacingName: "Repository Intelligence",
    category: "intelligence",
    description: "Advanced source-control insight preview for future activation.",
    phase: "locked_add_on",
    status: "locked",
    isLocked: true,
    lockReason: "Advanced Module activation required.",
    route: "/demo/locked-advanced-modules/repository-intelligence",
    order: 6,
    capabilities: ["Change intelligence", "Risk summaries", "Readiness insights"],
    humanApprovalRequired: true,
    relatedInitiatives: [],
    relatedApprovals: [],
    relatedBlockers: [],
    relatedActivity: []
  },
  {
    id: "module-workflow-manager",
    slug: "workflow-manager",
    key: "workflow_manager",
    name: "Workflow Manager",
    customerFacingName: "Workflow Manager",
    category: "execution",
    description: "Locked workflow orchestration preview for governed expansion.",
    phase: "locked_add_on",
    status: "locked",
    isLocked: true,
    lockReason: "Workflow runtime is outside Backend Batch 1.",
    route: "/demo/locked-advanced-modules/workflow-manager",
    order: 7,
    capabilities: ["Workflow catalog", "Run history", "Approval-aware execution"],
    humanApprovalRequired: true,
    relatedInitiatives: [],
    relatedApprovals: [],
    relatedBlockers: [],
    relatedActivity: []
  }
];

export const initiatives: InitiativeSummaryDto[] = [
  {
    id: "initiative-evpn-bgp-validation-pack",
    slug: initiativeSlug,
    projectId,
    title: "EVPN BGP Validation Pack",
    name: "EVPN BGP Validation Pack",
    description: "Create a governed validation package for EVPN BGP behavior in the Community SONiC program.",
    status: "in_progress",
    category: "validation",
    businessValue: "high",
    technicalRisk: "high",
    recommendedPath: "Human-approved validation pack with staged release candidate.",
    evidenceSources: 3,
    taskCount: 5,
    completedTaskCount: 2,
    openBlockerCount: 2,
    pendingApprovalCount: 2,
    tags: ["EVPN", "BGP", "validation", "Phase 1"],
    humanApprovalRequired: true,
    createdAt: "2026-05-01T09:00:00.000Z",
    lastActivityAt: now
  },
  {
    id: "initiative-ai-technical-memo-placeholder",
    slug: "ai-technical-memo-placeholder",
    projectId,
    title: "AI Technical Memo placeholder",
    name: "AI Technical Memo placeholder",
    description: "Placeholder memo workflow for future assisted technical analysis, kept seed-only in Batch 1.",
    status: "recommended",
    category: "governance",
    businessValue: "medium",
    technicalRisk: "medium",
    recommendedPath: "Draft memo template with manual review before any generated content is trusted.",
    evidenceSources: 1,
    taskCount: 2,
    completedTaskCount: 0,
    openBlockerCount: 0,
    pendingApprovalCount: 0,
    tags: ["memo", "governance", "placeholder"],
    humanApprovalRequired: true,
    createdAt: "2026-05-08T09:00:00.000Z",
    lastActivityAt: "2026-05-14T13:00:00.000Z"
  }
];

export const evidence: EvidenceSourceDto[] = [
  {
    id: "evidence-community-signal-1",
    initiativeSlug,
    type: "community_signal",
    title: "Community SONiC EVPN validation demand",
    source: "Community signal digest",
    relevance: "high",
    summary: "Multiple validation requests point to a need for repeatable EVPN BGP acceptance checks.",
    sourceType: "seed",
    createdAt: "2026-05-01T10:00:00.000Z"
  },
  {
    id: "evidence-roadmap-gap-1",
    initiativeSlug,
    type: "roadmap_gap",
    title: "Release readiness gap",
    source: "Program readiness review",
    relevance: "high",
    summary: "Current release artifacts need a structured validation checklist before customer signoff.",
    sourceType: "manual",
    createdAt: "2026-05-02T10:00:00.000Z"
  },
  {
    id: "evidence-manual-note-1",
    initiativeSlug,
    type: "manual_note",
    title: "Lab topology dependency",
    source: "Program team note",
    relevance: "medium",
    summary: "Validation scope depends on confirming a representative lab topology.",
    sourceType: "manual",
    createdAt: "2026-05-03T10:00:00.000Z"
  }
];

export const executionPaths: ExecutionPathDto[] = [
  {
    id: "path-validation-pack",
    initiativeSlug,
    name: "Governed validation pack",
    description: "Build a small validation pack, route it through security and release readiness gates, and keep artifacts reviewable.",
    riskLevel: "medium",
    status: "enabled",
    requiresApproval: true,
    estimatedDuration: "2 weeks",
    deliverables: ["Validation matrix", "Config templates", "Release candidate checklist"]
  },
  {
    id: "path-lab-first",
    initiativeSlug,
    name: "Lab-first hardening",
    description: "Prioritize lab blocker removal before packaging release artifacts.",
    riskLevel: "low",
    status: "enabled",
    requiresApproval: true,
    estimatedDuration: "1 week",
    deliverables: ["Topology confirmation", "Lab evidence", "Blocker disposition"]
  }
];

export const tasks: TaskDto[] = [
  {
    id: "task-radar-review",
    initiativeSlug,
    title: "Review R&D Radar signals",
    description: "Confirm the community signal set that justifies the validation pack.",
    lane: "done",
    status: "done",
    priority: "high",
    assignee: "Program Lead",
    ownerRole: "Technical Director",
    sourceType: "manual",
    createdAt: "2026-05-01T11:00:00.000Z",
    updatedAt: "2026-05-02T11:00:00.000Z"
  },
  {
    id: "task-path-selection",
    initiativeSlug,
    title: "Select execution path",
    description: "Approve the governed validation pack path.",
    lane: "approved",
    status: "review",
    priority: "critical",
    assignee: "Release Manager",
    ownerRole: "Release Manager",
    dueDate: "2026-05-20",
    sourceType: "manual",
    createdAt: "2026-05-03T11:00:00.000Z",
    updatedAt: "2026-05-16T10:00:00.000Z"
  },
  {
    id: "task-technical-memo",
    initiativeSlug,
    title: "Draft AI Technical Memo placeholder",
    description: "Prepare the memo shell for human-authored validation assumptions.",
    lane: "design",
    status: "in_progress",
    priority: "medium",
    assignee: "Architecture Review",
    ownerRole: "Technical Director",
    sourceType: "seed",
    createdAt: "2026-05-04T11:00:00.000Z",
    updatedAt: "2026-05-16T11:00:00.000Z"
  },
  {
    id: "task-security-gate",
    initiativeSlug,
    title: "Complete Security Gate evidence",
    description: "Resolve configuration review warning and attach final evidence.",
    lane: "blocked",
    status: "blocked",
    priority: "critical",
    assignee: "Security Officer",
    ownerRole: "Security Officer",
    dueDate: "2026-05-22",
    sourceType: "manual",
    createdAt: "2026-05-05T11:00:00.000Z",
    updatedAt: now
  },
  {
    id: "task-release-candidate",
    initiativeSlug,
    title: "Prepare Release Factory candidate",
    description: "Package validation reports and rollback plan as a draft candidate.",
    lane: "testing",
    status: "in_progress",
    priority: "high",
    assignee: "Release Manager",
    ownerRole: "Release Manager",
    dueDate: "2026-05-24",
    sourceType: "manual",
    createdAt: "2026-05-06T11:00:00.000Z",
    updatedAt: now
  }
];

export const activityEvents: ActivityEventDto[] = [
  {
    id: "activity-rd-signal",
    projectId,
    initiativeSlug,
    type: "signal",
    title: "R&D Radar signal promoted",
    description: "Community SONiC EVPN signal promoted into a recommended initiative.",
    actor: "System",
    actorType: "system",
    status: "completed",
    sourceType: "seed",
    createdAt: "2026-05-01T12:00:00.000Z"
  },
  {
    id: "activity-path-selected",
    projectId,
    initiativeSlug,
    type: "path_selection",
    title: "Execution path selected",
    description: "Governed validation pack path selected for review.",
    actor: "Program Lead",
    actorType: "user",
    status: "completed",
    sourceType: "manual",
    createdAt: "2026-05-04T12:00:00.000Z"
  },
  {
    id: "activity-security-blocker",
    projectId,
    initiativeSlug,
    type: "blocker",
    title: "Security Gate blocker opened",
    description: "Configuration review warning requires human disposition.",
    actor: "Security Gate",
    actorType: "system",
    status: "blocked",
    sourceType: "seed",
    createdAt: now
  }
];

export const approvals: ApprovalSummaryDto[] = [
  {
    id: "approval-security-gate",
    projectId,
    initiativeSlug,
    title: "Security Gate exception review",
    description: "Human review required before accepting the remaining configuration warning.",
    module: "Security Gate",
    priority: "critical",
    status: "pending",
    type: "security",
    requestedBy: "Security Gate",
    requestedRole: "Security Officer",
    approverRole: "Security Officer",
    requiresHumanApproval: true,
    createdAt: now,
    dueAt: "2026-05-22T17:00:00.000Z"
  },
  {
    id: "approval-release-candidate",
    projectId,
    initiativeSlug,
    title: "Release candidate readiness approval",
    description: "Release Manager approval required before publishing the validation package.",
    module: "Release Factory",
    priority: "high",
    status: "pending",
    type: "release",
    requestedBy: "Release Factory",
    requestedRole: "Release Manager",
    approverRole: "Release Manager",
    requiresHumanApproval: true,
    createdAt: "2026-05-15T15:00:00.000Z",
    dueAt: "2026-05-24T17:00:00.000Z"
  }
];

export const securityGates: SecurityGateDetailDto[] = [
  {
    id: "security-gate-evpn-bgp",
    projectId,
    initiativeSlug,
    title: "Security Gate for EVPN BGP Validation Pack",
    status: "blocked",
    riskLevel: "high",
    summary: "One configuration warning remains open before release candidate approval.",
    lastCheckedAt: now,
    checks: [
      {
        id: "check-policy",
        securityGateId: "security-gate-evpn-bgp",
        title: "Policy review",
        checkType: "policy",
        status: "passed",
        severity: "medium",
        evidence: "Policy checklist completed."
      },
      {
        id: "check-configuration",
        securityGateId: "security-gate-evpn-bgp",
        title: "Configuration review",
        checkType: "configuration",
        status: "warning",
        severity: "high",
        evidence: "Lab topology assumption requires final confirmation."
      }
    ],
    findings: [
      {
        id: "finding-topology-confirmation",
        securityGateId: "security-gate-evpn-bgp",
        title: "Lab topology confirmation required",
        description: "Validation package assumes a topology profile that has not yet been formally confirmed.",
        severity: "high",
        status: "open",
        recommendation: "Attach topology evidence or approve a documented exception.",
        owner: "Security Officer"
      }
    ]
  }
];

export const releaseCandidates: ReleaseCandidateDetailDto[] = [
  {
    id: "release-candidate-evpn-bgp-001",
    projectId,
    initiativeSlug,
    version: "0.1.0",
    title: "EVPN BGP Validation Pack Release Candidate",
    description: "Draft release candidate for the initial governed validation pack.",
    status: "security_review",
    securityScore: 82,
    testsPassed: 18,
    testsTotal: 22,
    changeCount: 7,
    blockingIssues: 1,
    artifactCount: 4,
    createdAt: "2026-05-12T09:00:00.000Z",
    artifacts: [
      {
        id: "artifact-release-note",
        releaseCandidateId: "release-candidate-evpn-bgp-001",
        artifactType: "release_note",
        fileName: "evpn-bgp-validation-release-note.md",
        status: "available"
      },
      {
        id: "artifact-validation-report",
        releaseCandidateId: "release-candidate-evpn-bgp-001",
        artifactType: "validation_report",
        fileName: "evpn-bgp-validation-report.md",
        status: "available"
      },
      {
        id: "artifact-security-report",
        releaseCandidateId: "release-candidate-evpn-bgp-001",
        artifactType: "security_report",
        fileName: "security-gate-summary.md",
        status: "blocked"
      },
      {
        id: "artifact-rollback-plan",
        releaseCandidateId: "release-candidate-evpn-bgp-001",
        artifactType: "rollback_plan",
        fileName: "rollback-plan.md",
        status: "placeholder"
      }
    ],
    approvalChecklist: [
      {
        id: "checklist-security",
        releaseCandidateId: "release-candidate-evpn-bgp-001",
        title: "Security review completed",
        status: "pending",
        requiredRole: "Security Officer"
      },
      {
        id: "checklist-release",
        releaseCandidateId: "release-candidate-evpn-bgp-001",
        title: "Release readiness approved",
        status: "pending",
        requiredRole: "Release Manager"
      }
    ],
    rollbackPlan: {
      id: "rollback-plan-evpn-bgp",
      releaseCandidateId: "release-candidate-evpn-bgp-001",
      title: "Validation pack rollback plan",
      summary: "Withdraw the draft package, preserve evidence, and return the initiative to testing.",
      status: "draft"
    }
  }
];

export const blockers: BlockerSummaryDto[] = [
  {
    id: "blocker-security-warning",
    projectId,
    initiativeSlug,
    title: "Security Gate configuration warning",
    description: "A topology assumption needs documented evidence before release approval.",
    type: "security",
    severity: "high",
    status: "pending_human",
    cause: "Lab topology evidence is incomplete.",
    owner: "Security Officer",
    evidence: "Security Gate finding `finding-topology-confirmation` remains open.",
    suggestedAction: "Attach final topology evidence or approve a documented exception.",
    nextStep: "Security Officer review",
    rollbackOption: "Return release candidate to draft.",
    maxAssistantFixAttempts: 0,
    humanReviewRequiredAfterAttempts: true,
    createdAt: "2026-05-15T12:00:00.000Z",
    updatedAt: now
  },
  {
    id: "blocker-lab-window",
    projectId,
    initiativeSlug,
    title: "Lab validation window pending",
    description: "A final validation run needs a confirmed lab window.",
    type: "lab",
    severity: "medium",
    status: "investigating",
    cause: "Shared lab capacity has not been confirmed.",
    owner: "Program Lead",
    evidence: "Release Factory checklist shows validation report available but final window unconfirmed.",
    suggestedAction: "Confirm a validation window and update the candidate evidence.",
    nextStep: "Program Lead scheduling follow-up",
    rollbackOption: "Keep candidate in security review.",
    maxAssistantFixAttempts: 0,
    humanReviewRequiredAfterAttempts: true,
    createdAt: "2026-05-14T12:00:00.000Z",
    updatedAt: now
  }
];

export const technicalMemos: TechnicalMemoDto[] = [
  {
    id: "memo-evpn-bgp-placeholder",
    initiativeSlug,
    generatedAt: "2026-05-16T09:00:00.000Z",
    generatedBy: "AI Technical Memo placeholder",
    status: "draft",
    sections: [
      {
        title: "Scope",
        content: "Placeholder memo section for human-authored EVPN BGP validation assumptions."
      },
      {
        title: "Risk Notes",
        content: "Security Gate evidence and lab topology confirmation remain the primary review items."
      }
    ]
  }
];

export const codeDraftWorkspaces: CodeDraftWorkspaceDto[] = [
  {
    id: "workspace-evpn-bgp-validation",
    initiativeSlug,
    name: "EVPN BGP Validation Pack Workspace",
    status: "pending_review",
    badges: ["Human review required", "Seed-backed draft", "No deployment"],
    humanApprovalRequired: true,
    artifacts: [
      {
        id: "sandbox-artifact-topology",
        workspaceId: "workspace-evpn-bgp-validation",
        fileName: "reference-topology.md",
        artifactType: "reference_topology",
        status: "ready_for_review"
      },
      {
        id: "sandbox-artifact-tests",
        workspaceId: "workspace-evpn-bgp-validation",
        fileName: "validation-test-cases.md",
        artifactType: "test_cases",
        status: "draft"
      }
    ]
  }
];

export const rdSignals: RDSignalDto[] = [
  {
    id: "rd-signal-evpn-bgp",
    title: "Community SONiC EVPN validation signal",
    type: "community",
    source: "R&D Radar",
    priority: "high",
    summary: "Community signals indicate repeatable EVPN BGP validation would reduce release uncertainty.",
    impact: "Improves confidence for Phase 1 Activation release readiness.",
    actionRecommended: "Promote EVPN BGP Validation Pack for human-reviewed execution.",
    processed: true,
    tags: ["SONiC", "EVPN", "BGP"],
    createdAt: "2026-05-01T08:00:00.000Z"
  }
];

export const infrastructure: InfrastructureNodeDto[] = [
  {
    id: "infra-api",
    name: "Product API",
    type: "api",
    status: "healthy",
    region: "Program workspace",
    uptime: 99.9,
    cpu: 21,
    memory: 38,
    disk: 44
  },
  {
    id: "infra-data-store",
    name: "Data Store",
    type: "database",
    status: "warning",
    region: "Program workspace",
    uptime: 99.1,
    cpu: 34,
    memory: 61,
    disk: 57
  }
];

export const services: ServiceStatusDto[] = [
  {
    id: "service-api",
    nodeId: "infra-api",
    name: "Read API",
    status: "operational",
    latencyMs: 42,
    lastCheckedAt: now
  },
  {
    id: "service-validation",
    nodeId: "infra-data-store",
    name: "Validation Evidence",
    status: "degraded",
    latencyMs: 118,
    lastCheckedAt: now
  }
];

export const auditEvents: AuditEventDto[] = [
  {
    id: "audit-path-selected",
    projectId,
    timestamp: "2026-05-04T12:00:00.000Z",
    action: "Execution path selected",
    actor: "Program Lead",
    actorType: "user",
    target: "EVPN BGP Validation Pack",
    module: "Execution Path Selector",
    details: "Governed validation pack selected for human-approved execution.",
    riskLevel: "medium",
    sourceType: "manual"
  },
  {
    id: "audit-security-review",
    projectId,
    timestamp: now,
    action: "Security Gate review requested",
    actor: "Security Gate",
    actorType: "system",
    target: "Security Gate for EVPN BGP Validation Pack",
    module: "Security Gate",
    details: "Configuration warning routed for human approval.",
    riskLevel: "high",
    sourceType: "seed"
  }
];

export function buildInitiativeDetail(summary: InitiativeSummaryDto): InitiativeDetailDto {
  const securityGate = securityGates.find((gate) => gate.initiativeSlug === summary.slug) ?? null;
  const releaseCandidate = releaseCandidates.find((candidate) => candidate.initiativeSlug === summary.slug) ?? null;

  return {
    ...summary,
    overview: {
      summary: summary.description,
      businessCase: "Reduce uncertainty in the Community SONiC Sovereign Program through reviewable validation evidence.",
      technicalScope: "Seed-backed Batch 1 scope covers DTOs, read-only REST responses, and placeholder artifacts only.",
      targetOutcome: "A human-approved validation pack ready for release candidate review."
    },
    evidence: evidence.filter((item) => item.initiativeSlug === summary.slug),
    executionPaths: executionPaths.filter((path) => path.initiativeSlug === summary.slug),
    tasks: tasks.filter((task) => task.initiativeSlug === summary.slug),
    activity: activityEvents.filter((event) => event.initiativeSlug === summary.slug),
    blockers: blockers.filter((blocker) => blocker.initiativeSlug === summary.slug),
    technicalMemo: technicalMemos.find((memo) => memo.initiativeSlug === summary.slug) ?? null,
    codeDraftWorkspace: codeDraftWorkspaces.find((workspace) => workspace.initiativeSlug === summary.slug) ?? null,
    securityGate,
    releaseCandidate
  };
}

export function releaseSummaries(): ReleaseCandidateSummaryDto[] {
  return releaseCandidates.map((candidate) => ({
    id: candidate.id,
    projectId: candidate.projectId,
    initiativeSlug: candidate.initiativeSlug,
    version: candidate.version,
    title: candidate.title,
    description: candidate.description,
    status: candidate.status,
    securityScore: candidate.securityScore,
    testsPassed: candidate.testsPassed,
    testsTotal: candidate.testsTotal,
    changeCount: candidate.changeCount,
    blockingIssues: candidate.blockingIssues,
    artifactCount: candidate.artifactCount,
    createdAt: candidate.createdAt
  }));
}

export function moduleSummaries(): ModuleSummaryDto[] {
  return modules.map((module) => ({
    id: module.id,
    slug: module.slug,
    key: module.key,
    name: module.name,
    customerFacingName: module.customerFacingName,
    category: module.category,
    description: module.description,
    phase: module.phase,
    status: module.status,
    isLocked: module.isLocked,
    lockReason: module.lockReason,
    route: module.route,
    order: module.order
  }));
}
