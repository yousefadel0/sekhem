import type { ChangeSet } from "../backend/src/conversation/change-set.contract";
export type { ChangeSet };

/** A presentation guard, never an authorization decision. */
export function restoredChangeSet(value: unknown, conversationId: string): ChangeSet | null {
  if (!value || typeof value !== "object") return null;
  const s = value as ChangeSet;
  if (s.version !== 1 || s.conversationId !== conversationId || !s.id || !s.digest || s.executionEnabled !== false ||
    s.authorization !== "NOT_GRANTED" || !s.workspace || !s.source || !s.recommendation || !s.plan || !Array.isArray(s.changes) || s.changes.length > 32) return null;
  if (s.changes.some(c => !c || !c.id || !c.path || !c.scope || !["ADDED", "MODIFIED", "REMOVED"].includes(c.type) ||
    !["PENDING", "KEPT", "REJECTED"].includes(c.status) || [c.reason, c.what, c.how, c.before, c.after].some(t => typeof t !== "string") ||
    c.before === c.after || (c.type === "ADDED" && c.before !== "") || (c.type === "REMOVED" && c.after !== ""))) return null;
  if (new Set(s.changes.map(c => c.id)).size !== s.changes.length) return null;
  return s;
}

export type ChangeDecision = "KEEP" | "REJECT" | "PENDING";
export interface ChangeReviewState {
  available: boolean; locked?: boolean; reason?: string; changeSetId?: string; changeSetDigest?: string;
  revision?: number; decisions?: Record<string, ChangeDecision>;
}
export function restoredChangeReviewState(value: unknown, set: ChangeSet): ChangeReviewState {
  const unavailable: ChangeReviewState = { available: false, reason: "Refresh the conversation to restore current review state." };
  if (!value || typeof value !== "object") return unavailable;
  const state = value as ChangeReviewState;
  if (typeof state.available !== "boolean" || (state.locked !== undefined && typeof state.locked !== "boolean") || state.changeSetId !== set.id || state.changeSetDigest !== set.digest || !Number.isSafeInteger(state.revision) || Number(state.revision) < 0 ||
    !state.decisions || Object.keys(state.decisions).length !== set.changes.length ||
    set.changes.some(c => !["KEEP", "REJECT", "PENDING"].includes(state.decisions![c.id]))) return unavailable;
  return state;
}
export function changeDecisionBody(set: ChangeSet, state: ChangeReviewState, changeId: string, decision: ChangeDecision, requestId: string) {
  if (!restoredChangeReviewState(state, set).available || state.locked || !set.changes.some(c => c.id === changeId)) throw new Error("Change review is unavailable.");
  return { changeSetId: set.id, changeSetVersion: set.version, changeSetDigest: set.digest, changeId, decision, expectedRevision: state.revision!, requestId };
}

/** A decision is followed only by a read of authoritative conversation state. */
export async function submitChangeReviewDecision(set: ChangeSet, state: ChangeReviewState, changeId: string, decision: ChangeDecision, requestId: string,
  deps: { current: () => boolean; decide: (conversationId: string, body: ReturnType<typeof changeDecisionBody>) => Promise<unknown>;
    read: (conversationId: string) => Promise<{ id: string; messages: { id: string; metadata?: Record<string, unknown> }[] } | null> }) {
  if (!deps.current()) return null;
  await deps.decide(set.conversationId, changeDecisionBody(set, state, changeId, decision, requestId));
  if (!deps.current()) return null;
  const snapshot = await deps.read(set.conversationId);
  if (!deps.current()) return null;
  if (snapshot?.id !== set.conversationId) return { available: false, reason: "Current conversation state is unavailable." };
  return restoredChangeReviewState(snapshot.messages.find(m => m.id === set.id)?.metadata?.changeReviewState, set);
}
