import type {
  RDRadarCandidateDto,
  RDRadarEvidenceItemDto,
  RDRadarGithubSonicPreviewResponseDto,
  RDRadarGithubStatusDto,
  RDRadarPMDecisionDto,
  RDRadarReviewSummaryDto,
  RDRadarWorkflowRunSummaryDto
} from "./rd-radar.dto";

const fixtureTimestamp = "2026-05-20T00:00:00.000Z";

export const rdRadarEvidenceFixtures: RDRadarEvidenceItemDto[] = [
  {
    id: "evidence-nist-csf-main-001",
    sourceId: "source-nist-csf-main-001",
    title: "NIST Cybersecurity Framework",
    sourceUrl: "https://www.nist.gov/cyberframework",
    sourceType: "official_standard",
    sanitizedFinding: "The framework provides a structured way to describe, assess, and improve cybersecurity risk management practices.",
    collectionStatus: "EVIDENCE_COLLECTED",
    reviewerDecision: "accept_as_relevant",
    scores: { relevance: 5, reliability: 5, freshness: 4, businessApplicability: 4 },
    collectedAt: fixtureTimestamp
  },
  {
    id: "evidence-nist-csf-quick-start-001",
    sourceId: "source-nist-csf-quick-start-001",
    title: "NIST CSF Quick Start Guides",
    sourceUrl: "https://www.nist.gov/cyberframework/quick-start-guides",
    sourceType: "official_guidance",
    sanitizedFinding: "Quick-start guidance helps translate the framework into practical adoption steps for organizations starting cybersecurity risk work.",
    collectionStatus: "EVIDENCE_COLLECTED",
    reviewerDecision: "accept_as_relevant",
    scores: { relevance: 4, reliability: 5, freshness: 4, businessApplicability: 5 },
    collectedAt: fixtureTimestamp
  },
  {
    id: "evidence-nist-csf-profiles-001",
    sourceId: "source-nist-csf-profiles-001",
    title: "NIST CSF Profiles",
    sourceUrl: "https://www.nist.gov/cyberframework/profiles",
    sourceType: "official_profile_guidance",
    sanitizedFinding: "Profiles can help map current and target cybersecurity outcomes, supporting a gap-based assessment path.",
    collectionStatus: "EVIDENCE_COLLECTED",
    reviewerDecision: "needs_more_sources",
    scores: { relevance: 4, reliability: 5, freshness: 4, businessApplicability: 4 },
    collectedAt: fixtureTimestamp
  }
];

export const rdRadarReviewSummaryFixture: RDRadarReviewSummaryDto = {
  averageScores: { relevance: 4.33, reliability: 5, freshness: 4, businessApplicability: 4.33 },
  overallDecision: "PASS_WITH_PM_REVIEW_REQUIRED",
  evidenceWasSanitized: true,
  rawPageContentIncluded: false,
  aiGeneratedConclusion: false
};

export const rdRadarCandidateFixtures: RDRadarCandidateDto[] = [
  {
    candidateId: "candidate-csf-guided-risk-assessment-001",
    title: "Draft Candidate: CSF-Guided Cybersecurity Risk Assessment Path",
    status: "DRAFT_ONLY",
    problemStatement: "Customers need a clear, evidence-backed path to evaluate cybersecurity risk posture without turning early research signals into uncontrolled production actions.",
    evidenceSummary: "Three official NIST sources support a controlled cybersecurity risk assessment path based on the Cybersecurity Framework, quick-start guidance, and profile-based gap analysis.",
    expectedBusinessValue: "A customer-facing assessment path can turn R&D evidence into a structured consulting or platform workflow while keeping PM approval and runtime verification gates intact.",
    uncertaintyRisks: [
      "Domain expert review is still required before market-facing claims.",
      "Runtime verification is required before promotion beyond draft candidate state."
    ],
    requiredAdditionalEvidence: [
      "Additional authoritative examples explaining CSF Profiles in practical implementation contexts.",
      "Cybersecurity domain expert interpretation."
    ],
    nextGate: "PM_REVIEW_REQUIRED",
    requiresPMApproval: true,
    runtimeVerificationRequired: true,
    createdAsDraftOnly: true,
    createdAt: fixtureTimestamp
  }
];

