"use client"

import { useEffect, useMemo, useState } from "react"
import type React from "react"
import type { Initiative, RDSignal, ReleaseCandidate, SecurityFinding } from "@/lib/demo-data"
import type { Module as SekhemModule } from "@/lib/sekhem-data"
import { fetchSekhemApi, useSekhemApi } from "@/lib/sekhem-api"

type BackendModule = {
  id: string
  slug: string
  name: string
  customerFacingName?: string
  category: string
  description: string
  phase: string
  status: string
  isLocked: boolean
  lockReason?: string
}

type BackendInitiative = {
  id: string
  slug: string
  title?: string
  name: string
  description: string
  status: string
  category: Initiative["category"]
  businessValue: Initiative["businessValue"]
  technicalRisk: "low" | "medium" | "high" | "critical"
  recommendedPath: string
  evidenceSources: number
  tags: string[]
  humanApprovalRequired: boolean
  createdAt: string
  lastActivityAt: string
  overview?: Initiative["overview"]
  evidence?: {
    id: string
    type: string
    title: string
    source: string
    relevance: "low" | "medium" | "high"
    summary: string
    createdAt: string
  }[]
  executionPaths?: {
    id: string
    name: string
    description: string
    riskLevel: string
    status: string
    requiresApproval: boolean
    estimatedDuration: string
    deliverables: string[]
  }[]
  tasks?: {
    id: string
    title: string
    status: string
    assignee: string
    priority: "low" | "medium" | "high" | "critical"
    dueDate?: string
  }[]
  activity?: {
    id: string
    type: string
    title: string
    description: string
    actor: string
    actorType: "system" | "assistant" | "user"
    status: string
    createdAt: string
  }[]
  blockers?: {
    id: string
    title: string
    type: string
    severity: "low" | "medium" | "high" | "critical"
    status: string
    description: string
    createdAt: string
  }[]
  technicalMemo?: Initiative["technicalMemo"]
}

type BackendDashboard = {
  kpis?: {
    pendingApprovals: number
    activeAssistants: number
    releaseCandidates: number
  }
  rdSignals?: BackendRDSignal[]
}

type BackendRDSignal = Omit<RDSignal, "timestamp"> & { createdAt: string }

type BackendSecurityGate = {
  riskLevel: string
  status: string
  findings: {
    id: string
    severity: SecurityFinding["severity"]
    title: string
    description: string
    status: "open" | "accepted_risk" | "resolved" | "false_positive"
    owner: string
  }[]
}

type BackendApproval = {
  id: string
  type: string
  title: string
  description: string
  requestedBy: string
  priority: "critical" | "high" | "medium" | "low"
  status: string
  module: string
  requiresHumanApproval: boolean
}

type BackendBlocker = {
  id: string
  title: string
  type: string
  severity: string
  status: string
  cause: string
  owner: string
  evidence: string
  suggestedAction: string
  nextStep: string
  rollbackOption: string
  updatedAt: string
  createdAt: string
  initiativeSlug?: string
}

type BackendReleaseCandidate = {
  id: string
  version: string
  title: string
  status: string
  createdAt: string
  changeCount: number
  testsPassed: number
  testsTotal: number
  securityScore: number
  blockingIssues: number
  approvalChecklist?: { title: string; status: string; requiredRole: string }[]
  rollbackPlan?: unknown
}

export function useOverviewApiData(staticModules: SekhemModule[], staticKpis: typeof import("@/lib/sekhem-data").kpiData) {
  const apiModules = useSekhemApi<BackendModule[]>("/modules", [])
  const dashboard = useSekhemApi<BackendDashboard | null>("/projects/project-community-sonic-sovereign/dashboard", null)

  const modules = useMemo(() => mergeSekhemModules(staticModules, apiModules), [staticModules, apiModules])
  const kpiData = useMemo(
    () => ({
      ...staticKpis,
      pendingApprovals: dashboard?.kpis?.pendingApprovals ?? staticKpis.pendingApprovals,
      aiAgentsActive: dashboard?.kpis?.activeAssistants ?? staticKpis.aiAgentsActive,
      releaseCandidates: dashboard?.kpis?.releaseCandidates ?? staticKpis.releaseCandidates,
      rdSignals: dashboard?.rdSignals?.length ?? staticKpis.rdSignals
    }),
    [dashboard, staticKpis]
  )

  return { modules, kpiData }
}

