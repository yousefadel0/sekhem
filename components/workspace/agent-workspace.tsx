"use client"
import { useEffect, useState, type ReactNode } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { ArrowUpRight, Bot, Check, ChevronRight, Circle, FileCode2, FileText, Info, Radio, ShieldCheck, TriangleAlert } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SourceEditor } from "./source-editor"
import { EvidenceList, PlanningView } from "@/components/chat/agent-run-card"
import { activityLabel, runTimeline, runTone } from "@/lib/workspace-presentation"
import { evidenceDisplayStatus, runActivity, type AgentRunDetail, type AgentActivity, type AgentActivityDetails, type WorkspaceBinding, type WorkspaceFile } from "@/lib/sekhem-agent"
import { TechnicalPanel, SekhemMark } from "./sekhem-primitives"
import { AgentControlCard } from "./agent-control-card"
import type { WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"

export function RunStatusBadge({ run }: { run: AgentRunDetail }) {
  return <span className={`run-status tone-${runTone(run)}`} role="status"><span className="status-dot" />{runActivity(run, run.activity?.at(-1)?.eventType, run.presentation?.planning)}</span>
}

export function AgentRunTimeline({ run, events }: { run: AgentRunDetail; events: AgentActivity[] }) {
  return <ol className="agent-timeline" aria-label="Recorded run milestones">{runTimeline(run, events).map(stage => <li key={stage.label} data-state={stage.state}>
    <span className="timeline-node" aria-hidden="true">{stage.state === "recorded" ? <Check size={13} /> : stage.state === "attention" ? <TriangleAlert size={12} /> : <Circle size={8} />}</span>
    <strong>{stage.label}</strong><span>{stage.detail}</span>
  </li>)}</ol>
}

/** Bounded safe per-event details; only fields present in the snapshot are shown. */
export function ActivityDetails({ runId, details }: { runId: string; details?: AgentActivityDetails }) {
  if (!details || !Object.keys(details).length) return null
  const rows = [["Run ID", runId], ["Status", details.status], ["Reason", details.reason], ["Diagnostic", details.diagnostic],
    ["Receipt", details.receipt], ["Approval", details.approval], ["Reference", details.reference]].filter(([, value]) => Boolean(value))
  return <dl className="activity-details">
    {rows.map(([label, value]) => <div key={label as string}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>
}

export function ActivityPanel({ events, streamStatus, compact = false }: { events: AgentActivity[]; streamStatus: string; compact?: boolean }) {
  return <section className={`activity-panel ${compact ? "is-compact" : ""}`} aria-label="Run activity">
    <div className="section-heading"><h3>{streamStatus === "LIVE" ? "Live activity" : "Run activity"}</h3><span className={`stream-state ${streamStatus === "LIVE" ? "is-live" : ""}`}><Radio size={12} />{streamStatus}</span></div>
    {events.length === 0 && <p className="panel-empty">No saved activity yet. Updates will appear as the backend records them.</p>}
    {events.length >= 100 && <p className="panel-caption">Latest 100 saved events</p>}
    <ol className="activity-list">{events.map(event => <li key={event.id} title={event.eventType}>
      <details><summary><span className="activity-node" /><time dateTime={new Date(event.timestamp).toISOString()}>{new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span>{activityLabel(event.eventType, event.payload)}</span></summary>
        <ActivityDetails runId={event.agentRunId} details={event.details} />
      </details></li>)}</ol>
    {!compact && <p className="panel-caption">Saved run records determine the result. Live updates refresh these records.</p>}
  </section>
}

function RunFiles({ run, onOpen, compact = false }: { run?: AgentRunDetail; onOpen: (binding: WorkspaceBinding, path: string) => void; compact?: boolean }) {
  const evidence = run?.presentation?.evidence.filter(item => item.sourceType === "workspace" || item.sourceType === "attachment") ?? []
  return <section className="run-files" aria-label="Files involved in this run"><div className="section-heading"><h3>{evidence.length} file {evidence.length === 1 ? "receipt" : "receipts"}</h3><span className="panel-caption">{evidence.filter(item => item.read).length} read</span></div>
    {!evidence.length && <p className="panel-empty">No file receipts recorded for this run.</p>}
    {evidence.map(item => <div className="run-file-row" key={item.id}><FileCode2 size={14} aria-hidden="true" />
      {item.sourceType === "workspace" && item.relativePath && run?.presentation?.workspace ? <button type="button" title={item.relativePath} onClick={() => onOpen(run.presentation!.workspace!, item.relativePath!)}>{item.relativePath}</button> : <span title={item.label}>{item.label}</span>}
      <span className={`evidence-status ${item.read ? "is-read" : ""}`}>{evidenceDisplayStatus(item)}</span>
      {!compact && <p>{item.selectionReason}{item.truncated ? ` · ${evidenceDisplayStatus(item)}` : ""}</p>}
    </div>)}
  </section>
}

export function AgentRunPanel({ run, events, streamStatus, onOpen, onTab, onPrompt, loading, onControlChanged, runtime }: {
  run?: AgentRunDetail; events: AgentActivity[]; streamStatus: string; onOpen: (binding: WorkspaceBinding, path: string) => void;
  onTab: (tab: string) => void; onPrompt: (prompt: string) => void; loading: boolean
  runtime?: WorkspaceRuntimeState; onControlChanged?: () => Promise<void>
}) {
  if (!run) return <TechnicalPanel className="agent-empty" label="Agent workspace">
    <div className="empty-kicker"><span className="status-dot" />YOUR ENGINEERING WORKSPACE</div><SekhemMark size={58} />
    <h1>From a question<br />to a considered plan.</h1><p>Bring your project into focus. Ask SEKHEM to inspect the workspace, connect the evidence, and propose the next steps.</p>
    <div className="empty-workflow"><span>Understand</span><ChevronRight size={14} /><span>Inspect</span><ChevronRight size={14} /><span>Plan</span></div>
    {loading ? <p role="status">Restoring saved conversation…</p> : <div className="workspace-starters">
      {[["Explore the project", "Analyze the project"], ["Inspect authentication", "Inspect authentication in this workspace"], ["Read a source file", "Read package.json"]].map(([label, prompt]) => <button type="button" key={label} onClick={() => onPrompt(prompt)}><FileCode2 size={17} /><span>{label}</span><ArrowUpRight size={15} /></button>)}
    </div>}
    <div className="execution-boundary"><ShieldCheck size={15} /><span>Runtime inspections require a verified workspace and approval.</span></div>
  </TechnicalPanel>
  // Runtime actions have their own authoritative receipt; do not duplicate a generic
  // engineering-plan outcome that lacks that receipt on older conversation snapshots.
  if (run.id.startsWith("rtrun_")) return <div className="agent-run-stack">
    {run.runtimeActionReceipt && <p className="panel-caption">Saved action target: {run.runtimeActionReceipt.target} · {runActivity(run)}</p>}
    <AgentControlCard runtime={runtime} run={run} onChanged={onControlChanged} />
    <details><summary>Run identity / activity · {run.status}</summary><p className="run-id">{run.id}</p><ActivityPanel events={events} streamStatus={streamStatus} /></details>
  </div>
  const planning = run.presentation?.planning
  const label = runActivity(run, events.at(-1)?.eventType, planning)
  return <div className="agent-run-stack">
    <AgentControlCard runtime={runtime} run={run} onChanged={onControlChanged} />
    <TechnicalPanel className="agent-operation" label={`Agent operation ${run.id}`}>
      <div className="operation-heading"><div><div className="empty-kicker">AGENT RUN</div><h1>{run.inspection ? "Workspace inspection" : "Agent operation"}</h1><details className="panel-caption"><summary>Requested task</summary><p>{planning?.understanding.objective || run.title}</p></details><p className="run-id">{run.id}</p></div><RunStatusBadge run={run} /></div>
      <AgentRunTimeline run={run} events={events} />
      <div className={`current-step tone-${runTone(run)}`}><span className="step-icon">{runTone(run) === "error" ? <TriangleAlert size={20} /> : <Bot size={20} />}</span><div><span className="panel-caption">{["COMPLETED", "FAILED", "CANCELLED"].includes(run.status) ? "Recorded result" : "Current state"}</span><strong>{label}</strong><p>{run.failureReason || (run.inspection ? `Inspection checkpoint: ${run.inspection.understanding?.status ?? "Not yet certified"}` : planning ? `Understanding: ${planning.understanding.readiness} · Plan: ${planning.plan.readiness}` : "Waiting for the backend to record understanding and evidence.")}</p></div><button type="button" className="technical-button" onClick={() => onTab("activity")}>View details<ChevronRight size={13} /></button></div>
      <div className="operation-data"><RunFiles run={run} onOpen={onOpen} compact /><ActivityPanel events={events} streamStatus={streamStatus} compact /></div>
      <div className="operation-meta"><span>{run.inspection?.workspace.name ?? run.presentation?.workspace?.name ?? run.runtimeActionReceipt?.target ?? "Workspace not recorded in this run"}</span><time dateTime={run.updatedAt ?? run.createdAt}>Updated {new Date(run.updatedAt ?? run.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>
    </TechnicalPanel>
    <TechnicalPanel className="plan-summary"><div><Info size={17} className="text-lime" /><strong>Understanding &amp; Plan</strong><span>{run.inspection && !run.presentation?.engineeringPlan ? "Inspection only · No engineering plan" : planning?.plan.readiness ?? "Not available yet"}</span></div><button type="button" className="technical-button" onClick={() => onTab("plan")}>Open full view<ArrowUpRight size={14} /></button></TechnicalPanel>
    {!run?.execution && !run?.inspection && !run?.id.startsWith("rtrun_") && <div className="execution-boundary"><ShieldCheck size={15} /><span>No execution record is attached to this run. Execution requires a reviewed proposal and authorization.</span></div>}
  </div>
}

export function FilePanel({ file, status, error, run, onOpen, onDirty, onSave, savedContent }: { savedContent?: string; onSave?: (original: string, draft: string) => Promise<void>; onDirty?: (dirty: boolean) => void; file: WorkspaceFile | null; status: string; error: string | null; run?: AgentRunDetail; onOpen: (binding: WorkspaceBinding, path: string) => void }) {
  return <div className="file-panel"><div className="section-heading"><h2><FileText size={17} />{file?.fileName ?? "Source viewer"}</h2><span className="evidence-status">SOURCE · {status}</span></div>
    {error && <p role="alert" className="workspace-notice">{error}</p>}
    {file?.runtimeReceipt && <details className="panel-caption break-all"><summary>Verified source details</summary><p>Runtime {file.runtimeReceipt.runtimeId} · Workspace {file.runtimeReceipt.workspaceId} · Binding v{file.runtimeReceipt.bindingVersion}<br />Receipt {file.runtimeReceipt.receiptId}<br />Observed {file.runtimeReceipt.observedAt}</p></details>}{file ? <><p className="file-path">{file.path}</p><p className="panel-caption">{file.mimeType} · {file.status}{file.truncated ? " · Truncated" : ""}</p>{file.warnings.map((warning, index) => <p className="workspace-notice" key={index}>{warning}</p>)}
      {file.scanned ? <p className="workspace-notice">Scanned PDF: extracted text is unavailable. OCR is not connected.</p> : <SourceEditor key={file.path} path={file.path} text={file.text} truncated={file.truncated} onDirty={onDirty} onSave={onSave} savedContent={savedContent} />}
    </> : !error && <p className="panel-empty">{status === "Loading" ? "Reading the selected file…" : "Select a file in the explorer to read its source, or open a file receipt below."}</p>}
    {run && <RunFiles run={run} onOpen={onOpen} />}
  </div>
}

export function AgentWorkspace({ tab, onTab, run, events, streamStatus, file, fileStatus, fileError, onOpen, onPrompt, loading, onControlChanged, runtimeFile, runtime }: {
  tab: string; onTab: (tab: string) => void; run?: AgentRunDetail; events: AgentActivity[]; streamStatus: string;
  file: WorkspaceFile | null; fileStatus: string; fileError: string | null; onOpen: (binding: WorkspaceBinding, path: string) => void; onPrompt: (prompt: string) => void; loading: boolean
  runtime?: WorkspaceRuntimeState; onControlChanged?: () => Promise<void>; runtimeFile?: ReactNode
}) {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = () => setMobile(query.matches)
    update(); query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  const panels: Record<string, { label: string; content: ReactNode }> = {
    files: { label: "Files", content: runtimeFile ?? <FilePanel file={file} status={fileStatus} error={fileError} run={run} onOpen={onOpen} /> },
    plan: { label: "Understanding & Plan", content: <><div className="section-heading"><h2>Understanding &amp; Plan</h2><span className="evidence-status">PROPOSED WORK</span></div><PlanningView execution={run?.execution} engineeringPlan={run?.presentation?.engineeringPlan} planning={run?.presentation?.planning} runtimeAction={!!run?.inspection || run?.id.startsWith("rtrun_")} />{run?.artifacts?.map(artifact => <div className="artifact-receipt" key={artifact.id}><strong>{artifact.title}</strong><span>{artifact.artifactType} · v{artifact.version}</span>{artifact.summary && <p>{artifact.summary}</p>}</div>)}</> },
    evidence: { label: "Evidence receipts", content: <><div className="section-heading"><h2>Evidence receipts</h2><span className="panel-caption">Saved with this run</span></div>{run?.inspection && <AgentControlCard runtime={runtime} run={run} onChanged={onControlChanged} />}<EvidenceList evidence={run?.presentation?.evidence ?? []} binding={run?.presentation?.workspace} onOpen={onOpen} inspection={run?.inspection} />{run?.presentation?.warnings.map((warning, index) => <p className="workspace-notice" key={index}>{warning}</p>)}</> },
    activity: { label: "Activity", content: <ActivityPanel events={events} streamStatus={streamStatus} /> },
  }
  const sheetOpen = mobile && tab !== "files" && Boolean(panels[tab])
  return <>
    <Tabs value={tab} onValueChange={onTab} className="agent-workspace" aria-label="Engineering workspace">
      <TabsList className="inspector-tabs" aria-label="Workspace sections">
        <TabsTrigger value="run">Agent Run</TabsTrigger><TabsTrigger value="files">Files</TabsTrigger><TabsTrigger value="plan">Plan</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="run" className="workspace-tab-content"><AgentRunPanel runtime={runtime} run={run} events={events} streamStatus={streamStatus} onOpen={onOpen} onTab={onTab} onPrompt={onPrompt} loading={loading} onControlChanged={onControlChanged} /></TabsContent>
      {Object.entries(panels).filter(([id]) => !sheetOpen || id === "files").map(([id, panel]) => <TabsContent key={id} value={id} forceMount={id === "files" ? true : undefined} hidden={tab !== id} className="workspace-tab-content inspector-content">{panel.content}</TabsContent>)}
    </Tabs>
    <Sheet open={sheetOpen} onOpenChange={open => { if (!open) onTab("run") }}><SheetContent side="bottom" className="mobile-inspector-sheet"><SheetHeader><SheetTitle>{panels[tab]?.label ?? "Inspector"}</SheetTitle><SheetDescription>Current workspace and saved run records. Read-only.</SheetDescription></SheetHeader><div className="mobile-inspector-body">{panels[tab]?.content}</div></SheetContent></Sheet>
  </>
}
