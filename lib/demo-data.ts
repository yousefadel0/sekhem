// Sekhem Product Application Mock Data
// This file contains all mock data for the demo environment
// Structured for easy replacement with real API calls later

// ============================================================================
// PROJECTS
// ============================================================================
export interface Project {
  id: string
  slug?: string
  name: string
  status: "active" | "planning" | "on-hold"
  phase: string
  client: string
  startDate: string
  targetDate: string
}

export const projects: Project[] = [
  {
    id: "proj-001",
    name: "Community SONiC Sovereign Program",
    status: "active",
    phase: "Phase 1 Implementation",
    client: "Regional Telecom Authority",
    startDate: "2024-01-15",
    targetDate: "2024-04-15"
  },
  {
    id: "proj-002",
    name: "OpenWiFi Regional Deployment",
    status: "planning",
    phase: "Discovery",
    client: "National Infrastructure Ministry",
    startDate: "2024-05-01",
    targetDate: "2024-09-30"
  },
  {
    id: "proj-003",
    name: "OpenLAN Enterprise Trial",
    status: "on-hold",
    phase: "Pilot Evaluation",
    client: "Enterprise Consortium",
    startDate: "2024-03-01",
    targetDate: "2024-06-30"
  }
]

export const currentProject = projects[0]

// ============================================================================
// AI AGENTS
// ============================================================================
export interface AIAgent {
  id: string
  slug?: string
  name: string
  role: string
  status: "online" | "busy" | "idle" | "offline"
  currentTask: string | null
  tasksCompleted: number
  lastActive: string
  specialization: string[]
  humanApprovalRequired: boolean
}

export const aiAgents: AIAgent[] = [
  {
    id: "agent-001",
    name: "CTO Analyst",
    role: "Technical Strategy",
    status: "busy",
    currentTask: "Analyzing SONiC 4.0 requirements document",
    tasksCompleted: 47,
    lastActive: "2 min ago",
    specialization: ["Requirements Analysis", "Technical Memos", "Architecture Review"],
    humanApprovalRequired: true
  },
  {
    id: "agent-002",
    name: "R&D Scout",
    role: "Technology Radar",
    status: "online",
    currentTask: "Monitoring community commits",
    tasksCompleted: 156,
    lastActive: "Just now",
    specialization: ["Trend Detection", "Community Signals", "Competitive Analysis"],
    humanApprovalRequired: false
  },
  {
    id: "agent-003",
    name: "Code Reviewer",
    role: "Repository Analysis",
    status: "busy",
    currentTask: "Analyzing MR #234 risk factors",
    tasksCompleted: 89,
    lastActive: "1 min ago",
    specialization: ["MR Risk Assessment", "Impact Analysis", "Test Recommendations"],
    humanApprovalRequired: true
  },
  {
    id: "agent-004",
    name: "Security Auditor",
    role: "Security Gate",
    status: "online",
    currentTask: null,
    tasksCompleted: 62,
    lastActive: "5 min ago",
    specialization: ["Vulnerability Scanning", "Policy Compliance", "Security Review"],
    humanApprovalRequired: true
  },
  {
    id: "agent-005",
    name: "Release Coordinator",
    role: "Release Factory",
    status: "idle",
    currentTask: null,
    tasksCompleted: 28,
    lastActive: "15 min ago",
    specialization: ["Release Packaging", "Artifact Management", "Deployment Prep"],
    humanApprovalRequired: true
  },
  {
    id: "agent-006",
    name: "Knowledge Curator",
    role: "Knowledge Base",
    status: "online",
    currentTask: "Indexing new documentation",
    tasksCompleted: 234,
    lastActive: "Just now",
    specialization: ["Document Indexing", "Semantic Search", "Knowledge Graph"],
    humanApprovalRequired: false
  }
]

// ============================================================================
// APPROVALS
// ============================================================================
export interface Approval {
  id: string
  type: "release" | "security" | "merge" | "deployment" | "exception" | "access"
  title: string
  description: string
  requestedBy: string
  requestedAt: string
  priority: "critical" | "high" | "medium" | "low"
  status: "pending" | "approved" | "rejected" | "escalated"
  module: string
  requiresHumanApproval: boolean
  aiRecommendation?: "approve" | "reject" | "review"
  aiConfidence?: number
  riskLevel: "high" | "medium" | "low"
}

export const approvals: Approval[] = [
  {
    id: "apr-001",
    type: "release",
    title: "Release Candidate RC-2024.1.3",
    description: "Production release candidate for SONiC build 4.0.1",
    requestedBy: "Release Coordinator Agent",
    requestedAt: "2024-02-15T10:30:00Z",
    priority: "critical",
    status: "pending",
    module: "Release Factory",
    requiresHumanApproval: true,
    aiRecommendation: "approve",
    aiConfidence: 94,
    riskLevel: "medium"
  },
  {
    id: "apr-002",
    type: "security",
    title: "Security Exception Request",
    description: "Temporary bypass for deprecated TLS 1.1 in legacy integration",
    requestedBy: "Integration Team",
    requestedAt: "2024-02-15T09:15:00Z",
    priority: "high",
    status: "pending",
    module: "Security Gate",
    requiresHumanApproval: true,
    aiRecommendation: "review",
    aiConfidence: 67,
    riskLevel: "high"
  },
  {
    id: "apr-003",
    type: "merge",
    title: "MR #234: Core ASIC Driver Update",
    description: "Critical driver update for Barefoot Tofino chipset",
    requestedBy: "Code Reviewer Agent",
    requestedAt: "2024-02-15T08:45:00Z",
    priority: "high",
    status: "pending",
    module: "Repo Intelligence",
    requiresHumanApproval: true,
    aiRecommendation: "approve",
    aiConfidence: 89,
    riskLevel: "medium"
  },
  {
    id: "apr-004",
    type: "access",
    title: "API Key Generation Request",
    description: "New API key for external monitoring integration",
    requestedBy: "Operations Team",
    requestedAt: "2024-02-14T16:20:00Z",
    priority: "medium",
    status: "pending",
    module: "Security Gate",
    requiresHumanApproval: true,
    riskLevel: "low"
  },
  {
    id: "apr-005",
    type: "deployment",
    title: "Staging Environment Update",
    description: "Deploy latest build to staging for validation",
    requestedBy: "Release Coordinator Agent",
    requestedAt: "2024-02-14T14:00:00Z",
    priority: "medium",
    status: "approved",
    module: "Release Factory",
    requiresHumanApproval: true,
    aiRecommendation: "approve",
    aiConfidence: 98,
    riskLevel: "low"
  },
  {
    id: "apr-006",
    type: "exception",
    title: "Extended Build Timeout",
    description: "Increase CI timeout for large integration tests",
    requestedBy: "Engineering Team",
    requestedAt: "2024-02-14T11:30:00Z",
    priority: "low",
    status: "approved",
    module: "Workflow Manager",
    requiresHumanApproval: false,
    riskLevel: "low"
  },
  {
    id: "apr-007",
    type: "merge",
    title: "MR #231: Documentation Update",
    description: "Updated API documentation for v4.0 release",
    requestedBy: "Documentation Team",
    requestedAt: "2024-02-13T15:45:00Z",
    priority: "low",
    status: "approved",
    module: "Repo Intelligence",
    requiresHumanApproval: false,
    aiRecommendation: "approve",
    aiConfidence: 99,
    riskLevel: "low"
  }
]

// ============================================================================
// RELEASE CANDIDATES
// ============================================================================
export interface ReleaseCandidate {
  id: string
  version: string
  name: string
  status: "draft" | "testing" | "review" | "approved" | "released" | "blocked"
  createdAt: string
  targetRelease: string
  artifactHash: string
  changeCount: number
  testsPassed: number
  testsTotal: number
  securityScore: number
  blockingIssues: number
  approvals: { role: string; approved: boolean; approver?: string }[]
  rollbackPlan: boolean
}

