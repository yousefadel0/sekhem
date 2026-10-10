"use client";
import React, { useEffect, useRef, useState } from "react";
import { ChangeReviewCard } from "./change-review-card";
import { submitChangeReviewDecision, restoredChangeReviewState, type ChangeSet, type ChangeReviewState, type ChangeDecision } from "@/lib/change-review";
import { decideChangeReview, getConversation } from "@/lib/sekhem-conversation";

export function ChangeReview({ changeSet, savedState, onChanged, available = true }: { changeSet: ChangeSet; savedState: unknown; available?: boolean; onChanged?: (conversationId: string) => Promise<void> }) {
  const [state, setState] = useState<ChangeReviewState>(() => restoredChangeReviewState(savedState, changeSet));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>();
  const live = useRef(true), inFlight = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => { const next = restoredChangeReviewState(savedState, changeSet); setState(old => !next.available || Number(next.revision) >= Number(old.revision ?? 0) ? next : old); }, [savedState, changeSet]);
  const decide = async (id: string, decision: ChangeDecision) => {
    if (inFlight.current || !available) return;
    inFlight.current = true; setBusy(true); setError(undefined);
    try {
      const next = await submitChangeReviewDecision(changeSet, state, id, decision, `change-decision-${crypto.randomUUID()}`, {
        current: () => live.current, decide: decideChangeReview,
        read: conversationId => getConversation(conversationId, { throwOnError: true })
      });
      if (!live.current || !next) return;
      setState(next);
      await onChanged?.(changeSet.conversationId);
    } catch (err) {
      if (live.current) { setState(old => ({ ...old, available: false })); setError(err instanceof Error ? err.message : "Change decision failed. Refresh the conversation."); }
    } finally { inFlight.current = false; if (live.current) setBusy(false); }
  };
  return <ChangeReviewCard changeSet={changeSet} state={available ? state : { ...state, available: false, reason: "Current conversation state is unavailable. Refresh to review." }} busy={busy} error={error} onDecision={(id, decision) => void decide(id, decision)} />;
}
