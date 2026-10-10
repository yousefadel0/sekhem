"use client"
import { X } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { CodeBlock } from "@/components/chat/code-block"
import { EvidenceList, PlanningView } from "@/components/chat/agent-run-card"
import type { AgentRunDetail, AgentActivity, WorkspaceBinding, WorkspaceFile } from "@/lib/sekhem-agent"
import { ActivityDetails } from "./agent-workspace"
import { activityLabel } from "@/lib/workspace-presentation"

export function AgentInspector({ tab, onTab, onClose, file, fileStatus, fileError, run, events, streamStatus, onOpen }: {
  tab: string; onTab: (value: string) => void; onClose: () => void;
  file: WorkspaceFile | null; fileStatus: string; fileError: string | null; run?: AgentRunDetail;
  events: AgentActivity[]; streamStatus: string;
  onOpen: (binding: WorkspaceBinding, path: string) => void
}) {
  return <aside id="execution-dock" aria-label="Workspace inspector" className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-border bg-sidebar md:relative md:w-96 md:shrink-0">
    <div className="flex h-12 items-center justify-between border-b border-border px-4"><h2 className="text-sm font-semibold">Inspector</h2><button type="button" onClick={onClose} aria-label="Close inspector"><X size={18} /></button></div>
    <Tabs value={tab} onValueChange={onTab} className="min-h-0 flex-1 gap-0">
      <TabsList className="grid w-full grid-cols-4 rounded-none"><TabsTrigger value="files">Files</TabsTrigger><TabsTrigger value="evidence">Evidence</TabsTrigger><TabsTrigger value="plan">Plan</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
      <TabsContent value="files" className="min-h-0 overflow-auto p-4">
        <p className="mb-3 text-xs text-muted-foreground">READ-ONLY · {fileStatus}</p>
        {fileError && <p role="alert" className="text-xs text-amber">{fileError}</p>}
        {file ? <><h3 className="text-sm font-semibold">{file.fileName}</h3><p className="break-all text-xs text-muted-foreground">{file.path}</p><p className="mt-2 text-xs">{file.mimeType} · {file.status}{file.truncated ? " · Truncated" : ""}</p>
          {file.warnings.map((warning, index) => <p key={index} className="text-xs text-amber">{warning}</p>)}
          {file.scanned ? <p className="mt-3 text-xs text-amber">Scanned PDF: extracted text is unavailable. OCR is not connected.</p> : <CodeBlock language={file.language ?? "text"} code={file.text} />}
        </> : !fileError && <p className="text-xs text-muted-foreground">Select a file from the workspace tree.</p>}
      </TabsContent>
      <TabsContent value="evidence" className="min-h-0 overflow-auto p-4"><EvidenceList evidence={run?.presentation?.evidence ?? []} binding={run?.presentation?.workspace} onOpen={onOpen} inspection={run?.inspection} />{run?.presentation?.warnings.map((warning, index) => <p key={index} className="mt-2 text-xs text-amber">{warning}</p>)}</TabsContent>
      <TabsContent value="plan" className="min-h-0 overflow-auto p-4"><PlanningView engineeringPlan={run?.presentation?.engineeringPlan} planning={run?.presentation?.planning} runtimeAction={run?.id.startsWith("rtrun_")} />
        {run?.artifacts?.map(artifact => <div key={artifact.id} className="mt-4 text-xs"><p>{artifact.title} · {artifact.artifactType} · v{artifact.version}</p>{artifact.summary && <p>{artifact.summary}</p>}</div>)}
      </TabsContent>
      <TabsContent value="activity" className="min-h-0 overflow-auto p-4 text-xs space-y-3"><p>Live updates: {streamStatus}</p><p className="text-muted-foreground">Run state is reconciled with saved backend records.</p>
        {events.length === 0 && <p>No activity events available.</p>}
        {events.length >= 100 && <p>Showing the latest 100 saved events.</p>}
        {events.map(event => <div key={event.id} className="border-l border-lime/30 pl-3"><p>{activityLabel(event.eventType, event.payload)}</p><time className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</time><details><summary>Activity details</summary><p>{event.eventType}</p><ActivityDetails runId={event.agentRunId} details={event.details} /></details></div>)}
      </TabsContent>
    </Tabs>
  </aside>
}
