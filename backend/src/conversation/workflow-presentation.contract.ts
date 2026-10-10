import type { TaskConsentReference } from "../agent-runtime/tools/consent.contract";
export type ConsentState = "ACTIVE" | "EXPIRED" | "REVOKED" | "SUPERSEDED" | "STALE" | "INVALID" | "UNAVAILABLE";
export interface ConsentView { type: "TASK" | "SESSION"; reference: TaskConsentReference; revision: number; state: ConsentState; reasons: string[]; revocable: boolean }
export interface ConsentPresentation {
  eligible: boolean; reasons: string[]; state: "AVAILABLE" | "AMBIGUOUS" | "UNAVAILABLE";
  selected?: ConsentView; policies: ConsentView[];
}
/** Read-only presentation; never admission or execution authority. */
export interface DownstreamWorkflowView {
  observedAt: number;
  proposal: { id: string; version: number; digest: string; revision: number; state: "READY" | "STALE"; changes?: Array<{ path: string; before: string; after: string }>; planId?: string; verification?: string[]; blocker?: string };
  approval?: { id: string; generation: number; revision: number; state: string; deadline: string | null; actionable: boolean; fingerprint?: string; blocker?: string };
  permit?: { id: string; generation: number; revision: number; state: "UNUSED" | "EXPIRED" | "CONSUMED" | "STALE"; deadline: string; blocker?: string };
  consent?: ConsentPresentation;
}