export const rdRadarPMDecisionFixtures: RDRadarPMDecisionDto[] = [
  {
    id: "pm-decision-csf-guided-risk-assessment-001",
    candidateId: "candidate-csf-guided-risk-assessment-001",
    decision: "more_evidence_required",
    decisionReason: "Runtime verification and PM review are required before promotion.",
    approvedScopeIfAny: null,
    nextGate: "PM_REVIEW_REQUIRED",
    runtimeVerificationRequired: true,
    createdAt: fixtureTimestamp
  }
];

export const rdRadarWorkflowRunFixtures: RDRadarWorkflowRunSummaryDto[] = [
  {
    id: "workflow-summary-rd-radar-preview-001",
    workflowName: "SEKHEM R&D Radar Manual Internal Preview",
    workflowId: "manual-internal-rd-radar-preview",
    executionId: null,
    workflowStatus: "PASS",
    evidenceCount: 3,
    reviewStatus: "PASS",
    candidateId: "candidate-csf-guided-risk-assessment-001",
    nextGate: "PM_REVIEW_REQUIRED",
    runtimeVerificationRequired: true,
    forbiddenActionsObserved: false,
    workflowActive: false,
    triggerType: "manual/internal only",
    createdAt: fixtureTimestamp
  }
];

export const rdRadarGithubStatusFixture: RDRadarGithubStatusDto = {
  status: "pending",
  mode: "read_only",
  repository: {
    configured: true,
    readOnly: true
  },
  checks: [
    {
      name: "Repository access",
      status: "pending",
      message: "Repository readiness is pending."
    },
    {
      name: "Read-only protection",
      status: "ready",
      message: "This view is read-only and does not make source-control changes."
    }
  ],
  lastCheckedAt: fixtureTimestamp
};

