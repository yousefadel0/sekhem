export type KnowledgeItemSourceType = "document" | "repository_evidence" | "decision" | "task_report";

export type KnowledgeItemDto = {
  knowledgeItemId: string;
  sourceType: KnowledgeItemSourceType;
  title: string;
  summary: string;
  sourceId: string;
  sourceLabel: string;
  sourceUri?: string;
  createdAt: string;
  permissionsScope: string;
  customerSafeSummary: string;
};
