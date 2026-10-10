export interface Module {
  id: number
  name: string
  description: string
  category: string
  categoryLabel: string
  previewKPI: string
  previewValue: string
  statusBadge: string
  valueBadge: string
  capabilities: string[]
  strategicValue: string
  businessProblem: string
  exampleOutputs: string[]
  relatedModules: string[]
  phase: "phase1" | "future"
  humanApproval: string[]
}

export const modules: Module[] = [
  // A. Core Command Layer
  {
    id: 1,
    name: "Command Center",
    description: "Unified executive control dashboard for projects, modules, approvals, and platform status.",
    category: "core",
    categoryLabel: "Core Command Layer",
    previewKPI: "Pending Approvals",
    previewValue: "7",
    statusBadge: "Phase 1 Ready",
    valueBadge: "Executive Visibility",
    capabilities: [
      "Real-time project status monitoring",
      "Cross-module approval workflows",
      "Executive dashboard views",
      "Strategic KPI tracking",
      "Alert management and escalation"
    ],
    strategicValue: "Provides executive leadership with a single pane of glass for the entire platform, enabling rapid decision-making and governance oversight.",
    businessProblem: "Fragmented visibility across engineering operations prevents timely executive decision-making and increases governance risk.",
    exampleOutputs: [
      "Executive status report",
      "Approval queue summary",
      "Project health dashboard",
      "Risk alert notifications"
    ],
    relatedModules: ["AI Assistant War Room", "Audit & Approval Hub", "Infrastructure Health"],
    phase: "phase1",
    humanApproval: ["Final release approval", "Budget threshold changes", "Policy exceptions"]
  },
  {
    id: 2,
    name: "AI Assistant War Room",
    description: "Central orchestration view of all AI specialist agents and their current activities.",
    category: "core",
    categoryLabel: "Core Command Layer",
    previewKPI: "Agents Online",
    previewValue: "6",
    statusBadge: "Active",
    valueBadge: "High Strategic Value",
    capabilities: [
      "AI assistant status monitoring",
      "Task assignment and orchestration",
      "Agent performance metrics",
      "Workload balancing",
      "Agent communication logs"
    ],
    strategicValue: "Enables real-time visibility and control over AI-powered automation, ensuring sovereign oversight of all automated engineering activities.",
    businessProblem: "Lack of centralized control over AI technical assistants creates operational blind spots and compliance concerns.",
    exampleOutputs: [
      "Agent activity timeline",
      "Task completion metrics",
      "Agent health status",
      "Automation audit trail"
    ],
    relatedModules: ["Command Center", "AI CTO Office", "Workflow Manager"],
    phase: "phase1",
    humanApproval: ["Agent activation/deactivation", "Critical task assignments", "Agent policy changes"]
  },
  {
    id: 3,
    name: "AI CTO Office",
    description: "Requirement analysis, technical memo generation, and engineering planning support.",
    category: "core",
    categoryLabel: "Core Command Layer",
    previewKPI: "Technical Memos",
    previewValue: "12",
    statusBadge: "Phase 1 Ready",
    valueBadge: "R&D Critical",
    capabilities: [
      "Requirements analysis automation",
      "Technical memo generation",
      "Architecture recommendation",
      "Engineering planning support",
      "Technology assessment"
    ],
    strategicValue: "Augments technical leadership with AI-powered analysis and documentation, accelerating engineering decision-making while maintaining human oversight.",
    businessProblem: "Technical leadership bottleneck delays engineering decisions and reduces documentation quality under time pressure.",
    exampleOutputs: [
      "Technical requirements document",
      "Architecture decision record",
      "Technology comparison matrix",
      "Engineering roadmap draft"
    ],
    relatedModules: ["R&D Radar", "Repo Intelligence", "Knowledge Base"],
    phase: "phase1",
    humanApproval: ["Architecture decisions", "Technology selection", "Roadmap commitments"]
  },
  // B. Intelligence & Knowledge Layer
  {
    id: 4,
    name: "R&D Radar",
    description: "Tracks technology trends, community signals, competitor moves, and roadmap opportunities.",
    category: "intelligence",
    categoryLabel: "Intelligence & Knowledge Layer",
    previewKPI: "Active Signals",
    previewValue: "18",
    statusBadge: "Phase 1 Ready",
    valueBadge: "R&D Critical",
    capabilities: [
      "Technology trend monitoring",
      "Community signal aggregation",
      "Competitor intelligence tracking",
      "Roadmap opportunity identification",
      "Strategic alert generation"
    ],
    strategicValue: "Delivers early warning on technology shifts and competitive moves, enabling proactive strategic positioning in the open infrastructure ecosystem.",
    businessProblem: "Manual tracking of upstream communities and competitors creates blind spots and delayed response to market changes.",
    exampleOutputs: [
      "Trend analysis report",
      "Idea backlog recommendations",
      "Roadmap opportunity brief",
      "Competitive landscape summary"
    ],
    relatedModules: ["AI CTO Office", "Knowledge Base", "Command Center"],
    phase: "phase1",
    humanApproval: ["Roadmap inclusion decisions", "Strategic priority changes", "External communication"]
  },
  {
    id: 5,
    name: "Knowledge Base",
    description: "Searchable evidence repository for documents, reports, decisions, and engineering knowledge.",
    category: "intelligence",
    categoryLabel: "Intelligence & Knowledge Layer",
    previewKPI: "Indexed Documents",
    previewValue: "1,240",
    statusBadge: "Active",
    valueBadge: "Governance Critical",
    capabilities: [
      "Semantic document search",
      "Evidence chain tracking",
      "Decision history retrieval",
      "Knowledge graph navigation",
      "Cross-reference discovery"
    ],
    strategicValue: "Creates institutional memory for engineering decisions, enabling knowledge preservation and reducing dependency on individual expertise.",
    businessProblem: "Critical engineering knowledge locked in individual expertise creates organizational risk and slows onboarding.",
    exampleOutputs: [
      "Search result summaries",
      "Evidence chain documentation",
      "Decision audit trails",
      "Knowledge graph visualizations"
    ],
    relatedModules: ["R&D Radar", "Audit & Approval Hub", "AI CTO Office"],
    phase: "phase1",
    humanApproval: ["Document classification", "Access control changes", "Knowledge curation"]
  },
  {
    id: 6,
    name: "Repo Intelligence",
    description: "Repository analysis, merge request risk scoring, impact analysis, and suggested tests.",
    category: "intelligence",
    categoryLabel: "Intelligence & Knowledge Layer",
    previewKPI: "High-Risk Findings",
    previewValue: "4",
    statusBadge: "Phase 1 Ready",
    valueBadge: "Risk Control",
    capabilities: [
      "Merge request risk assessment",
      "Code impact analysis",
      "Test coverage recommendations",
      "Dependency vulnerability scanning",
      "Code quality metrics"
    ],
    strategicValue: "Reduces engineering risk by providing AI-powered analysis of code changes, ensuring quality and security before changes enter production.",
    businessProblem: "Manual code review cannot scale with increasing commit velocity, leading to quality gaps and missed vulnerabilities.",
    exampleOutputs: [
      "MR risk assessment summary",
      "Impact analysis report",
      "Suggested test cases",
      "Vulnerability scan results"
    ],
    relatedModules: ["AI CTO Office", "Security Gate", "Release Factory"],
    phase: "phase1",
    humanApproval: ["High-risk merge approvals", "Security exception handling", "Test coverage waivers"]
  },
  // C. Execution & Automation Layer
  {
    id: 7,
    name: "Workflow Manager",
    description: "Controlled workflow automation for engineering, approvals, and operational processes.",
    category: "execution",
    categoryLabel: "Execution & Automation Layer",
    previewKPI: "Active Workflows",
    previewValue: "23",
    statusBadge: "Active",
    valueBadge: "Operational Efficiency",
    capabilities: [
      "Visual workflow designer",
      "Approval chain automation",
      "Conditional workflow branching",
      "Integration orchestration",
      "Workflow execution monitoring"
    ],
    strategicValue: "Standardizes and automates engineering processes while maintaining human control points, ensuring consistent governance across operations.",
    businessProblem: "Inconsistent manual processes create compliance gaps and operational inefficiencies across engineering teams.",
    exampleOutputs: [
      "Workflow execution log",
      "Approval status updates",
      "Process completion reports",
      "Automation metrics dashboard"
    ],
    relatedModules: ["Command Center", "Audit & Approval Hub", "AI Assistant War Room"],
    phase: "phase1",
    humanApproval: ["Workflow activation", "Critical path changes", "Exception handling"]
  },
  {
    id: 8,
    name: "AI Patch Assistant",
    description: "Supports code-change recommendations, patch suggestions, and controlled engineering handoff.",
    category: "execution",
    categoryLabel: "Execution & Automation Layer",
    previewKPI: "Suggested Patches",
    previewValue: "9",
    statusBadge: "Future Expansion",
    valueBadge: "High Strategic Value",
    capabilities: [
      "AI-powered patch recommendations",
      "Code change suggestions",
      "Controlled engineering handoff",
      "Patch impact preview",
      "Human-in-the-loop approval"
    ],
    strategicValue: "Accelerates engineering velocity by providing AI-assisted code recommendations while maintaining full human control over all changes.",
    businessProblem: "Repetitive code changes consume senior engineering time that could be spent on strategic development work.",
    exampleOutputs: [
      "Patch recommendation report",
      "Code change diff preview",
      "Engineering handoff package",
      "Impact assessment summary"
    ],
    relatedModules: ["Repo Intelligence", "Release Factory", "Security Gate"],
    phase: "future",
    humanApproval: ["All code changes", "Patch deployment", "Handoff acceptance"]
  },
  {
    id: 9,
    name: "Release Factory",
    description: "Governed release candidate creation, release package generation, and acceptance tracking.",
    category: "execution",
    categoryLabel: "Execution & Automation Layer",
    previewKPI: "Release Candidates",
    previewValue: "2",
    statusBadge: "Phase 1 Ready",
    valueBadge: "Governance Critical",
    capabilities: [
      "Release candidate management",
      "Package generation automation",
      "Acceptance workflow tracking",
      "Release notes generation",
      "Deployment readiness checks"
    ],
    strategicValue: "Ensures sovereign control over software releases with full traceability and governance, critical for regulated infrastructure deployments.",
    businessProblem: "Manual release processes create inconsistency, delay time-to-market, and increase compliance documentation burden.",
    exampleOutputs: [
      "Release candidate package",
      "Release approval chain status",
      "Deployment readiness report",
      "Release notes document"
    ],
    relatedModules: ["Security Gate", "Repo Intelligence", "Audit & Approval Hub"],
    phase: "phase1",
    humanApproval: ["Release approval", "Deployment authorization", "Rollback decisions"]
  },
  // D. Assurance & Governance Layer
  {
    id: 10,
    name: "Security Gate",
    description: "Security review, AI usage policy control, release blocking conditions, and exception workflows.",
    category: "assurance",
    categoryLabel: "Assurance & Governance Layer",
    previewKPI: "Blocked Releases",
    previewValue: "1",
    statusBadge: "Phase 1 Ready",
    valueBadge: "Risk Control",
    capabilities: [
      "Security policy enforcement",
      "AI usage governance",
      "Release blocking rules",
      "Exception request workflow",
      "Compliance validation"
    ],
    strategicValue: "Provides critical security and compliance controls, ensuring all releases meet organizational and regulatory requirements before deployment.",
    businessProblem: "Security review bottleneck delays releases while manual checks miss policy violations and create audit gaps.",
    exampleOutputs: [
      "Security review summary",
      "Policy violation alerts",
      "Exception request status",
      "Compliance audit report"
    ],
    relatedModules: ["Release Factory", "Audit & Approval Hub", "Repo Intelligence"],
    phase: "phase1",
    humanApproval: ["Security exceptions", "Policy overrides", "Compliance sign-off"]
  },
  {
    id: 11,
    name: "Audit & Approval Hub",
    description: "Approval workflows, traceability, decision logging, and audit evidence.",
    category: "assurance",
    categoryLabel: "Assurance & Governance Layer",
    previewKPI: "Events This Month",
    previewValue: "146",
    statusBadge: "Active",
    valueBadge: "Governance Critical",
    capabilities: [
      "Multi-level approval workflows",
      "Decision audit logging",
      "Evidence chain management",
      "Compliance reporting",
      "Approval delegation"
    ],
    strategicValue: "Creates complete audit trails for all platform decisions, essential for governance compliance and regulatory requirements.",
    businessProblem: "Scattered approval records and missing audit trails create compliance risk and slow regulatory responses.",
    exampleOutputs: [
      "Approval trail report",
      "Decision audit log",
      "Compliance evidence package",
      "Approval metrics dashboard"
    ],
    relatedModules: ["Command Center", "Security Gate", "Knowledge Base"],
    phase: "phase1",
    humanApproval: ["Approval rule changes", "Delegation authorization", "Audit report sign-off"]
  },
  {
    id: 12,
    name: "Infrastructure Health",
    description: "Health of servers, services, storage, monitoring, and operational readiness.",
    category: "assurance",
    categoryLabel: "Assurance & Governance Layer",
    previewKPI: "Service Readiness",
    previewValue: "Active",
    statusBadge: "Active",
    valueBadge: "Operational Efficiency",
    capabilities: [
      "Service health monitoring",
      "Resource utilization tracking",
      "Alerting and escalation",
      "Capacity planning",
      "Incident management"
    ],
    strategicValue: "Ensures platform reliability and availability, critical for maintaining continuous engineering operations and service delivery.",
    businessProblem: "Reactive infrastructure management leads to unplanned outages and capacity issues that disrupt engineering velocity.",
    exampleOutputs: [
      "Service health dashboard",
      "Resource utilization report",
      "Incident summary log",
      "Capacity forecast"
    ],
    relatedModules: ["Command Center", "Workflow Manager", "AI Assistant War Room"],
    phase: "phase1",
    humanApproval: ["Infrastructure changes", "Capacity decisions", "Incident escalation"]
  },
  // E. Expansion & Support Layer
  {
    id: 13,
    name: "Lab Validation / Support AI",
    description: "Lab validation readiness, support diagnostics, and future expansion into OpenWiFi/OpenLAN.",
    category: "expansion",
    categoryLabel: "Expansion & Support Layer",
    previewKPI: "Validation Scenarios",
    previewValue: "3",
    statusBadge: "Future Expansion",
    valueBadge: "High Strategic Value",
    capabilities: [
      "Lab environment management",
      "Validation scenario execution",
      "Support diagnostic automation",
      "OpenWiFi integration readiness",
      "OpenLAN expansion planning"
    ],
    strategicValue: "Prepares the platform for expansion into adjacent open infrastructure domains, ensuring future growth capability.",
    businessProblem: "Manual lab validation and support diagnostics limit expansion velocity and create inconsistent customer experiences.",
    exampleOutputs: [
      "Validation test results",
      "Support diagnostic report",
      "Expansion readiness assessment",
      "Integration compatibility matrix"
    ],
    relatedModules: ["Infrastructure Health", "R&D Radar", "Knowledge Base"],
    phase: "future",
    humanApproval: ["Validation sign-off", "Support escalation", "Expansion commitment"]
  }
]

