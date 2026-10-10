import type { KnowledgeItemDto } from "./knowledge.dto";

const fixtureTimestamp = "2026-05-31T00:00:00.000Z";

export const knowledgeItemFixtures: KnowledgeItemDto[] = [
  {
    knowledgeItemId: "knowledge-rd-radar-csf-review-decision-001",
    sourceType: "decision",
    title: "Cybersecurity readiness signal remains under PM review",
    summary: "Reviewed R&D Radar evidence supports a structured cybersecurity readiness assessment path. Additional review is required before promotion.",
    sourceId: "pm-decision-csf-guided-risk-assessment-001",
    sourceLabel: "R&D Radar reviewed decision",
    createdAt: fixtureTimestamp,
    permissionsScope: "internal_review",
    customerSafeSummary: "A reviewed cybersecurity readiness signal is available as evidence for a controlled assessment path. Human approval remains required."
  },
  {
    knowledgeItemId: "knowledge-ai-patch-audit-decision-001",
    sourceType: "decision",
    title: "AI Patch draft review decision recorded",
    summary: "The controlled draft workspace records human review decisions while preserving review-only safety flags.",
    sourceId: "ai-patch-audit-decision-reviewed-001",
    sourceLabel: "AI Patch Assistant audit decision",
    createdAt: fixtureTimestamp,
    permissionsScope: "internal_review",
    customerSafeSummary: "A human-reviewed draft decision can be traced without applying files, changing a repository, or deploying software."
  },
  {
    knowledgeItemId: "knowledge-repository-source-adapter-readiness-001",
    sourceType: "repository_evidence",
    title: "Repository Source Adapter readiness is read-only",
    summary: "Repository evidence can be reviewed through a controlled read-only adapter. Write actions remain disabled.",
    sourceId: "repository-source-adapter-readiness-001",
    sourceLabel: "Repository Source Adapter readiness",
    createdAt: fixtureTimestamp,
    permissionsScope: "internal_review",
    customerSafeSummary: "Repository readiness evidence is available for review through a read-only connection. It does not change source control."
  }
];
