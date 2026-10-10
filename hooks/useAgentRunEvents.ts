"use client";

import { useEffect, useState, useRef } from 'react';
import type { AgentRunEventDto } from '@/backend/src/agent-runtime/agent-run.dto';

export const SSE_EVENT_TYPES: string[] = [
  'EXACT_PROPOSAL_READY', 'EXACT_PROPOSAL_APPROVAL_REQUESTED', 'EXACT_PROPOSAL_APPROVED', 'EXACT_PROPOSAL_DENIED',
  'EXACT_PROPOSAL_CANCELLED', 'EXACT_EXECUTION_PERMIT_CREATED', 'MODEL_OUTPUT_DIAGNOSTIC', 'WORKSPACE_READ_AUTHORIZED',
  'PLAN_EXECUTION_REQUESTED', 'PLAN_EXECUTION_BLOCKED', 'PLAN_EXECUTION_COMPLETED', 'PLAN_EXECUTION_FAILED', 'STEP_COMPLETED',
  'INSPECTION_STATE_CHANGED',
  'INSPECTION_REASONING_ATTEMPT', 'INSPECTION_REASONING_SETTLED',
  'UNDERSTANDING_CHECKPOINT',
  'message',
  'THOUGHT',
  'TOOL_CALL',
  'TOOL_RESULT',
  'STATUS_CHANGE',
  'ERROR',
  'LOG',
  'PROGRESS',
  'STEERING_SUBMITTED',
  'STEERING_CONSUMED',
  'UNDERSTANDING_STARTED', 'UNDERSTANDING_COMPLETED', 'CONTEXT_RESOLVED',
  'EVIDENCE_REQUESTED', 'EVIDENCE_COLLECTED', 'PLAN_CREATED', 'PLAN_VALIDATED',
  'TOOL_REQUESTED', 'TOOL_AUTHORIZATION_CHECKED', 'TOOL_BLOCKED',
  'PLAN_READY', 'DECISION_STARTED', 'ACTION_PROPOSED', 'AUTHORIZATION_PENDING', 'AUTHORIZATION_EVALUATED',
  'APPROVED', 'REVALIDATION_STARTED', 'REVALIDATION_FAILED', 'EXECUTION_INTENT_CREATED', 'CONTROL_STATE_CHANGED',
  'APPROVAL_REQUESTED', 'APPROVAL_GRANTED', 'APPROVAL_DENIED', 'APPROVAL_EXPIRED', 'APPROVAL_CANCELLED',
  'CAPABILITY_SELECTED', 'VERIFICATION_REQUIRED',
  'EXECUTION_REQUESTED', 'EXECUTION_BLOCKED', 'EXECUTION_APPROVAL_REQUIRED',
  'EXECUTION_STARTED', 'EXECUTION_COMPLETED', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED',
  'EXECUTION_PERMIT_CREATED', 'EXECUTION_DISPATCHED', 'EXECUTION_OUTPUT', 'EXECUTION_SUCCEEDED', 'EXECUTION_TIMED_OUT', 'EXECUTION_OUTCOME_UNKNOWN',
  'VERIFICATION_STARTED', 'VERIFICATION_SUCCEEDED', 'VERIFICATION_FAILED',
];

export const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

/**
 * Deduplicate events by event ID and append new events.
 */
export function deduplicateAndAppendEvent(
  prev: AgentRunEventDto[],
  newEvent: AgentRunEventDto,
): AgentRunEventDto[] {
  if (prev.some((item) => item.id === newEvent.id)) {
    return prev;
  }
  return [...prev, newEvent];
}

/**
 * Check whether an event signals a terminal transition.
 */
