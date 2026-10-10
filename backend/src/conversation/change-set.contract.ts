/** Review data only. A ChangeSet is never approval or execution authority. */
export interface ReviewChange {
  id: string;
  path: string;
  scope: string;
  type: "ADDED" | "MODIFIED" | "REMOVED";
  reason: string;
  what: string;
  how: string;
  before: string;
  after: string;
  start: number;
  end: number;
  evidenceRef: string;
  beforeSha256: string;
  afterSha256: string;
  status: "PENDING" | "KEPT" | "REJECTED";
}
export interface ChangeSet {
  version: 1;
  id: string;
  digest: string;
  conversationId: string;
  userId: string;
  organizationId: string;
  projectId: string;
  workspace: { workspaceId: string; bindingVersion: number; runtimeId: string; runtimeFingerprint: string };
  source: { runId: string; sequence: number; version: number; digest: string };
  recommendation: { id: string; generation: number; acceptanceId: string };
  plan: { id: string; version: number; digest: string };
  /** Captured only when already persisted at creation; later proposals do not mutate this review. */
  proposal?: { id: string; version: number; digest: string };
  changes: ReviewChange[];
  authorization: "NOT_GRANTED";
  executionEnabled: false;
}