export const releaseCandidates: ReleaseCandidate[] = [
  {
    id: "rc-001",
    version: "4.0.1-rc3",
    name: "SONiC Sovereign Build",
    status: "review",
    createdAt: "2024-02-15T08:00:00Z",
    targetRelease: "2024-02-20",
    artifactHash: "sha256:a1b2c3d4e5f6...",
    changeCount: 47,
    testsPassed: 142,
    testsTotal: 145,
    securityScore: 94,
    blockingIssues: 0,
    approvals: [
      { role: "Engineering Lead", approved: true, approver: "Ahmed S." },
      { role: "Security Officer", approved: true, approver: "Sara M." },
      { role: "Release Manager", approved: false },
      { role: "Executive Sponsor", approved: false }
    ],
    rollbackPlan: true
  },
  {
    id: "rc-002",
    version: "4.0.1-rc2",
    name: "SONiC Sovereign Build",
    status: "blocked",
    createdAt: "2024-02-12T14:30:00Z",
    targetRelease: "2024-02-18",
    artifactHash: "sha256:f6e5d4c3b2a1...",
    changeCount: 43,
    testsPassed: 138,
    testsTotal: 145,
    securityScore: 78,
    blockingIssues: 2,
    approvals: [
      { role: "Engineering Lead", approved: true, approver: "Ahmed S." },
      { role: "Security Officer", approved: false },
      { role: "Release Manager", approved: false },
      { role: "Executive Sponsor", approved: false }
    ],
    rollbackPlan: true
  }
]

// ============================================================================
// R&D SIGNALS
// ============================================================================
export interface RDSignal {
  id: string
  type: "trend" | "community" | "competitor" | "vulnerability" | "opportunity"
  title: string
  source: string
  timestamp: string
  priority: "critical" | "high" | "medium" | "low"
  summary: string
  impact: string
  actionRecommended: string
  tags: string[]
  processed: boolean
}

export const rdSignals: RDSignal[] = [
  {
    id: "sig-001",
    type: "community",
    title: "SONiC 4.1 Feature Branch Activity Spike",
    source: "Public Ecosystem Signal",
    timestamp: "2024-02-15T11:00:00Z",
    priority: "high",
    summary: "Significant commit activity detected in SONiC 4.1 feature branches related to EVPN-VXLAN improvements.",
    impact: "May affect our roadmap prioritization for Q2 features",
    actionRecommended: "Review commits and assess alignment with our roadmap",
    tags: ["SONiC", "EVPN", "Community"],
    processed: false
  },
  {
    id: "sig-002",
    type: "vulnerability",
    title: "CVE-2024-1234 in OpenSSL",
    source: "NVD / Security Feed",
    timestamp: "2024-02-15T09:30:00Z",
    priority: "critical",
    summary: "New CVE affecting OpenSSL versions used in current build dependencies.",
    impact: "Requires immediate patch assessment for production builds",
    actionRecommended: "Initiate security review and patch planning",
    tags: ["Security", "CVE", "OpenSSL"],
    processed: true
  },
  {
    id: "sig-003",
    type: "competitor",
    title: "Competitor X Announces Open Source Initiative",
    source: "Industry News",
    timestamp: "2024-02-14T15:00:00Z",
    priority: "medium",
    summary: "Major competitor announces open source network OS initiative targeting enterprise market.",
    impact: "Potential competitive pressure in enterprise segment",
    actionRecommended: "Competitive analysis and positioning review",
    tags: ["Competitive", "Market", "Strategy"],
    processed: false
  },
  {
    id: "sig-004",
    type: "trend",
    title: "AI/ML Network Automation Adoption Growing",
    source: "Analyst Report",
    timestamp: "2024-02-14T10:00:00Z",
    priority: "medium",
    summary: "Industry analysts report 40% YoY growth in AI-driven network automation adoption.",
    impact: "Validates our AI-first platform strategy",
    actionRecommended: "Incorporate into marketing materials and roadmap",
    tags: ["AI", "Trends", "Market"],
    processed: true
  },
  {
    id: "sig-005",
    type: "opportunity",
    title: "OpenWiFi Alliance Partnership Opportunity",
    source: "Partner Network",
    timestamp: "2024-02-13T14:00:00Z",
    priority: "high",
    summary: "Potential partnership opportunity with OpenWiFi Alliance for joint development.",
    impact: "Could accelerate OpenWiFi module development",
    actionRecommended: "Schedule partnership discussion",
    tags: ["Partnership", "OpenWiFi", "Expansion"],
    processed: false
  }
]

// ============================================================================
// REPOSITORIES
// ============================================================================
export interface Repository {
  id: string
  slug?: string
  name: string
  description: string
  language: string
  lastCommit: string
  openMRs: number
  highRiskMRs: number
  coverage: number
  healthScore: number
  branch: string
}

export const repositories: Repository[] = [
  {
    id: "repo-001",
    name: "sonic-sovereign-build",
    description: "Main SONiC sovereign build repository",
    language: "Python",
    lastCommit: "2 hours ago",
    openMRs: 8,
    highRiskMRs: 2,
    coverage: 78,
    healthScore: 92,
    branch: "main"
  },
  {
    id: "repo-002",
    name: "sonic-platform-drivers",
    description: "Platform-specific driver implementations",
    language: "C",
    lastCommit: "4 hours ago",
    openMRs: 3,
    highRiskMRs: 1,
    coverage: 65,
    healthScore: 85,
    branch: "develop"
  },
  {
    id: "repo-003",
    name: "sekhem-ai-agents",
    description: "AI assistant orchestration and logic",
    language: "TypeScript",
    lastCommit: "1 hour ago",
    openMRs: 5,
    highRiskMRs: 0,
    coverage: 82,
    healthScore: 96,
    branch: "main"
  },
  {
    id: "repo-004",
    name: "sekhem-platform-api",
    description: "Core platform API services",
    language: "Go",
    lastCommit: "30 min ago",
    openMRs: 4,
    highRiskMRs: 1,
    coverage: 74,
    healthScore: 88,
    branch: "main"
  }
]

export interface MergeRequest {
  id: string
  number: number
  title: string
  author: string
  repository: string
  status: "open" | "merged" | "closed"
  riskScore: number
  riskFactors: string[]
  linesAdded: number
  linesRemoved: number
  filesChanged: number
  testsAffected: number
  createdAt: string
  requiresApproval: boolean
}

export const mergeRequests: MergeRequest[] = [
  {
    id: "mr-001",
    number: 234,
    title: "Core ASIC Driver Update for Barefoot Tofino",
    author: "engineering-team",
    repository: "sonic-platform-drivers",
    status: "open",
    riskScore: 78,
    riskFactors: ["Critical path code", "Low test coverage area", "Hardware dependency"],
    linesAdded: 342,
    linesRemoved: 89,
    filesChanged: 12,
    testsAffected: 8,
    createdAt: "2024-02-15T08:00:00Z",
    requiresApproval: true
  },
  {
    id: "mr-002",
    number: 233,
    title: "EVPN Type-5 Route Support Enhancement",
    author: "network-team",
    repository: "sonic-sovereign-build",
    status: "open",
    riskScore: 45,
    riskFactors: ["Complex routing logic"],
    linesAdded: 156,
    linesRemoved: 23,
    filesChanged: 5,
    testsAffected: 3,
    createdAt: "2024-02-14T16:30:00Z",
    requiresApproval: true
  },
  {
    id: "mr-003",
    number: 232,
    title: "API Rate Limiting Implementation",
    author: "platform-team",
    repository: "sekhem-platform-api",
    status: "open",
    riskScore: 32,
    riskFactors: [],
    linesAdded: 89,
    linesRemoved: 12,
    filesChanged: 3,
    testsAffected: 2,
    createdAt: "2024-02-14T14:00:00Z",
    requiresApproval: false
  }
]

// ============================================================================
// INFRASTRUCTURE HEALTH
// ============================================================================
export interface Server {
  id: string
  slug?: string
  name: string
  role: string
  status: "healthy" | "warning" | "critical" | "offline"
  cpu: number
  memory: number
  disk: number
  uptime: string
  services: ServiceStatus[]
}