export function useRDRadarApiData(staticSignals: RDSignal[], staticInitiatives: Initiative[]) {
  const apiInitiatives = useSekhemApi<BackendInitiative[]>("/initiatives", [])
  const dashboard = useSekhemApi<BackendDashboard | null>("/projects/project-community-sonic-sovereign/dashboard", null)

  return {
    rdSignals: dashboard?.rdSignals?.length ? dashboard.rdSignals.map(mapRDSignal) : staticSignals,
    initiatives: apiInitiatives.length ? apiInitiatives.map((item) => mapInitiativeSummary(item, staticInitiatives)) : staticInitiatives
  }
}

export function useInitiativesApiData(staticInitiatives: Initiative[]) {
  const apiInitiatives = useSekhemApi<BackendInitiative[]>("/initiatives", [])
  return apiInitiatives.length ? apiInitiatives.map((item) => mapInitiativeSummary(item, staticInitiatives)) : staticInitiatives
}

export function useInitiativeDetailApiData(slug: string, fallback: Initiative | undefined): Initiative | undefined {
  const [initiative, setInitiative] = useState<Initiative | undefined>(fallback)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      if (!fallback) {
        setInitiative(undefined)
        return
      }

      const [detail, tasks, activity, blockers] = await Promise.all([
        fetchSekhemApi<BackendInitiative>(`/initiatives/${slug}`),
        fetchSekhemApi<{ lanes: { tasks: BackendInitiative["tasks"] }[] }>(`/initiatives/${slug}/tasks`),
        fetchSekhemApi<BackendInitiative["activity"]>(`/initiatives/${slug}/activity`),
        fetchSekhemApi<{ blockers: BackendInitiative["blockers"] }>(`/initiatives/${slug}/blockers`)
      ])

      if (!cancelled) {
        setInitiative(detail ? mapInitiativeDetail({ ...detail, tasks: flattenTasks(tasks), activity: activity ?? detail.activity, blockers: blockers?.blockers ?? detail.blockers }, fallback) : fallback)
      }
    }

    setInitiative(fallback)
    void load()

    return () => {
      cancelled = true
    }
  }, [slug, fallback])

  return initiative
}

export function useSecurityGateApiData(staticFindings: SecurityFinding[], staticApprovals: BackendApproval[]) {
  const gate = useSekhemApi<BackendSecurityGate | null>("/security-gates/security-gate-evpn-bgp", null)
  const approvals = useSekhemApi<BackendApproval[]>("/approvals", [])

  return {
    securityFindings: gate?.findings?.length ? gate.findings.map(mapSecurityFinding) : staticFindings,
    approvals: approvals.length ? approvals : staticApprovals
  }
}

export function useBlockersApiData<T extends { id: string }>(fallback: T[]): T[] {
  const apiBlockers = useSekhemApi<BackendBlocker[]>("/blockers", [])
  return apiBlockers.length ? (apiBlockers.map(mapBlockerForPage) as unknown as T[]) : fallback
}

export function useReleaseCandidatesApiData(fallback: ReleaseCandidate[]) {
  const [candidates, setCandidates] = useState<ReleaseCandidate[]>(fallback)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      const summaries = await fetchSekhemApi<BackendReleaseCandidate[]>("/release-candidates")
      if (!summaries?.length) {
        setCandidates(fallback)
        return
      }

      const details = await Promise.all(
        summaries.map((summary) => fetchSekhemApi<BackendReleaseCandidate>(`/release-candidates/${summary.id}`))
      )

      if (!cancelled) {
        setCandidates(details.map((detail, index) => mapReleaseCandidate(detail ?? summaries[index], fallback[index])).filter(Boolean) as ReleaseCandidate[])
      }
    }

    setCandidates(fallback)
    void load()

    return () => {
      cancelled = true
    }
  }, [fallback])

  return candidates
}