export const kpiData = {
  totalModules: 13,
  phase1Modules: 3,
  aiAgentsActive: 6,
  pendingApprovals: 7,
  releaseCandidates: 2,
  rdSignals: 18,
  highRiskFindings: 4,
  serviceReadiness: "Active",
  platformHealth: 94
}

export const categoryColors: Record<string, { bg: string; border: string; text: string }> = {
  core: { bg: "bg-gold/10", border: "border-gold/30", text: "text-gold" },
  intelligence: { bg: "bg-cyan/10", border: "border-cyan/30", text: "text-cyan" },
  execution: { bg: "bg-success/10", border: "border-success/30", text: "text-success" },
  assurance: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
  expansion: { bg: "bg-info/10", border: "border-info/30", text: "text-info" }
}

// Updated: Remove vendor names, use generic enterprise terms
export const architectureData = {
  servers: [
    {
      name: "Server 1",
      role: "Command & Application Node",
      services: ["Application Console", "Backend Services", "AI Gateway"],
      readinessLabel: "Access Layer Ready"
    },
    {
      name: "Server 2",
      role: "Automation & Engineering Node",
      services: ["Workflow Engine", "Repository Control", "Engineering Workers"],
      readinessLabel: "Automation Layer Ready"
    },
    {
      name: "Server 3",
      role: "Data & Intelligence Node",
      services: ["Data Store", "Artifact Vault", "Knowledge Index", "Monitoring Layer"],
      readinessLabel: "Data Layer Ready"
    }
  ]
}

