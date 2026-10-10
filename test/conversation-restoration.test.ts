import assert from "node:assert/strict"
import { afterEach, beforeEach, describe, it } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AgentRunCard, EvidenceList, PlanningView } from "../components/chat/agent-run-card"
import { ChatMessageItem } from "../components/chat/chat-message-item"
import { conversationLocation, conversationRunDetails, createConversationLoader, messageAttachmentPresentation, orderConversationRuns,
  reconcileConversationSnapshot, restoredConversationMessages, selectConversationRun } from "../lib/conversation-restoration"
import { runIsActive, type AgentRunDetail } from "../lib/sekhem-agent"
import type { ConversationDetailDto } from "../lib/sekhem-conversation"
import { deduplicateAndAppendEvent, subscribeToAgentRunEvents } from "../hooks/useAgentRunEvents"
import type { AgentRunEventDto } from "../backend/src/agent-runtime/agent-run.dto"
import { AgentControlCard } from "../components/workspace/agent-control-card"

const originalFetch = globalThis.fetch
const originalApiBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
beforeEach(() => { process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api" })
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalApiBase
})
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const earlier = "2026-09-22T00:00:00.000Z", later = "2026-09-22T00:01:00.000Z"
it("restores same-version plan execution and rejects older execution snapshots", () => {
  const before = snapshot("COMPLETED", "PLAN_READY"); before.agentRuns[0].id = "planning_run_fixture"; before.agentRuns[0].planVersion = 1
  const next = clone(before), run = next.agentRuns[0]; run.status = "AWAITING_APPROVAL"; run.updatedAt = later
  run.execution = { version: 1, runId: run.id, planId: "plan", planVersion: 1, revision: 3, status: "AWAITING_APPROVAL", completedSteps: 0, totalSteps: 2,
    changes: [{ path: "index.html", before: "<span>simple</span>", after: "<span>intelligent</span>", originalHash: "a", updatedHash: "b" }] }
  const restored = reconcileConversationSnapshot(before, next)
  assert.equal(restored.agentRuns[0].status, "AWAITING_APPROVAL")
  assert.equal(reconcileConversationSnapshot(restored, before).agentRuns[0].status, "AWAITING_APPROVAL")
  const html = renderToStaticMarkup(createElement(AgentControlCard, { run: conversationRunDetails(restored)[run.id] }))
  assert.match(html, /Plan execution/); assert.match(html, /simple/); assert.match(html, /intelligent/); assert.match(html, /Runtime action approval/)
  const summary = renderToStaticMarkup(createElement(AgentRunCard, { run, detail: conversationRunDetails(restored)[run.id], onSelect() {} }))
  assert.match(summary, /Plan execution/); assert.doesNotMatch(summary, /Execution (?:unavailable|remains unavailable)/)
  const newerPlan = clone(before); newerPlan.agentRuns[0].planVersion = 2; newerPlan.agentRuns[0].updatedAt = "2026-09-22T00:02:00.000Z"
  assert.equal(reconcileConversationSnapshot(restored, newerPlan).agentRuns[0].planVersion, 2)
})
function snapshot(status: AgentRunDetail["status"] = "RUNNING", outcome: AgentRunDetail["outcome"] = null): ConversationDetailDto {
  const run: AgentRunDetail = { id: "run", projectId: "project", conversationId: "conversation", agentName: "SekhemEngineer", title: "Inspect index.html",
    status, outcome, failureReason: status === "FAILED" ? outcome ?? "FAILED" : null, progressPercent: 20, createdAt: earlier, updatedAt: earlier,
    startedAt: earlier, completedAt: runIsActive(status) ? null : later, pendingApprovals: [],
    activity: [{ id: "event", agentRunId: "run", eventType: "EVIDENCE_COLLECTED", timestamp: earlier }],
    presentation: { originatingMessageId: "message", workspace: null, executionAvailable: false, executionPerformed: false, warnings: [],
      evidence: [{ id: "source", label: "index.html", sourceType: "attachment", attachmentId: "attachment", outcome: "READ", discovered: true, read: true,
        selected: true, usedInAnswer: "UNKNOWN", truncated: false, selectionReason: "Requested source" }],
      planning: { understanding: { objective: "Inspect index.html", scope: [], constraints: [], unknowns: [], readiness: "READY_TO_PLAN" },
        plan: { readiness: outcome === "PLAN_READY" ? "PLAN_READY" : "PLAN_NOT_READY", authorization: "NOT_GRANTED", steps: outcome === "PLAN_READY" ? [
          { id: "step", type: "ANALYZE", objective: "Inspect source", purpose: "Understand", status: "PROPOSED", effect: "READ_ONLY" }] : [],
          missingInformation: outcome === "NEEDS_EVIDENCE" ? [{ id: "missing", description: "Provide workspace evidence" }] : [], stopConditions: [], successCriteria: [],
          validation: { valid: outcome === "PLAN_READY", issues: status === "FAILED" ? [{ code: outcome!, path: "$" }] : [] } } } } }
  return { id: "conversation", projectId: "project", userId: "user", title: "Inspect", status: "active", createdAt: earlier, updatedAt: earlier, metadata: {}, agentRuns: [run],
    messages: [{ id: "message", conversationId: "conversation", senderId: "user", senderType: "user", content: "", createdAt: earlier, metadata: { attachmentIds: ["attachment"] },
      attachments: [{ id: "attachment", conversationId: "conversation", userId: "user", fileName: "index.html", mimeType: "text/html", fileSize: 18, category: "doc",
        hasExtractedText: true, isScanned: false, createdAt: earlier }] },
      { id: "memo", conversationId: "conversation", senderId: "agent", senderType: "assistant", content: "Persisted result memo", createdAt: later, metadata: { agentRunId: "run", outcome } }] }
}
const envelope = (value: unknown) => Response.json({ data: value, errors: [] })