export interface ServiceStatus {
  name: string
  status: "running" | "stopped" | "error" | "degraded"
  port?: number
  lastCheck: string
}

export const servers: Server[] = [
  {
    id: "srv-001",
    name: "sekhem-app-01",
    role: "Command & Application Node",
    status: "healthy",
    cpu: 42,
    memory: 68,
    disk: 45,
    uptime: "45d 12h 34m",
    services: [
      { name: "Frontend", status: "running", port: 3000, lastCheck: "1 min ago" },
      { name: "Backend API", status: "running", port: 8080, lastCheck: "1 min ago" },
      { name: "AI Gateway", status: "running", port: 8090, lastCheck: "1 min ago" },
      { name: "WebSocket Server", status: "running", port: 8081, lastCheck: "1 min ago" }
    ]
  },
  {
    id: "srv-002",
    name: "sekhem-eng-01",
    role: "Automation & Engineering Node",
    status: "healthy",
    cpu: 67,
    memory: 74,
    disk: 58,
    uptime: "45d 12h 34m",
    services: [
      { name: "Source Control Platform", status: "running", port: 443, lastCheck: "1 min ago" },
      { name: "Automation Engine", status: "running", port: 5678, lastCheck: "1 min ago" },
      { name: "Build Agent 1", status: "running", lastCheck: "2 min ago" },
      { name: "Build Agent 2", status: "running", lastCheck: "2 min ago" }
    ]
  },
  {
    id: "srv-003",
    name: "sekhem-data-01",
    role: "Data & Intelligence Node",
    status: "warning",
    cpu: 78,
    memory: 85,
    disk: 72,
    uptime: "45d 12h 34m",
    services: [
      { name: "Data Store", status: "running", port: 5432, lastCheck: "1 min ago" },
      { name: "Cache Layer", status: "running", port: 6379, lastCheck: "1 min ago" },
      { name: "Artifact Storage", status: "running", port: 9000, lastCheck: "1 min ago" },
      { name: "Vector DB", status: "degraded", port: 6333, lastCheck: "1 min ago" },
      { name: "Prometheus", status: "running", port: 9090, lastCheck: "1 min ago" }
    ]
  }
]

// ============================================================================
// WORKFLOWS
// ============================================================================
export interface Workflow {
  id: string
  slug?: string
  name: string
  status: "running" | "completed" | "failed" | "paused" | "pending"
  trigger: string
  startedAt: string
  completedAt?: string
  duration?: string
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  name: string
  status: "completed" | "running" | "pending" | "failed" | "skipped"
  duration?: string
}

export const workflows: Workflow[] = [
  {
    id: "wf-001",
    name: "Release Candidate Build Pipeline",
    status: "running",
    trigger: "Manual trigger by Ahmed S.",
    startedAt: "2024-02-15T10:00:00Z",
    steps: [
      { name: "Code Checkout", status: "completed", duration: "12s" },
      { name: "Dependency Install", status: "completed", duration: "2m 34s" },
      { name: "Unit Tests", status: "completed", duration: "5m 12s" },
      { name: "Integration Tests", status: "running" },
      { name: "Security Scan", status: "pending" },
      { name: "Build Artifacts", status: "pending" },
      { name: "Human Approval", status: "pending" }
    ]
  },
  {
    id: "wf-002",
    name: "Daily R&D Signal Collection",
    status: "completed",
    trigger: "Scheduled (Daily 06:00 UTC)",
    startedAt: "2024-02-15T06:00:00Z",
    completedAt: "2024-02-15T06:15:34Z",
    duration: "15m 34s",
    steps: [
      { name: "Repository Signal Fetch", status: "completed", duration: "3m 12s" },
      { name: "News Feed Processing", status: "completed", duration: "2m 45s" },
      { name: "CVE Database Check", status: "completed", duration: "1m 23s" },
      { name: "Signal Classification", status: "completed", duration: "4m 56s" },
      { name: "Priority Assignment", status: "completed", duration: "2m 18s" },
      { name: "Notification Dispatch", status: "completed", duration: "1m 00s" }
    ]
  },
  {
    id: "wf-003",
    name: "MR Risk Analysis #234",
    status: "completed",
    trigger: "Webhook (Source Control Platform MR Created)",
    startedAt: "2024-02-15T08:05:00Z",
    completedAt: "2024-02-15T08:12:45Z",
    duration: "7m 45s",
    steps: [
      { name: "Code Diff Analysis", status: "completed", duration: "1m 34s" },
      { name: "Impact Assessment", status: "completed", duration: "2m 12s" },
      { name: "Test Coverage Check", status: "completed", duration: "1m 45s" },
      { name: "Risk Score Calculation", status: "completed", duration: "56s" },
      { name: "Report Generation", status: "completed", duration: "1m 18s" }
    ]
  },
  {
    id: "wf-004",
    name: "Security Policy Validation",
    status: "failed",
    trigger: "Release Candidate Submitted",
    startedAt: "2024-02-14T16:00:00Z",
    completedAt: "2024-02-14T16:08:23Z",
    duration: "8m 23s",
    steps: [
      { name: "Dependency Audit", status: "completed", duration: "2m 34s" },
      { name: "CVE Cross-Reference", status: "completed", duration: "1m 45s" },
      { name: "Policy Compliance", status: "failed", duration: "3m 12s" },
      { name: "Exception Check", status: "skipped" },
      { name: "Approval Routing", status: "skipped" }
    ]
  }
]

// ============================================================================
// PATCHES
// ============================================================================
export interface PatchSuggestion {
  id: string
  title: string
  description: string
  targetFile: string
  suggestedBy: string
  confidence: number
  status: "pending-review" | "approved" | "rejected" | "implemented"
  riskLevel: "low" | "medium" | "high"
  createdAt: string
  diff: string
  requiresHumanApproval: boolean
}

export const patchSuggestions: PatchSuggestion[] = [
  {
    id: "patch-001",
    title: "Fix null pointer in ASIC driver init",
    description: "Detected potential null pointer dereference in driver initialization sequence",
    targetFile: "src/drivers/barefoot/init.c",
    suggestedBy: "Code Reviewer Agent",
    confidence: 92,
    status: "pending-review",
    riskLevel: "medium",
    createdAt: "2024-02-15T09:30:00Z",
    diff: `@@ -156,7 +156,9 @@
 static int bf_driver_init(struct device *dev)
 {
     struct bf_context *ctx = dev_get_drvdata(dev);
-    ctx->config = load_config(dev);
+    if (!ctx)
+        return -EINVAL;
+    ctx->config = load_config(dev);
     return bf_setup_ports(ctx);
 }`,
    requiresHumanApproval: true
  },
  {
    id: "patch-002",
    title: "Optimize EVPN route lookup performance",
    description: "Identified inefficient loop in route table lookup that can be optimized with hash lookup",
    targetFile: "src/routing/evpn/lookup.py",
    suggestedBy: "Code Reviewer Agent",
    confidence: 78,
    status: "pending-review",
    riskLevel: "low",
    createdAt: "2024-02-15T08:45:00Z",
    diff: `@@ -89,10 +89,8 @@
 def find_route(route_table, prefix):
-    for route in route_table:
-        if route.prefix == prefix:
-            return route
-    return None
+    return route_table.get(prefix)`,
    requiresHumanApproval: true
  }
]

// ============================================================================
// KNOWLEDGE BASE
// ============================================================================
export interface KnowledgeDocument {
  id: string
  title: string
  type: "technical-memo" | "decision-record" | "architecture" | "meeting-notes" | "specification"
  summary: string
  author: string
  createdAt: string
  updatedAt: string
  tags: string[]
  relatedDocs: string[]
}