export function useLockedModulesApiData<T extends { id: string; name: string; slug: string; description: string; icon: React.ElementType; lockReason: string }>(fallback: T[], iconByName: Record<string, React.ElementType>): T[] {
  const apiModules = useSekhemApi<BackendModule[]>("/modules", [])
  const locked = apiModules.filter((module) => module.isLocked)

  if (!locked.length) {
    return fallback
  }

  return locked.map((module) => {
    const staticModule = fallback.find((item) => item.name === module.customerFacingName || item.name === module.name)
    return {
      ...(staticModule ?? fallback[0]),
      id: module.slug,
      name: module.customerFacingName ?? module.name,
      slug: module.slug,
      description: module.description,
      icon: iconByName[module.customerFacingName ?? module.name] ?? staticModule?.icon ?? fallback[0].icon,
      lockReason: module.lockReason ?? staticModule?.lockReason ?? "Requires Advanced Package Activation"
    } as T
  })
}

function mergeSekhemModules(staticModules: SekhemModule[], apiModules: BackendModule[]): SekhemModule[] {
  if (!apiModules.length) {
    return staticModules
  }

  return staticModules.map((module) => {
    const apiModule = apiModules.find((item) => item.customerFacingName === module.name || item.name === module.name)
    if (!apiModule) {
      return module
    }

    return {
      ...module,
      description: apiModule.description,
      statusBadge: apiModule.isLocked ? "Future Expansion" : apiModule.status === "enabled" ? "Phase 1 Ready" : module.statusBadge,
      phase: apiModule.isLocked ? "future" : module.phase
    }
  })
}

function mapInitiativeSummary(item: BackendInitiative, fallbacks: Initiative[]): Initiative {
  const fallback = fallbacks.find((initiative) => initiative.slug === item.slug || initiative.id === item.id) ?? fallbacks[0]
  return mapInitiativeDetail(item, fallback)
}

function mapInitiativeDetail(item: BackendInitiative, fallback: Initiative): Initiative {
  return {
    ...fallback,
    id: fallback.id,
    slug: item.slug,
    name: item.name ?? item.title ?? fallback.name,
    description: item.description ?? fallback.description,
    status: hyphen(item.status) as Initiative["status"],
    category: item.category ?? fallback.category,
    businessValue: item.businessValue ?? fallback.businessValue,
    technicalRisk: item.technicalRisk === "critical" ? "high" : item.technicalRisk ?? fallback.technicalRisk,
    recommendedPath: item.recommendedPath ?? fallback.recommendedPath,
    evidenceSources: item.evidenceSources ?? fallback.evidenceSources,
    tags: item.tags?.length ? item.tags : fallback.tags,
    createdAt: item.createdAt ?? fallback.createdAt,
    lastActivity: item.lastActivityAt ?? fallback.lastActivity,
    humanApprovalRequired: item.humanApprovalRequired ?? fallback.humanApprovalRequired,
    overview: item.overview ?? fallback.overview,
    evidence: item.evidence?.length ? item.evidence.map((evidence) => ({
      id: evidence.id,
      type: hyphen(evidence.type) as Initiative["evidence"][number]["type"],
      title: evidence.title,
      source: evidence.source,
      relevance: evidence.relevance,
      timestamp: evidence.createdAt,
      summary: evidence.summary
    })) : fallback.evidence,
    executionPaths: item.executionPaths?.length ? item.executionPaths.map((path) => ({
      id: path.id,
      name: path.name,
      description: path.description,
      riskLevel: hyphen(path.riskLevel) as Initiative["executionPaths"][number]["riskLevel"],
      status: hyphen(path.status) as Initiative["executionPaths"][number]["status"],
      requiresApproval: path.requiresApproval,
      estimatedDuration: path.estimatedDuration,
      deliverables: path.deliverables
    })) : fallback.executionPaths,
    tasks: item.tasks?.length ? item.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: hyphen(task.status) as Initiative["tasks"][number]["status"],
      assignee: task.assignee,
      priority: task.priority === "critical" ? "high" : task.priority,
      dueDate: task.dueDate ?? fallback.tasks[0]?.dueDate ?? ""
    })) : fallback.tasks,
    activities: item.activity?.length ? item.activity.map((activity) => ({
      id: activity.id,
      timestamp: activity.createdAt,
      type: hyphen(activity.type) as Initiative["activities"][number]["type"],
      title: activity.title,
      description: activity.description,
      actor: activity.actor,
      actorType: activity.actorType === "assistant" ? "agent" : activity.actorType,
      status: hyphen(activity.status) as Initiative["activities"][number]["status"]
    })) : fallback.activities,
    blockers: item.blockers?.length ? item.blockers.map((blocker) => ({
      id: blocker.id,
      title: blocker.title,
      type: blocker.type === "security" ? "security-finding" : "technical-constraint",
      severity: blocker.severity === "low" ? "medium" : blocker.severity,
      status: blocker.status === "resolved" ? "resolved" : blocker.status === "investigating" ? "investigating" : "open",
      description: blocker.description,
      createdAt: blocker.createdAt
    })) : fallback.blockers,
    technicalMemo: item.technicalMemo ?? fallback.technicalMemo
  }
}