export const rdRadarGithubSonicPreviewFixture: Omit<RDRadarGithubSonicPreviewResponseDto, "classificationSummary"> = {
  githubEvidenceSource: {
    sourceSystem: "github",
    collectionMode: "read_only",
    repo: "sonic-net/sonic-buildimage",
    repoUrl: "https://github.com/sonic-net/sonic-buildimage",
    approvedRepos: [
      {
        repo: "sonic-net/sonic-buildimage",
        repoUrl: "https://github.com/sonic-net/sonic-buildimage",
        riskArea: "SONiC build"
      },
      {
        repo: "sonic-net/sonic-swss",
        repoUrl: "https://github.com/sonic-net/sonic-swss",
        riskArea: "SWSS/orchagent"
      },
      {
        repo: "sonic-net/sonic-sairedis",
        repoUrl: "https://github.com/sonic-net/sonic-sairedis",
        riskArea: "SAI/syncd"
      },
      {
        repo: "sonic-net/sonic-mgmt",
        repoUrl: "https://github.com/sonic-net/sonic-mgmt",
        riskArea: "management/test"
      },
      {
        repo: "sonic-net/sonic-platform-common",
        repoUrl: "https://github.com/sonic-net/sonic-platform-common",
        riskArea: "platform drivers"
      }
    ],
    signalType: "PR",
    maxItems: 25,
    persistence: false
  },
  repositorySignals: [
    {
      id: "github-sonic-buildimage-pr-27448",
      repo: "sonic-net/sonic-buildimage",
      title: "marvell-teralynx: pin ptf_nn_agent.py to use nnpy",
      url: "https://github.com/sonic-net/sonic-buildimage/pull/27448",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Public SONiC build PR indicates temporary dependency pinning for Marvell Teralynx syncd RPC until migration to pynng is completed.",
      technicalDomain: "build_image",
      riskArea: "build_stability",
      priorityScore: 4,
      evidenceStrength: "moderate",
      customerSafeSummary: "A build dependency is temporarily pinned for a platform-specific component while a planned migration is completed.",
      whyItMatters: "Temporary dependency pins can affect build repeatability and should be reviewed before selecting hardware support scope."
    },
    {
      id: "github-sonic-buildimage-pr-27602",
      repo: "sonic-net/sonic-buildimage",
      title: "Added bootconf variable to Nexthop installer.conf",
      url: "https://github.com/sonic-net/sonic-buildimage/pull/27602",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Public SONiC build PR indicates a platform installation configuration adjustment for Nexthop hardware support review.",
      technicalDomain: "platform_abstraction",
      riskArea: "configuration_drift",
      priorityScore: 4,
      evidenceStrength: "high",
      customerSafeSummary: "A platform installation setting is being adjusted for a hardware-specific configuration path.",
      whyItMatters: "Configuration differences can create deployment drift across target platforms and warrant compatibility review."
    },
    {
      id: "github-sonic-buildimage-pr-26809",
      repo: "sonic-net/sonic-buildimage",
      title: "[system-health] Fix 90s stop timeout during cold reboot",
      url: "https://github.com/sonic-net/sonic-buildimage/pull/26809",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Public SONiC build PR indicates a cold-reboot timeout correction that may warrant system-health and management test review.",
      technicalDomain: "reliability",
      riskArea: "reboot_health",
      priorityScore: 5,
      evidenceStrength: "high",
      customerSafeSummary: "A cold-reboot timeout correction highlights a system-health reliability path for review.",
      whyItMatters: "Reboot behavior directly affects recovery expectations and operational resilience."
    },
    {
      id: "github-sonic-swss-preview-orchagent-risk",
      repo: "sonic-net/sonic-swss",
      title: "SWSS orchagent change preview signal",
      url: "https://github.com/sonic-net/sonic-swss",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights an orchagent change area for control-plane impact review.",
      technicalDomain: "swss_orchagent",
      riskArea: "control_plane_behavior",
      priorityScore: 5,
      evidenceStrength: "moderate",
      customerSafeSummary: "An orchestration-agent change area is flagged for control-plane impact review.",
      whyItMatters: "Control-plane orchestration changes can affect how network state is applied and maintained."
    },
    {
      id: "github-sonic-swss-preview-control-plane-risk",
      repo: "sonic-net/sonic-swss",
      title: "Control-plane state handling preview signal",
      url: "https://github.com/sonic-net/sonic-swss",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights control-plane state handling for SWSS compatibility review.",
      technicalDomain: "swss_orchagent",
      riskArea: "control_plane_behavior",
      priorityScore: 4,
      evidenceStrength: "moderate",
      customerSafeSummary: "Control-plane state handling is flagged for compatibility review.",
      whyItMatters: "State-handling differences can introduce inconsistent behavior during configuration changes."
    },
    {
      id: "github-sonic-sairedis-preview-syncd-risk",
      repo: "sonic-net/sonic-sairedis",
      title: "SAI Redis syncd boundary preview signal",
      url: "https://github.com/sonic-net/sonic-sairedis",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights the SAI Redis and syncd boundary for adapter validation.",
      technicalDomain: "sai_syncd",
      riskArea: "sai_adapter_dependency",
      priorityScore: 5,
      evidenceStrength: "moderate",
      customerSafeSummary: "The adapter boundary between SAI Redis and syncd is flagged for validation.",
      whyItMatters: "Adapter-boundary changes can affect hardware integration behavior and should be validated against target platforms."
    },
    {
      id: "github-sonic-sairedis-preview-sai-api-risk",
      repo: "sonic-net/sonic-sairedis",
      title: "SAI API adapter behavior preview signal",
      url: "https://github.com/sonic-net/sonic-sairedis",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights SAI API adapter behavior for compatibility review.",
      technicalDomain: "sai_syncd",
      riskArea: "sai_adapter_dependency",
      priorityScore: 4,
      evidenceStrength: "moderate",
      customerSafeSummary: "SAI API adapter behavior is flagged for compatibility review.",
      whyItMatters: "Adapter behavior can influence hardware-specific integration outcomes."
    },
    {
      id: "github-sonic-mgmt-preview-test-coverage-risk",
      repo: "sonic-net/sonic-mgmt",
      title: "SONiC management test coverage preview signal",
      url: "https://github.com/sonic-net/sonic-mgmt",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights management test coverage for target validation planning.",
      technicalDomain: "management_testing",
      riskArea: "validation_coverage",
      priorityScore: 4,
      evidenceStrength: "high",
      customerSafeSummary: "Management test coverage is flagged for target validation planning.",
      whyItMatters: "Clear validation coverage helps identify whether customer-relevant scenarios are represented before planning further work."
    },
    {
      id: "github-sonic-mgmt-preview-regression-risk",
      repo: "sonic-net/sonic-mgmt",
      title: "SONiC regression validation preview signal",
      url: "https://github.com/sonic-net/sonic-mgmt",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights regression validation scope for management and test review.",
      technicalDomain: "management_testing",
      riskArea: "validation_coverage",
      priorityScore: 4,
      evidenceStrength: "moderate",
      customerSafeSummary: "Regression validation scope is flagged for management and test review.",
      whyItMatters: "Regression coverage helps reduce the risk of introducing behavior changes while platform support evolves."
    },
    {
      id: "github-sonic-platform-common-preview-platform-api-risk",
      repo: "sonic-net/sonic-platform-common",
      title: "Platform common API compatibility preview signal",
      url: "https://github.com/sonic-net/sonic-platform-common",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights platform common API compatibility for hardware support review.",
      technicalDomain: "platform_abstraction",
      riskArea: "platform_driver_assumption",
      priorityScore: 5,
      evidenceStrength: "moderate",
      customerSafeSummary: "Platform API compatibility is flagged for hardware support review.",
      whyItMatters: "Platform API assumptions can affect portability across hardware targets."
    },
    {
      id: "github-sonic-platform-common-preview-hardware-abstraction-risk",
      repo: "sonic-net/sonic-platform-common",
      title: "Hardware abstraction behavior preview signal",
      url: "https://github.com/sonic-net/sonic-platform-common",
      authorLogin: "public-github-author",
      createdAt: null,
      updatedAt: null,
      labels: [],
      sanitizedSummary: "Sanitized repository preview signal highlights hardware abstraction behavior for platform driver compatibility review.",
      technicalDomain: "platform_abstraction",
      riskArea: "platform_driver_assumption",
      priorityScore: 4,
      evidenceStrength: "moderate",
      customerSafeSummary: "Hardware abstraction behavior is flagged for platform-driver compatibility review.",
      whyItMatters: "Hardware abstraction differences can influence the effort required to support target platforms consistently."
    }
  ],
  draftRecommendations: [
    {
      candidateId: "candidate-sonic-buildimage-marvell-teralynx-dependency-risk",
      title: "Draft Candidate: Review SONiC build dependency stability for platform-specific syncd containers",
      evidenceSource: "https://github.com/sonic-net/sonic-buildimage/pull/27448",
      recommendedPath: "Review dependency pinning impact, check related issue/PR references, and decide whether it affects the target hardware support plan.",
      nextGate: "PM_REVIEW_REQUIRED",
      humanApprovalRequired: true,
      createdAsDraftOnly: true
    },
    {
      candidateId: "candidate-sonic-swss-orchagent-control-plane-risk",
      title: "Draft Candidate: Review SWSS orchagent control-plane risk",
      evidenceSource: "https://github.com/sonic-net/sonic-swss",
      recommendedPath: "Review orchagent and control-plane state handling preview signals before selecting any compatibility work.",
      nextGate: "PM_REVIEW_REQUIRED",
      humanApprovalRequired: true,
      createdAsDraftOnly: true
    },
    {
      candidateId: "candidate-sonic-sairedis-syncd-boundary-validation",
      title: "Draft Candidate: Validate SAI and syncd boundary behavior",
      evidenceSource: "https://github.com/sonic-net/sonic-sairedis",
      recommendedPath: "Review SAI adapter and syncd boundary preview signals before defining a validation plan.",
      nextGate: "PM_REVIEW_REQUIRED",
      humanApprovalRequired: true,
      createdAsDraftOnly: true
    },
    {
      candidateId: "candidate-sonic-mgmt-test-coverage-review",
      title: "Draft Candidate: Review SONiC management test coverage",
      evidenceSource: "https://github.com/sonic-net/sonic-mgmt",
      recommendedPath: "Review management and regression test preview signals before selecting customer-relevant validation scope.",
      nextGate: "PM_REVIEW_REQUIRED",
      humanApprovalRequired: true,
      createdAsDraftOnly: true
    },
    {
      candidateId: "candidate-sonic-platform-common-compatibility-review",
      title: "Draft Candidate: Review platform abstraction compatibility",
      evidenceSource: "https://github.com/sonic-net/sonic-platform-common",
      recommendedPath: "Review platform common API and hardware abstraction preview signals before selecting hardware support work.",
      nextGate: "PM_REVIEW_REQUIRED",
      humanApprovalRequired: true,
      createdAsDraftOnly: true
    }
  ]
};