export function isTerminalEvent(event: AgentRunEventDto): boolean {
  if (event.eventType === 'PLAN_EXECUTION_COMPLETED' || event.eventType === 'PLAN_EXECUTION_FAILED' || event.eventType === 'PLAN_EXECUTION_CANCELLED') {
    return true;
  }
  if (event.eventType === 'INSPECTION_STATE_CHANGED' && event.payload && typeof event.payload === 'object') {
    const state = String((event.payload as Record<string, unknown>).state);
    return state === 'PARTIAL' || TERMINAL_STATUSES.has(state);
  }
  if (event.eventType === 'STATUS_CHANGE' && event.payload && typeof event.payload === 'object') {
    const payload = event.payload as Record<string, unknown>;
    const targetStatus = (payload.status || payload.newStatus) as string | undefined;
    return !!targetStatus && TERMINAL_STATUSES.has(targetStatus);
  }
  return false;
}

export interface AgentRunEventsSubscriptionOptions {
  runId: string;
  onEvent: (event: AgentRunEventDto) => void;
  onError: (error: Error) => void;
  onLoadingChange: (loading: boolean) => void;
  EventSourceClass?: any;
}

/**
 * Low-level SSE subscription manager for an AgentRun.
 * Handles EventSource lifecycle, event deduplication/dispatch, terminal status closure,
 * and reconnect loop suppression.
 */
export function subscribeToAgentRunEvents({
  runId,
  onEvent,
  onError,
  onLoadingChange,
  EventSourceClass = typeof EventSource !== 'undefined' ? EventSource : undefined,
}: AgentRunEventsSubscriptionOptions): () => void {
  if (!runId || !EventSourceClass) {
    onLoadingChange(false);
    return () => {};
  }

  let isTerminal = false;
  let consecutiveErrors = 0;
  const url = `/api/agent-runs/${runId}/events`;
  // Native EventSource automatically sends cookies (session) and Last-Event-ID on reconnect.
  const es = new EventSourceClass(url, { withCredentials: true });

  const handleMessage = (e: MessageEvent) => {
    try {
      const data: AgentRunEventDto = typeof e.data === 'string' ? JSON.parse(e.data) : (e.data as AgentRunEventDto);
      consecutiveErrors = 0;
      onEvent(data);
      onLoadingChange(false);

      // A terminal event is not the end of delivery. Keep trailing events and
      // transient reconnects until the server explicitly confirms its drain.
    } catch (parseErr) {
      console.error('Failed to parse SSE event', parseErr);
    }
  };

  const handleError = (e: any) => {
    if (isTerminal) {
      // Stream completed normally on terminal state; do not treat as error or reconnect
      onLoadingChange(false);
      es.close();
      return;
    }
    console.error('SSE connection event/error', e);
    consecutiveErrors++;
    if (consecutiveErrors >= 3) es.close();
    onError(new Error(consecutiveErrors >= 3 ? 'Live updates paused after repeated connection failures. Refresh the conversation to restore its saved state.' : 'SSE connection error'));
    onLoadingChange(false);
  };

  SSE_EVENT_TYPES.forEach((evt) => es.addEventListener(evt, handleMessage));
  const drained = () => { isTerminal = true; es.close(); onLoadingChange(false); };
  es.addEventListener('stream-drained', drained);
  es.addEventListener('error', handleError);

  return () => {
    SSE_EVENT_TYPES.forEach((evt) => es.removeEventListener(evt, handleMessage));
    es.removeEventListener('stream-drained', drained);
    es.removeEventListener('error', handleError);
    es.close();
  };
}

/**
 * useAgentRunEvents – React hook subscribing to SSE stream for a given AgentRun.
 */
export function useAgentRunEvents(runId: string) {
  const [events, setEvents] = useState<AgentRunEventDto[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setEvents([]);

    return subscribeToAgentRunEvents({
      runId,
      onEvent: (data) => {
        setError(null);
        setEvents((prev) => deduplicateAndAppendEvent(prev, data));
      },
      onError: (err) => setError(err),
      onLoadingChange: (loading) => setIsLoading(loading),
    });
  }, [runId]);

  return { events, error, isLoading };
}