export const knowledgeDocuments: KnowledgeDocument[] = [
  {
    id: "doc-001",
    title: "SONiC 4.0 Architecture Decision Record",
    type: "decision-record",
    summary: "Documents the key architectural decisions for the SONiC 4.0 sovereign build, including module boundaries and integration patterns.",
    author: "AI CTO Agent",
    createdAt: "2024-01-20T10:00:00Z",
    updatedAt: "2024-02-10T14:30:00Z",
    tags: ["Architecture", "SONiC", "Decision"],
    relatedDocs: ["doc-003", "doc-005"]
  },
  {
    id: "doc-002",
    title: "Security Policy Framework v2.1",
    type: "specification",
    summary: "Comprehensive security policy framework defining approval requirements, risk thresholds, and exception procedures.",
    author: "Security Team",
    createdAt: "2024-01-15T09:00:00Z",
    updatedAt: "2024-02-12T11:00:00Z",
    tags: ["Security", "Policy", "Governance"],
    relatedDocs: ["doc-004"]
  },
  {
    id: "doc-003",
    title: "EVPN-VXLAN Implementation Guide",
    type: "technical-memo",
    summary: "Technical implementation guide for EVPN-VXLAN overlay networking in the sovereign SONiC build.",
    author: "Network Engineering",
    createdAt: "2024-02-01T08:00:00Z",
    updatedAt: "2024-02-14T16:00:00Z",
    tags: ["EVPN", "VXLAN", "Networking"],
    relatedDocs: ["doc-001"]
  }
]

// ============================================================================
// SECURITY
// ============================================================================
export interface SecurityFinding {
  id: string
  severity: "critical" | "high" | "medium" | "low"
  title: string
  description: string
  source: string
  status: "open" | "mitigated" | "accepted" | "false-positive"
  affectedComponent: string
  discoveredAt: string
  cve?: string
}

export const securityFindings: SecurityFinding[] = [
  {
    id: "sec-001",
    severity: "high",
    title: "OpenSSL Buffer Overflow Vulnerability",
    description: "Buffer overflow in OpenSSL 3.0.x before 3.0.13 allows remote attackers to execute arbitrary code",
    source: "CVE Scanner",
    status: "open",
    affectedComponent: "sonic-sovereign-build",
    discoveredAt: "2024-02-15T09:30:00Z",
    cve: "CVE-2024-1234"
  },
  {
    id: "sec-002",
    severity: "medium",
    title: "Deprecated TLS 1.1 Protocol in Use",
    description: "Legacy integration endpoint still using TLS 1.1 which is deprecated",
    source: "Policy Scanner",
    status: "open",
    affectedComponent: "legacy-integration-bridge",
    discoveredAt: "2024-02-14T14:00:00Z"
  },
  {
    id: "sec-003",
    severity: "low",
    title: "Missing HTTP Security Headers",
    description: "Several HTTP security headers missing from API responses",
    source: "Security Audit",
    status: "mitigated",
    affectedComponent: "sekhem-platform-api",
    discoveredAt: "2024-02-10T10:00:00Z"
  }
]

// ============================================================================
// PHASE 1 ACTIVATION SCOPE
// ============================================================================
export const phase1ActivationScope = {
  packageName: "Sekhem Phase 1 Activation Scope",
  scopeStatus: "Governed activation",
  features: [
    { name: "Core Platform Foundation", included: true },
    { name: "R&D Radar", included: true },
    { name: "AI Technical Planner / Repo Intelligence", included: true },
    { name: "Release Factory / Security Gate", included: true },
    { name: "Failure / Blocker Center", included: true },
    { name: "Annual Update Package", included: true },
    { name: "Locked Advanced Modules", included: false }
  ],
  activationStages: [
    { stage: "Readiness Review", milestone: "Environment and access model confirmed" },
    { stage: "Core Platform Activation", milestone: "Product application shell and governance model enabled" },
    { stage: "Module Activation", milestone: "Phase 1 modules enabled with mock-to-API contract" },
    { stage: "Final Acceptance", milestone: "User walkthrough, role review, and acceptance completed" }
  ],
  exclusions: [
    "Hardware procurement",
    "Data center hosting",
    "Third-party enterprise subscriptions",
    "Deep NOS implementation",
    "Real hardware lab automation",
    "24/7 operations support unless activated separately"
  ]
}

export const deliveryTimeline = [
  { weeks: "1-2", phase: "Foundation", milestone: "Core Platform Setup", deliverables: ["Platform deployment", "User provisioning", "Base configuration"] },
  { weeks: "3-4", phase: "Module 1", milestone: "R&D Radar Activation", deliverables: ["Signal sources configured", "Classification rules", "Dashboard live"] },
  { weeks: "5-6", phase: "Module 2", milestone: "AI CTO / Repo Intelligence", deliverables: ["Repository integration", "Analysis rules", "Review workflows"] },
  { weeks: "7-8", phase: "Module 3", milestone: "Release Factory / Security Gate", deliverables: ["Release pipelines", "Security policies", "Approval chains"] },
  { weeks: "9-10", phase: "Integration", milestone: "Integration & Training", deliverables: ["System integration", "User training", "Documentation"] },
  { weeks: "11-12", phase: "Acceptance", milestone: "Acceptance & Handover", deliverables: ["UAT completion", "Knowledge transfer", "Go-live support"] }
]

// ============================================================================
// LAB VALIDATION
// ============================================================================
export interface ValidationScenario {
  id: string
  slug?: string
  name: string
  description: string
  status: "ready" | "running" | "passed" | "failed" | "not-started"
  category: "functional" | "performance" | "integration" | "security"
  lastRun?: string
  duration?: string
  steps: number
  passedSteps: number
}

export const validationScenarios: ValidationScenario[] = [
  {
    id: "val-001",
    name: "SONiC Basic Switching Validation",
    description: "Validates basic L2 switching functionality including VLANs and port configurations",
    status: "passed",
    category: "functional",
    lastRun: "2024-02-14T10:00:00Z",
    duration: "45m",
    steps: 24,
    passedSteps: 24
  },
  {
    id: "val-002",
    name: "EVPN-VXLAN Overlay Test Suite",
    description: "Comprehensive validation of EVPN-VXLAN overlay networking features",
    status: "running",
    category: "functional",
    lastRun: "2024-02-15T08:00:00Z",
    steps: 36,
    passedSteps: 28
  },
  {
    id: "val-003",
    name: "Performance Benchmark Suite",
    description: "Throughput, latency, and scalability benchmarks for the sovereign build",
    status: "not-started",
    category: "performance",
    steps: 18,
    passedSteps: 0
  }
]

// ============================================================================
// AUDIT EVENTS
// ============================================================================
export interface AuditEvent {
  id: string
  timestamp: string
  action: string
  actor: string
  actorType: "user" | "agent" | "system"
  target: string
  module: string
  details: string
  riskLevel: "high" | "medium" | "low"
}

export const auditEvents: AuditEvent[] = [
  {
    id: "evt-001",
    timestamp: "2024-02-15T11:30:00Z",
    action: "APPROVAL_GRANTED",
    actor: "Michael Carter",
    actorType: "user",
    target: "Release Candidate RC-2024.1.3",
    module: "Release Factory",
    details: "Approved release candidate for staging deployment",
    riskLevel: "medium"
  },
  {
    id: "evt-002",
    timestamp: "2024-02-15T10:45:00Z",
    action: "SECURITY_EXCEPTION_REQUESTED",
    actor: "Integration Team",
    actorType: "user",
    target: "TLS 1.1 Legacy Bridge",
    module: "Security Gate",
    details: "Requested temporary exception for deprecated protocol",
    riskLevel: "high"
  },
  {
    id: "evt-003",
    timestamp: "2024-02-15T10:30:00Z",
    action: "RISK_ANALYSIS_COMPLETED",
    actor: "Code Reviewer Agent",
    actorType: "agent",
    target: "MR #234",
    module: "Repo Intelligence",
    details: "Completed automated risk analysis, flagged as high-risk",
    riskLevel: "medium"
  },
  {
    id: "evt-004",
    timestamp: "2024-02-15T09:15:00Z",
    action: "SIGNAL_DETECTED",
    actor: "R&D Scout Agent",
    actorType: "agent",
    target: "CVE-2024-1234",
    module: "R&D Radar",
    details: "Critical vulnerability detected affecting build dependencies",
    riskLevel: "high"
  },
  {
    id: "evt-005",
    timestamp: "2024-02-15T08:00:00Z",
    action: "WORKFLOW_STARTED",
    actor: "System",
    actorType: "system",
    target: "Daily R&D Signal Collection",
    module: "Workflow Manager",
    details: "Scheduled workflow execution initiated",
    riskLevel: "low"
  }
]