export const phase1Scope = {
  selectedModules: [
    { name: "R&D Radar", description: "Technology trend and community signal tracking" },
    { name: "AI CTO / Repo Intelligence", description: "Technical analysis and code risk assessment" },
    { name: "Release Factory / Security Gate", description: "Governed release management and compliance" }
  ],
  coreFoundation: [
    { name: "Command Center", description: "Executive dashboard" },
    { name: "AI Gateway", description: "Model orchestration" },
    { name: "Audit & Approvals", description: "Governance workflows" },
    { name: "Workflow Engine", description: "Process automation" }
  ],
  activationScope: [
    { label: "Implementation Readiness", value: "12 Weeks", icon: "clock" },
    { label: "Acceptance Period", value: "2 Weeks", icon: "check" },
    { label: "Support Coverage", value: "24 Months", icon: "shield" },
    { label: "Roadmap Advisory", value: "Included", icon: "compass" }
  ],
  note: "Phase 1 focuses on the highest strategic value modules for sovereign open infrastructure capability."
}

// Guided walkthrough steps for client presentation
export const walkthroughSteps = [
  {
    id: 1,
    title: "Platform Overview",
    description: "Full 13-module platform map showing all capability layers",
    targetSection: "module-grid",
    highlight: "modules"
  },
  {
    id: 2,
    title: "Phase 1 Modules",
    description: "Strategic module selection for initial activation",
    targetSection: "phase1-highlight",
    highlight: "phase1"
  },
  {
    id: 3,
    title: "Target Architecture",
    description: "3-node enterprise deployment model",
    targetSection: "architecture-strip",
    highlight: "architecture"
  },
  {
    id: 4,
    title: "Governance & Approvals",
    description: "Human oversight and control requirements",
    targetSection: "phase1-highlight",
    highlight: "governance"
  },
  {
    id: 5,
    title: "Activation Timeline",
    description: "Implementation readiness and support coverage",
    targetSection: "activation-scope",
    highlight: "timeline"
  }
]