for (const phase of ["EXECUTING", "VERIFYING"] as const) {
  it(`browser reload during ${phase} restores reservation progress with GET only`, async () => {
    const saved = snapshot(), run = saved.agentRuns[0]; run.planVersion = 1;
    run.execution = { version: 1, runId: run.id, planId: "plan", planVersion: 1, revision: 8, status: "RUNNING", phase,
      completedSteps: phase === "VERIFYING" ? 1 : 0, totalSteps: 2, changes: [] };
    let reads = 0;
    globalThis.fetch = async (_url, options) => { assert.equal(options?.method ?? "GET", "GET"); reads++; return envelope(saved); };
    const restored = await createConversationLoader()(saved.id);
    assert.equal(restored?.agentRuns[0].execution?.phase, phase); assert.equal(reads, 1);
    const stale = clone(saved); stale.agentRuns[0].execution!.revision = 7;
    stale.agentRuns[0].execution!.phase = "WAITING_RUNTIME";
    assert.equal(reconcileConversationSnapshot(restored, stale).agentRuns[0].execution?.phase, phase);
  })
}

describe("P1-B conversation snapshot restoration", () => {
  it("restores exact persisted engineering plan identity and prose using GET only", async () => {
    const saved = snapshot("COMPLETED", "PLAN_READY"), run = saved.agentRuns[0];
    run.id = "planning_run_fixture"; run.planVersion = 2;
    const identity = { version: 1 as const, planId: "plan-saved", planVersion: 2, digest: "saved-digest", executionEnabled: false as const,
      sourceRunId: "understood-run", sourceConversationId: "source-chat", understandingSequence: 3, understandingDigest: "checkpoint-digest",
      workspace: { workspaceId: "bound-folder", bindingVersion: 24, runtimeId: "device", runtimeFingerprint: "fingerprint" }, evidenceReferences: [], previousPlanId: "prior-plan" };
    run.presentation!.engineeringPlan = identity;
    run.presentation!.planning!.plan.steps[0].objective = "Add a descriptive comment to the observed session validator.";
    const requests: string[] = [];
    globalThis.fetch = async (_input, init) => { requests.push(init?.method ?? "GET"); return envelope(saved) };
    for (let reload = 0; reload < 2; reload++) {
      const restored = await createConversationLoader()("conversation");
      const detail = conversationRunDetails(restored)[run.id];
      assert.deepEqual(detail.presentation?.engineeringPlan, identity);
      const html = renderToStaticMarkup(createElement(PlanningView, { planning: detail.presentation?.planning, engineeringPlan: detail.presentation?.engineeringPlan }));
      assert.match(html, /plan-saved/); assert.match(html, /Version \/ status<\/dt><dd>2 · PLAN_READY/); assert.match(html, /PLAN_READY/); assert.match(html, /descriptive comment/);
      assert.match(html, /No execution is authorized/); assert.doesNotMatch(html, /local execution is not connected/);
    }
    assert.deepEqual(requests, ["GET", "GET"]);
  })
  it("an explicit newer engineering version can plan after completion, but stale versions cannot regress it", () => {
    const old = snapshot("COMPLETED", "PLAN_READY"); old.agentRuns[0].id = "planning_run_fixture"; old.agentRuns[0].planVersion = 1;
    const fresh = clone(old); fresh.agentRuns[0].status = "PLANNING"; fresh.agentRuns[0].planVersion = 2; fresh.agentRuns[0].updatedAt = later;
    assert.equal(reconcileConversationSnapshot(old, fresh).agentRuns[0].status, "PLANNING");
    assert.equal(reconcileConversationSnapshot(fresh, old).agentRuns[0].planVersion, 2);
    fresh.agentRuns[0].planVersion = 1;
    assert.equal(reconcileConversationSnapshot(old, fresh).agentRuns[0].status, "COMPLETED");
  })
  for (const [status, outcome, label] of [["RUNNING", null, "Analyzing"], ["QUEUED", null, "Queued"],
    ["COMPLETED", "PLAN_READY", "Plan ready"], ["COMPLETED", "NEEDS_USER_INPUT", "Needs user input"],
    ["COMPLETED", "NEEDS_EVIDENCE", "Needs evidence"], ["FAILED", "PROVIDER_FAILED", "Provider failed"],
    ["FAILED", "OUTPUT_TRUNCATED", "Output truncated"], ["FAILED", "INVALID_STRUCTURED_OUTPUT", "Invalid structured output"],
    ["FAILED", "FAILED", "Failed"], ["FAILED", "BLOCKED", "Blocked"], ["PAUSED", "PAUSED", "Paused"], ["CANCELLED", "CANCELLED", "Cancelled"]] as const) {
    it(`restores and renders ${status}/${outcome} from GET with no run creation`, async () => {
      const requests: { url: string; method: string }[] = []
      globalThis.fetch = async (input, init) => { requests.push({ url: String(input), method: init?.method ?? "GET" }); return envelope(snapshot(status, outcome)) }
      // A new loader and empty view cache simulate a fresh browser session.
      const saved = await createConversationLoader()("conversation")
      assert.ok(saved)
      const restored = reconcileConversationSnapshot(undefined, clone(saved))
      const id = selectConversationRun(restored.agentRuns), detail = conversationRunDetails(restored)[id]
      const html = renderToStaticMarkup(createElement(AgentRunCard, { run: detail, detail, onSelect() {} }))
      assert.ok(html.includes(label)); assert.doesNotMatch(html, /Analysis completed/)
      assert.equal(detail.status, status); assert.equal(detail.outcome, outcome)
      assert.equal(detail.activity?.[0].id, "event")
      assert.equal(requests.length, 1); assert.equal(requests[0].method, "GET")
      assert.match(requests[0].url, /\/conversations\/conversation$/)
    })
  }
  it("restores plan, evidence, validation, missing information and memo without SSE memory", () => {
    const saved = snapshot("COMPLETED", "PLAN_READY"), detail = conversationRunDetails(saved).run
    assert.match(renderToStaticMarkup(createElement(PlanningView, { planning: detail.presentation?.planning })), /Inspect source/)
    assert.match(renderToStaticMarkup(createElement(EvidenceList, { evidence: detail.presentation!.evidence, onOpen() {} })), /READ/)
    assert.match(renderToStaticMarkup(createElement(ChatMessageItem, { message: restoredConversationMessages(saved)[1] })), /Persisted result memo/)
    assert.match(renderToStaticMarkup(createElement(PlanningView, { planning: conversationRunDetails(snapshot("COMPLETED", "NEEDS_EVIDENCE")).run.presentation?.planning })), /Provide workspace evidence/)
    assert.match(renderToStaticMarkup(createElement(PlanningView, { planning: conversationRunDetails(snapshot("FAILED", "OUTPUT_TRUNCATED")).run.presentation?.planning })), /OUTPUT_TRUNCATED/)
  })
  it("restores attachment-only messages from persisted IDs and metadata without a File or upload", () => {
    const message = clone(snapshot().messages[0])
    assert.deepEqual(messageAttachmentPresentation(message, [{ id: "local", name: "stale preview" }]), [{ id: "attachment", name: "index.html" }])
    assert.match(renderToStaticMarkup(createElement(ChatMessageItem, { message })), /index.html/)
    assert.doesNotMatch(JSON.stringify(message), /storageKey|previewUrl/)
    assert.deepEqual(messageAttachmentPresentation({ ...message, attachments: [] }, [{ id: "local", name: "stale" }]), [])
  })
  it("selects explicit valid run, then active run, then latest with an ID tie break", () => {
    const active = snapshot().agentRuns[0]
    const newer = { ...active, id: "z", status: "COMPLETED" as const, createdAt: later }
    const paused = { ...newer, id: "a", status: "PAUSED" as const }
    const runs = [paused, active, newer]
    assert.equal(selectConversationRun(runs), active.id)
    assert.equal(selectConversationRun([...runs].reverse()), active.id)
    assert.equal(selectConversationRun(runs, "a"), "a")
    assert.equal(selectConversationRun(runs, "foreign-run"), active.id)
    assert.equal(selectConversationRun([paused, newer]), "z")
    assert.deepEqual(orderConversationRuns(runs).map(run => run.id), ["z", "a", "run"])
  })
  it("keeps persisted cancellation over a late completion, stale detail and its memo", () => {
    const cancelled = snapshot("CANCELLED", "CANCELLED")
    const late = snapshot("COMPLETED", "PLAN_READY"); late.agentRuns[0].updatedAt = later
    const restored = reconcileConversationSnapshot(cancelled, late), detail = conversationRunDetails(restored).run
    assert.equal(detail.status, "CANCELLED")
    assert.equal(restoredConversationMessages(restored).some(message => message.id === "memo"), false)
    // Even an old caller passing an independently cached detail cannot replace the card's status.
    const html = renderToStaticMarkup(createElement(AgentRunCard, { run: detail, detail: conversationRunDetails(late).run, onSelect() {} }))
    assert.match(html, /data-phase="CANCELLED"/)
    assert.match(html, /Cancelled/)
    assert.doesNotMatch(html, /data-phase="PLAN_READY"/)
  })
  it("retains saved inspection conversation and checkpoints while waiting for input or after cancellation", () => {
    for (const status of ["PAUSED", "CANCELLED"] as const) {
      const saved = snapshot(status, status)
      const memo = saved.messages[1]
      saved.messages.push(
        { ...memo, id: "reply", content: "I read the session helper.", metadata: { agentRunId: "run", outcome: "IN_PROGRESS", modelConversation: true } },
        { ...memo, id: "checkpoint", metadata: { agentRunId: "run", outcome: "IN_PROGRESS", inspectionUnderstanding: true } },
        { ...memo, id: "clarification", metadata: { agentRunId: "run", outcome: "NEEDS_USER_INPUT", inspectionClarification: true } },
        { ...memo, id: "late-completion", metadata: { agentRunId: "run", outcome: "PLAN_READY" } })
      assert.deepEqual(restoredConversationMessages(saved).map(message => message.id), ["message", "memo", "reply", "checkpoint", "clarification"])
      assert.match(renderToStaticMarkup(createElement(ChatMessageItem, { message: restoredConversationMessages(saved)[2] })), /I read the session helper/)
    }
  })
  it("rejects older snapshots but accepts an explicitly resumed paused run in a newer revision", () => {
    const paused = snapshot("PAUSED", "PAUSED"), active = snapshot()
    paused.agentRuns[0].updatedAt = later
    assert.equal(reconcileConversationSnapshot(paused, active).agentRuns[0].status, "PAUSED")
    active.agentRuns[0].updatedAt = "2026-09-22T00:02:00Z"
    assert.equal(reconcileConversationSnapshot(paused, active).agentRuns[0].status, "RUNNING")
    assert.equal(reconcileConversationSnapshot(snapshot("FAILED", "OUTPUT_TRUNCATED"), snapshot()).agentRuns[0].status, "FAILED")
  })
  it("isolates out-of-order reads and late errors by conversation", async () => {
    const pending: { resolve: (value: ConversationDetailDto) => void; reject: (error: Error) => void }[] = []
    const load = createConversationLoader(async () => new Promise((resolve, reject) => pending.push({ resolve, reject })))
    const first = load("conversation"), second = load("conversation"), other = load("other")
    const finished = snapshot("COMPLETED", "PLAN_READY")
    pending[1].resolve(finished); assert.equal((await second)?.agentRuns[0].outcome, "PLAN_READY")
    pending[0].reject(new Error("late error")); assert.equal(await first, undefined)
    pending[2].resolve({ ...snapshot(), id: "other", projectId: "other-project" }); assert.equal((await other)?.projectId, "other-project")
    const stale = load("conversation"), fresh = load("conversation")
    pending[4].resolve(finished); await fresh
    pending[3].resolve(snapshot()); assert.equal(await stale, undefined)
  })
  it("rejects wrong conversation IDs and propagates current read denial", async () => {
    await assert.rejects(createConversationLoader(async () => snapshot())("foreign"), /snapshot unavailable/)
    await assert.rejects(createConversationLoader(async () => { throw Error("Forbidden") })("conversation"), /Forbidden/)
  })
  it("history reopen restores the authorized conversation's actual project and run", async () => {
    const load = createConversationLoader(async () => ({ ...snapshot(), projectId: "actual-project" }))
    const saved = await load("conversation"); assert.ok(saved)
    assert.equal(conversationLocation(saved), "/?project=actual-project&conversation=conversation")
    assert.equal(conversationRunDetails(saved).run.projectId, "actual-project")
    assert.equal(selectConversationRun(saved.agentRuns, "run-from-other-conversation"), "run")
  })
  it("reconnects to the existing run, tolerates replay, and converges through a saved terminal GET", async () => {
    let saved = snapshot(), displayed = clone(saved), eventMemory: AgentRunEventDto[] = [], refresh = Promise.resolve()
    const requests: string[] = []
    globalThis.fetch = async (input, init) => { assert.equal(init?.method ?? "GET", "GET"); requests.push(String(input)); return envelope(saved) }
    const load = createConversationLoader()
    class Source {
      static instance: Source
      listeners = new Map<string, (event: { data: string }) => void>(); closed = false
      constructor(readonly url: string) { Source.instance = this }
      addEventListener(type: string, listener: (event: { data: string }) => void) { this.listeners.set(type, listener) }
      removeEventListener(type: string) { this.listeners.delete(type) }
      close() { this.closed = true }
      emit(event: AgentRunEventDto) { this.listeners.get(event.eventType)?.({ data: JSON.stringify(event) }) }
    }
    const connect = () => subscribeToAgentRunEvents({ runId: "run", EventSourceClass: Source, onLoadingChange() {}, onError() {}, onEvent(event) {
      const next = deduplicateAndAppendEvent(eventMemory, event)
      if (next === eventMemory) return
      eventMemory = next
      refresh = load("conversation").then(value => { if (value) displayed = reconcileConversationSnapshot(displayed, value) })
    } })
    connect()(); const close = connect()
    assert.equal(Source.instance.url, "/api/agent-runs/run/events")
    saved = snapshot("FAILED", "OUTPUT_TRUNCATED")
    const event: AgentRunEventDto = { id: "terminal", agentRunId: "run", eventType: "STATUS_CHANGE", payload: { newStatus: "COMPLETED" },
      stepIndex: null, actor: "system", timestamp: new Date(later) }
    Source.instance.emit(event); await refresh
    // Even a misleading event cannot supply COMPLETED or overwrite the saved failure.
    assert.equal(displayed.agentRuns[0].outcome, "OUTPUT_TRUNCATED")
    Source.instance.emit(event); await refresh
    assert.equal(requests.length, 1); assert.equal(eventMemory.length, 1); assert.equal(Source.instance.closed, false)
    Source.instance.emit({ ...event, id: "trailing", eventType: "PLAN_EXECUTION_COMPLETED" }); await refresh
    assert.equal(eventMemory.length, 2); assert.equal(displayed.agentRuns[0].outcome, "OUTPUT_TRUNCATED")
    Source.instance.listeners.get("stream-drained")!({ data: "{}" }); assert.equal(Source.instance.closed, true)
    close()
  })
})