function mapRDSignal(signal: BackendRDSignal): RDSignal {
  return {
    ...signal,
    timestamp: signal.createdAt
  }
}

function mapSecurityFinding(finding: BackendSecurityGate["findings"][number]): SecurityFinding {
  return {
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    source: "Security Gate",
    status: finding.status === "resolved" ? "mitigated" : finding.status === "accepted_risk" ? "accepted" : finding.status === "false_positive" ? "false-positive" : "open",
    affectedComponent: finding.owner,
    discoveredAt: new Date().toISOString()
  }
}

function mapBlockerForPage(blocker: BackendBlocker) {
  return {
    id: blocker.id,
    title: blocker.title,
    type: labelize(blocker.type),
    severity: blocker.severity,
    status: hyphen(blocker.status),
    cause: blocker.cause,
    affectedComponent: blocker.owner,
    affectedInitiative: blocker.initiativeSlug ? "EVPN BGP Validation Pack" : null,
    initiativeId: blocker.initiativeSlug ?? null,
    evidence: blocker.evidence,
    suggestedAction: blocker.suggestedAction,
    nextStep: blocker.nextStep,
    rollbackOption: blocker.rollbackOption,
    assignee: blocker.owner,
    createdAt: blocker.createdAt,
    updatedAt: blocker.updatedAt
  }
}

function mapReleaseCandidate(candidate: BackendReleaseCandidate | undefined, fallback: ReleaseCandidate | undefined): ReleaseCandidate | null {
  if (!candidate && !fallback) {
    return null
  }

  return {
    ...(fallback ?? {
      id: candidate?.id ?? "release-candidate",
      version: candidate?.version ?? "0.1.0",
      name: candidate?.title ?? "Release Candidate",
      status: "review",
      createdAt: candidate?.createdAt ?? new Date().toISOString(),
      targetRelease: "",
      artifactHash: "seed-backed",
      changeCount: 0,
      testsPassed: 0,
      testsTotal: 0,
      securityScore: 0,
      blockingIssues: 0,
      approvals: [],
      rollbackPlan: false
    }),
    id: candidate?.id ?? fallback?.id ?? "",
    version: candidate?.version ?? fallback?.version ?? "",
    name: candidate?.title ?? fallback?.name ?? "",
    status: candidate?.status === "security_review" || candidate?.status === "approval_pending" ? "review" : hyphen(candidate?.status ?? fallback?.status ?? "review") as ReleaseCandidate["status"],
    createdAt: candidate?.createdAt ?? fallback?.createdAt ?? "",
    changeCount: candidate?.changeCount ?? fallback?.changeCount ?? 0,
    testsPassed: candidate?.testsPassed ?? fallback?.testsPassed ?? 0,
    testsTotal: candidate?.testsTotal ?? fallback?.testsTotal ?? 0,
    securityScore: candidate?.securityScore ?? fallback?.securityScore ?? 0,
    blockingIssues: candidate?.blockingIssues ?? fallback?.blockingIssues ?? 0,
    approvals: candidate?.approvalChecklist?.length ? candidate.approvalChecklist.map((item) => ({
      role: item.requiredRole,
      approved: item.status === "passed",
      approver: item.status === "passed" ? item.requiredRole : undefined
    })) : fallback?.approvals ?? [],
    rollbackPlan: Boolean(candidate?.rollbackPlan ?? fallback?.rollbackPlan)
  }
}

function flattenTasks(tasks: { lanes: { tasks: BackendInitiative["tasks"] }[] } | null): BackendInitiative["tasks"] {
  return tasks?.lanes.flatMap((lane) => lane.tasks ?? []) ?? undefined
}

function hyphen(value: string): string {
  return value.replace(/_/g, "-")
}

function labelize(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}