// ============================================================================
// RECOMMENDED INITIATIVES
// ============================================================================
export interface ExecutionPath {
  id: string
  slug?: string
  name: string
  description: string
  riskLevel: "low" | "medium" | "high" | "very-high"
  status: "enabled" | "limited-preview" | "locked-addon" | "locked-advanced"
  requiresApproval: boolean
  estimatedDuration: string
  deliverables: string[]
}

export interface InitiativeActivity {
  id: string
  timestamp: string
  type: "signal" | "evidence" | "recommendation" | "path-selection" | "memo" | "task" | "code" | "security" | "approval" | "blocker" | "release"
  title: string
  description: string
  actor: string
  actorType: "system" | "agent" | "user"
  status: "completed" | "pending" | "in-progress" | "blocked"
}

export interface Initiative {
  id: string
  slug?: string
  name: string
  description: string
  businessValue: "high" | "medium" | "low"
  technicalRisk: "high" | "medium" | "low"
  evidenceSources: number
  recommendedPath: string
  status: "recommended" | "in-progress" | "pending-approval" | "completed" | "blocked"
  category: "validation" | "automation" | "telemetry" | "governance" | "integration"
  tags: string[]
  createdAt: string
  lastActivity: string
  humanApprovalRequired: boolean
  executionPaths: ExecutionPath[]
  activities: InitiativeActivity[]
  overview: {
    summary: string
    businessCase: string
    technicalScope: string
    targetOutcome: string
  }
  evidence: {
    id: string
    type: "community-signal" | "security-advisory" | "roadmap-gap" | "customer-request" | "compliance-requirement"
    title: string
    source: string
    relevance: "high" | "medium" | "low"
    timestamp: string
    summary: string
  }[]
  tasks: {
    id: string
    title: string
    status: "todo" | "in-progress" | "review" | "done" | "blocked"
    assignee: string
    priority: "high" | "medium" | "low"
    dueDate: string
  }[]
  blockers: {
    id: string
    title: string
    type: "security-finding" | "human-approval-gate" | "external-dependency" | "technical-constraint" | "resource-limitation"
    severity: "critical" | "high" | "medium"
    status: "open" | "investigating" | "resolved"
    description: string
    createdAt: string
  }[]
  technicalMemo: {
    generatedAt: string
    generatedBy: string
    sections: {
      title: string
      content: string
    }[]
    status: "draft" | "review" | "approved"
    approvedBy?: string
  } | null
}

export const executionPathTemplates: ExecutionPath[] = [
  {
    id: "path-discovery",
    name: "Discovery Only",
    description: "Analysis and recommendations without code changes. Safe exploration of requirements and constraints.",
    riskLevel: "low",
    status: "enabled",
    requiresApproval: false,
    estimatedDuration: "1-2 weeks",
    deliverables: ["Requirements analysis", "Technical assessment", "Risk evaluation", "Recommendation report"]
  },
  {
    id: "path-reference",
    name: "Reference Design + Templates",
    description: "Architecture blueprints, configuration templates, and implementation guides.",
    riskLevel: "medium",
    status: "enabled",
    requiresApproval: true,
    estimatedDuration: "2-3 weeks",
    deliverables: ["Architecture design", "Configuration templates", "Implementation guide", "Test strategy"]
  },
  {
    id: "path-testpack",
    name: "Test Case Pack",
    description: "Validation test suites with automated test cases and acceptance criteria.",
    riskLevel: "medium",
    status: "enabled",
    requiresApproval: true,
    estimatedDuration: "2-4 weeks",
    deliverables: ["Test case definitions", "Automated test scripts", "Validation scenarios", "Acceptance criteria"]
  },
  {
    id: "path-codedraft",
    name: "Code Draft Branch",
    description: "AI-assisted code generation in isolated sandbox branch. Human review required.",
    riskLevel: "high",
    status: "limited-preview",
    requiresApproval: true,
    estimatedDuration: "3-6 weeks",
    deliverables: ["Draft implementation", "Code review package", "Integration notes", "Sandbox test results"]
  },
  {
    id: "path-labval",
    name: "Lab Validation",
    description: "Full lab environment testing with hardware-in-loop validation.",
    riskLevel: "high",
    status: "locked-addon",
    requiresApproval: true,
    estimatedDuration: "4-8 weeks",
    deliverables: ["Lab test results", "Performance benchmarks", "Integration validation", "Deployment readiness"]
  },
  {
    id: "path-deepnos",
    name: "Deep NOS Implementation",
    description: "Full network operating system integration with production deployment support.",
    riskLevel: "very-high",
    status: "locked-advanced",
    requiresApproval: true,
    estimatedDuration: "8-16 weeks",
    deliverables: ["Production code", "Deployment package", "Operations runbook", "Support documentation"]
  }
]

