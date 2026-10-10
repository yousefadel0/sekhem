import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deduplicateAndAppendEvent,
  isTerminalEvent,
  subscribeToAgentRunEvents,
  TERMINAL_STATUSES,
} from "../hooks/useAgentRunEvents";
import type { AgentRunEventDto } from "@/backend/src/agent-runtime/agent-run.dto";

class MockEventSource {
  public url: string;
  public options: any;
  public listeners = new Map<string, Set<EventListener>>();
  public closed = false;

  constructor(url: string, options?: any) {
    this.url = url;
    this.options = options;
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, event: any) {
    const list = this.listeners.get(type);
    if (list) {
      for (const listener of list) {
        listener(event);
      }
    }
  }
}

describe("Frontend AgentRun SSE event handling and lifecycle", () => {
  const baseEvent: AgentRunEventDto = {
    id: "ev_1",
    agentRunId: "run_test_1",
    stepIndex: null,
    eventType: "STATUS_CHANGE",
    actor: "system",
    payload: { previousStatus: null, newStatus: "QUEUED" },
    timestamp: new Date(),
  };

  it("deduplicates events by event ID", () => {
    const ev1: AgentRunEventDto = { ...baseEvent, id: "ev_1" };
    const ev2: AgentRunEventDto = { ...baseEvent, id: "ev_2", eventType: "THOUGHT", payload: { thought: "Planning" } };
    const evDuplicate: AgentRunEventDto = { ...baseEvent, id: "ev_1", payload: { newStatus: "QUEUED" } };

    let state: AgentRunEventDto[] = [];
    state = deduplicateAndAppendEvent(state, ev1);
    assert.equal(state.length, 1);
    assert.equal(state[0].id, "ev_1");

    // Adding ev2 with different id -> appends
    state = deduplicateAndAppendEvent(state, ev2);
    assert.equal(state.length, 2);
    assert.equal(state[1].id, "ev_2");

    // Adding duplicate with same id "ev_1" -> ignored, length remains 2
    state = deduplicateAndAppendEvent(state, evDuplicate);
    assert.equal(state.length, 2);
    assert.equal(state[0].id, "ev_1");
    assert.equal(state[1].id, "ev_2");
  });

  it("subscribes to actual understanding, evidence, plan, approval and execution-boundary events", () => {
    const instanceRef: { current?: MockEventSource } = {};
    class Source extends MockEventSource { constructor(url: string) { super(url); instanceRef.current = this; } }
    const received: string[] = [];
    const close = subscribeToAgentRunEvents({ runId: "run_test_1", EventSourceClass: Source,
      onEvent: event => received.push(event.eventType), onError: () => assert.fail("unexpected error"), onLoadingChange: () => {} });
    const domainEvents = ["UNDERSTANDING_STARTED", "CONTEXT_RESOLVED", "EVIDENCE_REQUESTED", "EVIDENCE_COLLECTED", "PLAN_CREATED", "PLAN_VALIDATED", "APPROVAL_REQUESTED", "TOOL_BLOCKED", "EXECUTION_BLOCKED",
      "EXECUTION_PERMIT_CREATED", "EXECUTION_DISPATCHED", "EXECUTION_STARTED", "EXECUTION_OUTPUT", "VERIFICATION_STARTED", "VERIFICATION_SUCCEEDED", "VERIFICATION_FAILED", "EXECUTION_SUCCEEDED", "EXECUTION_FAILED", "EXECUTION_CANCELLED", "EXECUTION_TIMED_OUT", "EXECUTION_OUTCOME_UNKNOWN"];
    for (const eventType of domainEvents) instanceRef.current!.emit(eventType, { data: JSON.stringify({ ...baseEvent, id: eventType, eventType }) });
    assert.deepEqual(received, domainEvents); close();
  });

  it("identifies terminal status transitions correctly", () => {
    assert.deepEqual(
      Array.from(TERMINAL_STATUSES),
      ["COMPLETED", "FAILED", "CANCELLED"],
      "Terminal statuses must match the architectural contract"
    );

    // Terminal statuses
    for (const status of ["COMPLETED", "FAILED", "CANCELLED"]) {
      const event: AgentRunEventDto = {
        ...baseEvent,
        id: `ev_term_${status}`,
        eventType: "STATUS_CHANGE",
        payload: { newStatus: status },
      };
      assert.equal(isTerminalEvent(event), true, `Should identify ${status} as terminal`);

      const eventAltKey: AgentRunEventDto = {
        ...baseEvent,
        id: `ev_term_alt_${status}`,
        eventType: "STATUS_CHANGE",
        payload: { status },
      };
      assert.equal(isTerminalEvent(eventAltKey), true, `Should identify status ${status} as terminal`);
    }

    // Active (non-terminal) statuses
    for (const status of ["QUEUED", "PLANNING", "AWAITING_APPROVAL", "RUNNING", "PAUSED"]) {
      const event: AgentRunEventDto = {
        ...baseEvent,
        id: `ev_act_${status}`,
        eventType: "STATUS_CHANGE",
        payload: { newStatus: status },
      };
      assert.equal(isTerminalEvent(event), false, `Should NOT identify ${status} as terminal`);
    }

    // Non-STATUS_CHANGE events are never terminal transitions
    const nonStatusEvents: AgentRunEventDto[] = [
      { ...baseEvent, eventType: "THOUGHT", payload: { message: "thinking" } },
      { ...baseEvent, eventType: "PROGRESS", payload: { progressPercent: 100 } },
      { ...baseEvent, eventType: "TOOL_CALL", payload: { tool: "test" } },
      { ...baseEvent, eventType: "TOOL_RESULT", payload: { result: "ok" } },
      { ...baseEvent, eventType: "LOG", payload: { text: "log" } },
    ];
    for (const ev of nonStatusEvents) {
      assert.equal(isTerminalEvent(ev), false, `Event type ${ev.eventType} must not be terminal`);
    }
  });

  it("exercises subscribeToAgentRunEvents directly: drains replay after terminal event and prevents reconnect loop", () => {
    const receivedEvents: AgentRunEventDto[] = [];
    let receivedError: Error | null = null;
    let loadingState = true;
    const mockRef: { current: MockEventSource | null } = { current: null };

    class CustomMockEventSource extends MockEventSource {
      constructor(url: string, options?: any) {
        super(url, options);
        mockRef.current = this;
      }
    }

    const unsubscribe = subscribeToAgentRunEvents({
      runId: "run-live-test",
      onEvent: (ev) => receivedEvents.push(ev),
      onError: (err) => { receivedError = err; },
      onLoadingChange: (loading) => { loadingState = loading; },
      EventSourceClass: CustomMockEventSource as any,
    });

    assert.ok(mockRef.current !== null, "Must instantiate EventSource");
    const es = mockRef.current as MockEventSource;
    assert.equal(es.url, "/api/agent-runs/run-live-test/events");
    assert.equal(es.options?.withCredentials, true);

    // 1. Emit active RUNNING status change
    const runningEvent: AgentRunEventDto = {
      ...baseEvent,
      id: "ev_running",
      agentRunId: "run-live-test",
      eventType: "STATUS_CHANGE",
      payload: { newStatus: "RUNNING" },
    };
    es.emit("STATUS_CHANGE", { data: JSON.stringify(runningEvent) });

    assert.equal(receivedEvents.length, 1);
    assert.equal(receivedEvents[0].id, "ev_running");
    assert.equal(es.closed, false, "Must not close EventSource on non-terminal status");
    assert.equal(loadingState, false, "Loading state must be set to false");

    // 2. Emit terminal COMPLETED status change
    const completedEvent: AgentRunEventDto = {
      ...baseEvent,
      id: "ev_completed",
      agentRunId: "run-live-test",
      eventType: "STATUS_CHANGE",
      payload: { newStatus: "COMPLETED" },
    };
    es.emit("STATUS_CHANGE", { data: JSON.stringify(completedEvent) });

    assert.equal(receivedEvents.length, 2);
    assert.equal(receivedEvents[1].id, "ev_completed");
    assert.equal(es.closed, false, "Terminal status must not bypass durable replay drain");
    es.emit("STATUS_CHANGE", { data: JSON.stringify({ ...completedEvent, id: "ev_final", seq: 3, payload: { newStatus: "COMPLETED", outcome: "COMPLETED" } }) });
    assert.equal(receivedEvents.length, 3);
    assert.equal(receivedEvents[2].id, "ev_final");
    assert.equal(es.closed, false);
    es.emit("stream-drained", { data: "{}" });
    assert.equal(es.closed, true, "Only server replay-drained confirmation closes a terminal stream");

    // 3. Emit browser 'error' event as a consequence of closure
    es.emit("error", new Event("error"));
    assert.equal(receivedError, null, "Must suppress error event and prevent reconnect loops after terminal closure");

    // 4. Clean unsubscribe
    unsubscribe();
    assert.equal(es.listeners.get("STATUS_CHANGE")?.size ?? 0, 0, "All event listeners must be removed on cleanup");
  });

  it("propagates connection errors during active streams", () => {
    let capturedError: Error | null = null;
    const mockRef: { current: MockEventSource | null } = { current: null };

    class CustomMockEventSource extends MockEventSource {
      constructor(url: string, options?: any) {
        super(url, options);
        mockRef.current = this;
      }
    }

    subscribeToAgentRunEvents({
      runId: "run-err-test",
      onEvent: () => {},
      onError: (err) => { capturedError = err; },
      onLoadingChange: () => {},
      EventSourceClass: CustomMockEventSource as any,
    });

    assert.ok(mockRef.current !== null);
    const es = mockRef.current as MockEventSource;

    // Trigger error during active stream
    es.emit("error", new Event("error"));
    assert.ok(capturedError !== null, "Error must be reported during active stream");
    assert.equal((capturedError as any)?.message, "SSE connection error");
  });
});