export const initiatives: Initiative[] = [
  {
    id: "init-001",
    slug: "evpn-bgp-validation-pack",
    name: "EVPN BGP Validation Pack",
    description: "Comprehensive validation framework for EVPN-VXLAN overlays with BGP underlay in sovereign SONiC deployments.",
    businessValue: "high",
    technicalRisk: "high",
    evidenceSources: 8,
    recommendedPath: "Discovery + Reference Design + Test Case Pack",
    status: "recommended",
    category: "validation",
    tags: ["EVPN", "BGP", "VXLAN", "Validation", "SONiC"],
    createdAt: "2024-02-10T08:00:00Z",
    lastActivity: "2024-02-15T11:30:00Z",
    humanApprovalRequired: true,
    executionPaths: executionPathTemplates,
    overview: {
      summary: "This initiative addresses the critical need for standardized validation of EVPN-VXLAN configurations in sovereign SONiC deployments. The validation pack will ensure consistent network fabric behavior across multi-vendor leaf-spine architectures.",
      businessCase: "Reduces deployment risk by 60% through pre-validated configurations. Accelerates time-to-production by eliminating manual validation cycles. Provides audit-ready evidence for compliance requirements.",
      technicalScope: "EVPN Type-2 (MAC/IP), Type-5 (IP Prefix) routes, BGP underlay with ECMP, VXLAN encapsulation, multi-tenancy isolation, and failure recovery scenarios.",
      targetOutcome: "A reusable validation pack that can be executed against any SONiC deployment to verify EVPN-VXLAN correctness with 95%+ coverage of production scenarios."
    },
    evidence: [
      {
        id: "ev-001",
        type: "community-signal",
        title: "SONiC 4.1 EVPN Enhancement Commits",
        source: "Public Ecosystem Signal",
        relevance: "high",
        timestamp: "2024-02-12T10:00:00Z",
        summary: "Significant upstream activity in EVPN-VXLAN modules indicates community focus on this capability."
      },
      {
        id: "ev-002",
        type: "customer-request",
        title: "Data Center Fabric Validation Requirement",
        source: "Customer Requirements Portal",
        relevance: "high",
        timestamp: "2024-02-08T14:00:00Z",
        summary: "Multiple customer requests for standardized EVPN validation in their sovereign deployments."
      },
      {
        id: "ev-003",
        type: "compliance-requirement",
        title: "Network Validation Audit Standard",
        source: "Compliance Framework",
        relevance: "medium",
        timestamp: "2024-02-05T09:00:00Z",
        summary: "New compliance standard requires documented validation evidence for network fabric deployments."
      },
      {
        id: "ev-004",
        type: "roadmap-gap",
        title: "Missing Automated Validation Coverage",
        source: "Internal Gap Analysis",
        relevance: "high",
        timestamp: "2024-02-01T11:00:00Z",
        summary: "Current validation process is manual and inconsistent across deployments."
      },
      {
        id: "ev-005",
        type: "security-advisory",
        title: "BGP Session Security Recommendations",
        source: "Security Feed",
        relevance: "medium",
        timestamp: "2024-01-28T16:00:00Z",
        summary: "Industry recommendations for BGP session security should be included in validation scope."
      },
      {
        id: "ev-006",
        type: "community-signal",
        title: "EVPN Multi-Homing Best Practices",
        source: "Technical Community",
        relevance: "medium",
        timestamp: "2024-01-25T13:00:00Z",
        summary: "Emerging best practices for EVPN multi-homing that should inform validation criteria."
      },
      {
        id: "ev-007",
        type: "customer-request",
        title: "Failure Recovery Validation",
        source: "Customer Requirements Portal",
        relevance: "high",
        timestamp: "2024-01-20T10:00:00Z",
        summary: "Customer requirement for validated failure recovery scenarios in EVPN deployments."
      },
      {
        id: "ev-008",
        type: "roadmap-gap",
        title: "Test Automation Framework Gap",
        source: "Engineering Assessment",
        relevance: "medium",
        timestamp: "2024-01-15T09:00:00Z",
        summary: "Need for automated test execution framework to support continuous validation."
      }
    ],
    tasks: [
      {
        id: "task-001",
        title: "Define EVPN validation test criteria",
        status: "done",
        assignee: "AI Technical Planner",
        priority: "high",
        dueDate: "2024-02-12"
      },
      {
        id: "task-002",
        title: "Create BGP underlay test scenarios",
        status: "in-progress",
        assignee: "Engineering Team",
        priority: "high",
        dueDate: "2024-02-18"
      },
      {
        id: "task-003",
        title: "Develop VXLAN encapsulation tests",
        status: "todo",
        assignee: "Engineering Team",
        priority: "medium",
        dueDate: "2024-02-22"
      },
      {
        id: "task-004",
        title: "Prepare security gate documentation",
        status: "todo",
        assignee: "Security Team",
        priority: "medium",
        dueDate: "2024-02-25"
      },
      {
        id: "task-005",
        title: "Human approval for high-risk test execution",
        status: "todo",
        assignee: "Technical Lead",
        priority: "high",
        dueDate: "2024-02-20"
      }
    ],
    blockers: [
      {
        id: "blk-001",
        title: "Security Gate Review Pending",
        type: "human-approval-gate",
        severity: "high",
        status: "open",
        description: "Security team review required before code can be executed in sandbox. AI technical assistants cannot bypass this gate.",
        createdAt: "2024-02-14T09:00:00Z"
      },
      {
        id: "blk-002",
        title: "Upstream Dependency Update",
        type: "external-dependency",
        severity: "medium",
        status: "investigating",
        description: "Waiting for SONiC upstream merge of BGP session monitoring patches.",
        createdAt: "2024-02-12T14:00:00Z"
      }
    ],
    activities: [
      {
        id: "act-001",
        timestamp: "2024-02-10T08:00:00Z",
        type: "signal",
        title: "R&D Signal Detected",
        description: "Community activity spike in EVPN-VXLAN modules identified by R&D Radar.",
        actor: "R&D Scout Agent",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-002",
        timestamp: "2024-02-10T10:30:00Z",
        type: "evidence",
        title: "Evidence Collection Started",
        description: "Collecting evidence from 8 sources including community signals and customer requests.",
        actor: "Knowledge Curator Agent",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-003",
        timestamp: "2024-02-11T09:00:00Z",
        type: "recommendation",
        title: "Initiative Recommended",
        description: "AI Technical Planner recommended this initiative based on business value and technical feasibility analysis.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-004",
        timestamp: "2024-02-12T14:00:00Z",
        type: "path-selection",
        title: "Execution Path Proposed",
        description: "Recommended safe path: Discovery + Reference Design + Test Case Pack.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-005",
        timestamp: "2024-02-13T10:00:00Z",
        type: "memo",
        title: "AI Technical Memo Generated",
        description: "Technical analysis memo generated with scope, risks, and implementation approach.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-006",
        timestamp: "2024-02-14T08:00:00Z",
        type: "task",
        title: "Tasks Created",
        description: "5 tasks created and assigned to team members.",
        actor: "Workflow Manager",
        actorType: "system",
        status: "completed"
      },
      {
        id: "act-007",
        timestamp: "2024-02-14T16:00:00Z",
        type: "code",
        title: "Code Draft Prepared",
        description: "Sandboxed code draft branch created for validation framework scaffold.",
        actor: "Code Generator Agent",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-008",
        timestamp: "2024-02-15T09:00:00Z",
        type: "security",
        title: "Security Gate Pending",
        description: "Awaiting security review for code draft branch.",
        actor: "Security Gate",
        actorType: "system",
        status: "pending"
      },
      {
        id: "act-009",
        timestamp: "2024-02-15T11:30:00Z",
        type: "approval",
        title: "Human Approval Required",
        description: "High-risk actions require human approval before proceeding.",
        actor: "Approval System",
        actorType: "system",
        status: "pending"
      }
    ],
    technicalMemo: {
      generatedAt: "2024-02-13T10:00:00Z",
      generatedBy: "AI Technical Planner",
      status: "review",
      sections: [
        {
          title: "Executive Summary",
          content: "This initiative establishes a comprehensive EVPN-BGP validation framework for sovereign SONiC deployments. The framework addresses critical gaps in current validation processes and aligns with emerging compliance requirements."
        },
        {
          title: "Technical Scope",
          content: "The validation pack covers: EVPN Type-2 (MAC/IP advertisement), Type-5 (IP prefix routes), BGP underlay with ECMP load balancing, VXLAN encapsulation verification, multi-tenant isolation, BUM traffic handling, and failure recovery scenarios including link failures, node failures, and BGP session recovery."
        },
        {
          title: "Risk Assessment",
          content: "Technical Risk: HIGH - Involves complex distributed protocol validation. Mitigation: Phased approach starting with Discovery, progressing to Reference Design, then Test Case Pack. All high-risk execution paths require human approval."
        },
        {
          title: "Recommended Approach",
          content: "Phase 1: Discovery - Requirements analysis and constraint mapping (1-2 weeks). Phase 2: Reference Design - Architecture blueprints and configuration templates (2-3 weeks). Phase 3: Test Case Pack - Automated validation scenarios (2-4 weeks). Code Draft Branch available as limited preview for advanced customers."
        },
        {
          title: "Dependencies",
          content: "Requires: SONiC 4.0+ deployment, BGP-capable spine switches, VXLAN-capable leaf switches, test traffic generation capability. Integration with existing Knowledge Base and Repo Intelligence modules."
        },
        {
          title: "Success Criteria",
          content: "95%+ validation coverage of production EVPN scenarios. Automated test execution time under 2 hours. Zero false positives in validation results. Audit-ready documentation for compliance requirements."
        }
      ]
    }
  },
  {
    id: "init-002",
    name: "Secure Image Upgrade Workflow",
    description: "Automated secure image upgrade pipeline with rollback capabilities for SONiC deployments.",
    businessValue: "high",
    technicalRisk: "medium",
    evidenceSources: 5,
    recommendedPath: "Discovery + Reference Design",
    status: "recommended",
    category: "automation",
    tags: ["Security", "Upgrade", "Automation", "SONiC"],
    createdAt: "2024-02-08T10:00:00Z",
    lastActivity: "2024-02-14T15:00:00Z",
    humanApprovalRequired: true,
    executionPaths: executionPathTemplates,
    overview: {
      summary: "Establishes a secure, auditable image upgrade workflow for SONiC deployments with built-in rollback and verification capabilities.",
      businessCase: "Reduces upgrade-related outages by 80%. Provides complete audit trail for compliance. Enables faster security patch deployment.",
      technicalScope: "Image signature verification, staged rollout, health check gates, automatic rollback triggers, and audit logging.",
      targetOutcome: "A production-ready upgrade workflow that can be executed with confidence across the sovereign infrastructure."
    },
    evidence: [
      {
        id: "ev-011",
        type: "security-advisory",
        title: "Firmware Security Best Practices",
        source: "Security Feed",
        relevance: "high",
        timestamp: "2024-02-06T10:00:00Z",
        summary: "Industry recommendations for secure firmware upgrade processes."
      },
      {
        id: "ev-012",
        type: "customer-request",
        title: "Automated Upgrade Pipeline Request",
        source: "Customer Requirements Portal",
        relevance: "high",
        timestamp: "2024-02-04T14:00:00Z",
        summary: "Customer request for automated, secure upgrade capability."
      },
      {
        id: "ev-013",
        type: "roadmap-gap",
        title: "Manual Upgrade Process Risk",
        source: "Internal Assessment",
        relevance: "high",
        timestamp: "2024-02-02T09:00:00Z",
        summary: "Current manual upgrade process identified as operational risk."
      },
      {
        id: "ev-014",
        type: "compliance-requirement",
        title: "Audit Trail Requirements",
        source: "Compliance Framework",
        relevance: "medium",
        timestamp: "2024-01-30T11:00:00Z",
        summary: "Compliance requirement for complete upgrade audit trails."
      },
      {
        id: "ev-015",
        type: "community-signal",
        title: "SONiC Upgrade Automation Patterns",
        source: "Technical Community",
        relevance: "medium",
        timestamp: "2024-01-28T13:00:00Z",
        summary: "Community patterns for automated SONiC upgrades."
      }
    ],
    tasks: [
      {
        id: "task-011",
        title: "Define upgrade workflow requirements",
        status: "done",
        assignee: "AI Technical Planner",
        priority: "high",
        dueDate: "2024-02-10"
      },
      {
        id: "task-012",
        title: "Design rollback mechanism",
        status: "in-progress",
        assignee: "Engineering Team",
        priority: "high",
        dueDate: "2024-02-16"
      },
      {
        id: "task-013",
        title: "Create health check gates",
        status: "todo",
        assignee: "Engineering Team",
        priority: "medium",
        dueDate: "2024-02-20"
      }
    ],
    blockers: [],
    activities: [
      {
        id: "act-011",
        timestamp: "2024-02-08T10:00:00Z",
        type: "signal",
        title: "R&D Signal Detected",
        description: "Security advisories and customer requests identified need for secure upgrade workflow.",
        actor: "R&D Scout Agent",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-012",
        timestamp: "2024-02-09T09:00:00Z",
        type: "recommendation",
        title: "Initiative Recommended",
        description: "AI Technical Planner recommended initiative based on security and operational priorities.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-013",
        timestamp: "2024-02-10T14:00:00Z",
        type: "memo",
        title: "AI Technical Memo Generated",
        description: "Technical memo outlining secure upgrade workflow design.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      }
    ],
    technicalMemo: {
      generatedAt: "2024-02-10T14:00:00Z",
      generatedBy: "AI Technical Planner",
      status: "draft",
      sections: [
        {
          title: "Executive Summary",
          content: "This initiative establishes a secure image upgrade workflow with verification, staged rollout, and automatic rollback capabilities."
        },
        {
          title: "Technical Scope",
          content: "Image signature verification, pre-upgrade health checks, staged device rollout, post-upgrade validation, automatic rollback triggers, and comprehensive audit logging."
        },
        {
          title: "Risk Assessment",
          content: "Technical Risk: MEDIUM - Well-understood upgrade patterns with established rollback mechanisms. Mitigation: Staged rollout with health gates at each stage."
        }
      ]
    }
  },
  {
    id: "init-003",
    name: "OpenConfig / gNMI Telemetry Pack",
    description: "Standardized telemetry collection using OpenConfig models and gNMI streaming for SONiC infrastructure.",
    businessValue: "high",
    technicalRisk: "medium",
    evidenceSources: 6,
    recommendedPath: "Discovery + Reference Design + Test Case Pack",
    status: "recommended",
    category: "telemetry",
    tags: ["OpenConfig", "gNMI", "Telemetry", "Monitoring", "SONiC"],
    createdAt: "2024-02-05T11:00:00Z",
    lastActivity: "2024-02-13T16:00:00Z",
    humanApprovalRequired: true,
    executionPaths: executionPathTemplates,
    overview: {
      summary: "Implements standardized telemetry collection using OpenConfig data models and gNMI streaming protocol.",
      businessCase: "Enables vendor-neutral monitoring. Provides real-time operational visibility. Supports predictive maintenance initiatives.",
      technicalScope: "OpenConfig model mapping, gNMI dial-in/dial-out, streaming telemetry collectors, and integration with monitoring platforms.",
      targetOutcome: "Production-ready telemetry infrastructure with standardized data models and streaming capabilities."
    },
    evidence: [
      {
        id: "ev-021",
        type: "community-signal",
        title: "OpenConfig Adoption Trends",
        source: "Technical Community",
        relevance: "high",
        timestamp: "2024-02-03T10:00:00Z",
        summary: "Growing adoption of OpenConfig models in enterprise deployments."
      },
      {
        id: "ev-022",
        type: "customer-request",
        title: "Streaming Telemetry Requirement",
        source: "Customer Requirements Portal",
        relevance: "high",
        timestamp: "2024-02-01T14:00:00Z",
        summary: "Customer need for real-time streaming telemetry from SONiC infrastructure."
      },
      {
        id: "ev-023",
        type: "roadmap-gap",
        title: "Telemetry Standardization Gap",
        source: "Internal Assessment",
        relevance: "high",
        timestamp: "2024-01-28T09:00:00Z",
        summary: "Current telemetry approach lacks standardization across deployments."
      },
      {
        id: "ev-024",
        type: "community-signal",
        title: "gNMI Implementation Patterns",
        source: "Public Ecosystem Signal",
        relevance: "medium",
        timestamp: "2024-01-25T11:00:00Z",
        summary: "Reference implementations for gNMI in network operating systems."
      },
      {
        id: "ev-025",
        type: "customer-request",
        title: "Predictive Maintenance Data",
        source: "Customer Requirements Portal",
        relevance: "medium",
        timestamp: "2024-01-22T13:00:00Z",
        summary: "Customer interest in telemetry data for predictive maintenance."
      },
      {
        id: "ev-026",
        type: "compliance-requirement",
        title: "Network Observability Standards",
        source: "Compliance Framework",
        relevance: "medium",
        timestamp: "2024-01-20T10:00:00Z",
        summary: "Emerging compliance requirements for network observability."
      }
    ],
    tasks: [
      {
        id: "task-021",
        title: "Map OpenConfig models to SONiC",
        status: "in-progress",
        assignee: "Engineering Team",
        priority: "high",
        dueDate: "2024-02-15"
      },
      {
        id: "task-022",
        title: "Implement gNMI server components",
        status: "todo",
        assignee: "Engineering Team",
        priority: "high",
        dueDate: "2024-02-20"
      },
      {
        id: "task-023",
        title: "Create telemetry validation tests",
        status: "todo",
        assignee: "Engineering Team",
        priority: "medium",
        dueDate: "2024-02-25"
      }
    ],
    blockers: [],
    activities: [
      {
        id: "act-021",
        timestamp: "2024-02-05T11:00:00Z",
        type: "signal",
        title: "R&D Signal Detected",
        description: "OpenConfig adoption trends and customer requests identified by R&D Radar.",
        actor: "R&D Scout Agent",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-022",
        timestamp: "2024-02-06T09:00:00Z",
        type: "recommendation",
        title: "Initiative Recommended",
        description: "AI Technical Planner recommended telemetry standardization initiative.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      }
    ],
    technicalMemo: {
      generatedAt: "2024-02-07T10:00:00Z",
      generatedBy: "AI Technical Planner",
      status: "draft",
      sections: [
        {
          title: "Executive Summary",
          content: "This initiative implements standardized telemetry using OpenConfig models and gNMI streaming for sovereign SONiC deployments."
        },
        {
          title: "Technical Scope",
          content: "OpenConfig data model mapping, gNMI server implementation, streaming telemetry collectors, and monitoring platform integration."
        }
      ]
    }
  },
  {
    id: "init-004",
    name: "OpenWiFi Validation Extension",
    description: "Extension of validation framework to support OpenWiFi access point deployments.",
    businessValue: "medium",
    technicalRisk: "medium",
    evidenceSources: 4,
    recommendedPath: "Discovery + Reference Design",
    status: "recommended",
    category: "integration",
    tags: ["OpenWiFi", "Validation", "Wireless", "Integration"],
    createdAt: "2024-02-01T09:00:00Z",
    lastActivity: "2024-02-12T14:00:00Z",
    humanApprovalRequired: true,
    executionPaths: executionPathTemplates,
    overview: {
      summary: "Extends the validation framework to cover OpenWiFi access point deployments and integration with SONiC infrastructure.",
      businessCase: "Enables unified validation across wired and wireless infrastructure. Supports converged network deployments.",
      technicalScope: "OpenWiFi provisioning validation, AP onboarding tests, wireless-to-wired integration, and performance benchmarks.",
      targetOutcome: "Comprehensive validation coverage for converged SONiC and OpenWiFi deployments."
    },
    evidence: [
      {
        id: "ev-031",
        type: "customer-request",
        title: "Converged Network Validation",
        source: "Customer Requirements Portal",
        relevance: "high",
        timestamp: "2024-01-28T10:00:00Z",
        summary: "Customer request for unified wired/wireless validation capability."
      },
      {
        id: "ev-032",
        type: "community-signal",
        title: "OpenWiFi Integration Patterns",
        source: "Technical Community",
        relevance: "medium",
        timestamp: "2024-01-25T14:00:00Z",
        summary: "Community patterns for OpenWiFi and SONiC integration."
      },
      {
        id: "ev-033",
        type: "roadmap-gap",
        title: "Wireless Validation Gap",
        source: "Internal Assessment",
        relevance: "high",
        timestamp: "2024-01-22T09:00:00Z",
        summary: "Current validation framework does not cover wireless infrastructure."
      },
      {
        id: "ev-034",
        type: "community-signal",
        title: "OpenWiFi 3.0 Feature Release",
        source: "Public Ecosystem Signal",
        relevance: "medium",
        timestamp: "2024-01-20T11:00:00Z",
        summary: "New OpenWiFi release with enhanced enterprise features."
      }
    ],
    tasks: [
      {
        id: "task-031",
        title: "Analyze OpenWiFi integration points",
        status: "done",
        assignee: "AI Technical Planner",
        priority: "high",
        dueDate: "2024-02-05"
      },
      {
        id: "task-032",
        title: "Design validation test framework",
        status: "in-progress",
        assignee: "Engineering Team",
        priority: "medium",
        dueDate: "2024-02-18"
      }
    ],
    blockers: [],
    activities: [
      {
        id: "act-031",
        timestamp: "2024-02-01T09:00:00Z",
        type: "signal",
        title: "R&D Signal Detected",
        description: "OpenWiFi community activity and customer requests identified.",
        actor: "R&D Scout Agent",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-032",
        timestamp: "2024-02-02T10:00:00Z",
        type: "recommendation",
        title: "Initiative Recommended",
        description: "AI Technical Planner recommended OpenWiFi validation extension.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      }
    ],
    technicalMemo: null
  },
  {
    id: "init-005",
    name: "Release Governance Automation",
    description: "Automated release governance workflows with approval chains, audit trails, and compliance documentation.",
    businessValue: "high",
    technicalRisk: "low",
    evidenceSources: 5,
    recommendedPath: "Discovery + Reference Design + Test Case Pack",
    status: "recommended",
    category: "governance",
    tags: ["Release", "Governance", "Compliance", "Automation"],
    createdAt: "2024-01-28T10:00:00Z",
    lastActivity: "2024-02-11T11:00:00Z",
    humanApprovalRequired: true,
    executionPaths: executionPathTemplates,
    overview: {
      summary: "Automates release governance workflows while maintaining human approval gates for critical decisions.",
      businessCase: "Reduces release cycle time by 50%. Ensures consistent compliance documentation. Provides complete audit trails.",
      technicalScope: "Approval chain automation, compliance document generation, audit trail logging, and integration with existing release factory.",
      targetOutcome: "Streamlined release governance with full audit capability and reduced manual overhead."
    },
    evidence: [
      {
        id: "ev-041",
        type: "compliance-requirement",
        title: "Release Audit Requirements",
        source: "Compliance Framework",
        relevance: "high",
        timestamp: "2024-01-26T10:00:00Z",
        summary: "New compliance requirements for release audit documentation."
      },
      {
        id: "ev-042",
        type: "customer-request",
        title: "Faster Release Cycles",
        source: "Customer Requirements Portal",
        relevance: "high",
        timestamp: "2024-01-24T14:00:00Z",
        summary: "Customer need for faster release cycles with maintained governance."
      },
      {
        id: "ev-043",
        type: "roadmap-gap",
        title: "Manual Governance Bottleneck",
        source: "Internal Assessment",
        relevance: "high",
        timestamp: "2024-01-22T09:00:00Z",
        summary: "Manual governance processes creating release bottlenecks."
      },
      {
        id: "ev-044",
        type: "community-signal",
        title: "GitOps Release Patterns",
        source: "Technical Community",
        relevance: "medium",
        timestamp: "2024-01-20T11:00:00Z",
        summary: "GitOps patterns for automated release governance."
      },
      {
        id: "ev-045",
        type: "security-advisory",
        title: "Secure Release Pipeline Guidance",
        source: "Security Feed",
        relevance: "medium",
        timestamp: "2024-01-18T10:00:00Z",
        summary: "Security guidance for automated release pipelines."
      }
    ],
    tasks: [
      {
        id: "task-041",
        title: "Document approval chain requirements",
        status: "done",
        assignee: "AI Technical Planner",
        priority: "high",
        dueDate: "2024-02-01"
      },
      {
        id: "task-042",
        title: "Design compliance document templates",
        status: "done",
        assignee: "Engineering Team",
        priority: "medium",
        dueDate: "2024-02-08"
      },
      {
        id: "task-043",
        title: "Implement audit trail logging",
        status: "in-progress",
        assignee: "Engineering Team",
        priority: "high",
        dueDate: "2024-02-15"
      }
    ],
    blockers: [],
    activities: [
      {
        id: "act-041",
        timestamp: "2024-01-28T10:00:00Z",
        type: "signal",
        title: "R&D Signal Detected",
        description: "Compliance requirements and customer requests for governance automation identified.",
        actor: "R&D Scout Agent",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-042",
        timestamp: "2024-01-29T09:00:00Z",
        type: "recommendation",
        title: "Initiative Recommended",
        description: "AI Technical Planner recommended release governance automation.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      },
      {
        id: "act-043",
        timestamp: "2024-02-02T10:00:00Z",
        type: "memo",
        title: "AI Technical Memo Generated",
        description: "Technical memo for governance automation workflow.",
        actor: "AI Technical Planner",
        actorType: "agent",
        status: "completed"
      }
    ],
    technicalMemo: {
      generatedAt: "2024-02-02T10:00:00Z",
      generatedBy: "AI Technical Planner",
      status: "approved",
      approvedBy: "Technical Lead",
      sections: [
        {
          title: "Executive Summary",
          content: "This initiative automates release governance workflows while maintaining human oversight for critical decisions."
        },
        {
          title: "Technical Scope",
          content: "Approval chain automation, compliance documentation generation, audit trail logging, and Release Factory integration."
        },
        {
          title: "Risk Assessment",
          content: "Technical Risk: LOW - Well-defined governance patterns with established tooling. Human approval gates maintained for all critical decisions."
        }
      ]
    }
  }
]
