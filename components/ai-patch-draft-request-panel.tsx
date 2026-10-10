"use client"

import { useState } from "react"
import { CheckCircle, Code, FileText, RefreshCw, Send, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { fetchSekhemApi, postSekhemApi } from "@/lib/sekhem-api"

type AiPatchDraft = {
  draftId: string
  status: string
  nextGate: string | null
  createdAsDraftOnly: boolean
  autoApply: boolean
  githubWrite: boolean
  deployment: boolean
}

type AiPatchArtifact = {
  artifactId: string
  artifactType: string
  filePath: string
  title: string
  summary: string
  contentPreview: string
  diffPreview: string
  riskLevel: string
  reviewNotes: string
  applyAllowed: boolean
  githubWrite: boolean
  deployment: boolean
  createdAsDraftOnly: boolean
}

type DraftForm = {
  title: string
  requestedBy: string
  targetArea: string
  intent: string
  constraints: string
  safetyNotes: string
}

const initialForm: DraftForm = {
  title: "",
  requestedBy: "",
  targetArea: "",
  intent: "",
  constraints: "",
  safetyNotes: ""
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function statusLabel(value: string): string {
  return value.replace(/_/g, " ")
}

export function AiPatchDraftRequestPanel() {
  const [form, setForm] = useState(initialForm)
  const [draftId, setDraftId] = useState("")
  const [draft, setDraft] = useState<AiPatchDraft | null>(null)
  const [artifacts, setArtifacts] = useState<AiPatchArtifact[]>([])
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  function updateField(field: keyof DraftForm, value: string): void {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function readArtifacts(id: string): Promise<void> {
    const result = await fetchSekhemApi<AiPatchArtifact[]>(`/ai-patch/drafts/${encodeURIComponent(id)}/artifacts`)
    setArtifacts(result ?? [])
  }

  async function readDraft(id: string): Promise<void> {
    const normalizedId = id.trim()
    if (!normalizedId) {
      setMessage("Enter a draft ID to review its status.")
      return
    }

    setIsRefreshing(true)
    const result = await fetchSekhemApi<AiPatchDraft>(`/ai-patch/drafts/${encodeURIComponent(normalizedId)}`)
    setIsRefreshing(false)

    if (!result) {
      setMessage("Draft status is not available yet. Please try again.")
      return
    }

    setDraftId(result.draftId)
    setDraft(result)
    await readArtifacts(result.draftId)
    setMessage("Draft status refreshed.")
  }

  async function submitDraft(): Promise<void> {
    const constraints = lines(form.constraints)
    const safetyNotes = lines(form.safetyNotes)
    if (
      !form.title.trim() ||
      !form.requestedBy.trim() ||
      !form.targetArea.trim() ||
      !form.intent.trim() ||
      constraints.length === 0 ||
      safetyNotes.length === 0
    ) {
      setMessage("Complete each field before creating a draft request.")
      return
    }

    setIsSubmitting(true)
    const created = await postSekhemApi<AiPatchDraft, Record<string, unknown>>("/ai-patch/drafts", {
      title: form.title.trim(),
      requestedBy: form.requestedBy.trim(),
      targetArea: form.targetArea.trim(),
      intent: form.intent.trim(),
      constraints,
      safetyNotes
    })
    setIsSubmitting(false)

    if (!created) {
      setMessage("Draft request could not be created. Please try again.")
      return
    }

    setDraftId(created.draftId)
    setDraft(created)
    setMessage("Draft request created.")
    await readDraft(created.draftId)
  }

  return (
    <Card className="border-cyan/30 bg-cyan/5">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-cyan" />
              Create Draft Request
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Prepare a review-only request for a controlled human decision.
            </p>
          </div>
          <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5 w-fit">
            <Shield className="w-3 h-3 mr-1" />
            Human review required
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Title" value={form.title} onChange={(value) => updateField("title", value)} />
          <Field label="Requested by" value={form.requestedBy} onChange={(value) => updateField("requestedBy", value)} />
          <Field label="Target area" value={form.targetArea} onChange={(value) => updateField("targetArea", value)} />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="Intent" value={form.intent} onChange={(value) => updateField("intent", value)} />
          <TextField
            label="Constraints"
            value={form.constraints}
            onChange={(value) => updateField("constraints", value)}
            placeholder="Add one constraint per line."
          />
          <TextField
            label="Safety notes"
            value={form.safetyNotes}
            onChange={(value) => updateField("safetyNotes", value)}
            placeholder="Add one safety note per line."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void submitDraft()} disabled={isSubmitting} className="bg-cyan text-background hover:bg-cyan/90">
            <Send className="w-3 h-3 mr-1" />
            {isSubmitting ? "Creating Draft..." : "Create Draft Request"}
          </Button>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>

        <div className="border-t border-cyan/20 pt-4 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="space-y-1.5 flex-1">
              <label htmlFor="ai-patch-draft-id" className="text-xs font-medium text-foreground">
                Draft ID
              </label>
              <Input id="ai-patch-draft-id" value={draftId} onChange={(event) => setDraftId(event.target.value)} placeholder="Enter a draft ID" />
            </div>
            <Button variant="outline" onClick={() => void readDraft(draftId)} disabled={isRefreshing}>
              <RefreshCw className="w-3 h-3 mr-1" />
              {isRefreshing ? "Refreshing..." : "Refresh Draft Status"}
            </Button>
          </div>
        </div>

        {draft && (
          <>
            <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-success">Draft request created</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">{draft.draftId}</p>
                </div>
                <Badge variant="outline" className="border-warning/30 text-warning w-fit">
                  Human review required
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <StatusItem label="Status" value={draft.status} />
                <StatusItem label="Next gate" value={draft.nextGate ?? "HUMAN_REVIEW_REQUIRED"} />
                <StatusItem label="Workspace" value="Review-only workspace" />
                <StatusItem label="Draft only" value={`createdAsDraftOnly=${String(draft.createdAsDraftOnly)}`} />
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <SafetyItem label="No automatic application" value={`autoApply=${String(draft.autoApply)}`} />
                <SafetyItem label="No repository write" value={`githubWrite=${String(draft.githubWrite)}`} />
                <SafetyItem label="No deployment" value={`deployment=${String(draft.deployment)}`} />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-card/60 p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">Runtime review artifacts</p>
                <p className="text-xs text-muted-foreground mt-1">Review-only artifacts associated with this draft request.</p>
              </div>
              {artifacts.length === 0 ? (
                <p className="text-xs text-muted-foreground">No code preview is available for this draft yet.</p>
              ) : (
                <div className="space-y-3">
                  {artifacts.map((artifact) => <RuntimeArtifact key={artifact.artifactId} artifact={artifact} />)}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = `ai-patch-${label.toLowerCase().replace(/\s+/g, "-")}`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground">{label}</label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const id = `ai-patch-${label.toLowerCase().replace(/\s+/g, "-")}`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground">{label}</label>
      <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24" />
    </div>
  )
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground mt-1">{statusLabel(value)}</p>
    </div>
  )
}

function SafetyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-success/20 bg-background/40 p-2.5">
      <div className="flex items-center gap-1.5">
        <CheckCircle className="w-3 h-3 text-success" />
        <p className="text-xs font-medium text-foreground">{label}</p>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 font-mono">{value}</p>
    </div>
  )
}

function RuntimeArtifact({ artifact }: { artifact: AiPatchArtifact }) {
  if (artifact.artifactType === "CODE_DIFF_PREVIEW") {
    return <CodeDiffPreviewArtifact artifact={artifact} />
  }

  return (
    <div className="rounded-md border border-cyan/20 bg-background/50 p-3 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">{statusLabel(artifact.artifactType)}</p>
          <p className="text-sm font-medium text-foreground mt-1">{artifact.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{artifact.summary}</p>
        </div>
        <Badge variant="outline" className="border-warning/30 text-warning w-fit">{artifact.riskLevel} risk</Badge>
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground">File path</p>
        <p className="text-xs font-mono text-foreground mt-1">{artifact.filePath}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <PreviewBlock label="Content preview" value={artifact.contentPreview} />
        <PreviewBlock label="Diff preview" value={artifact.diffPreview} />
      </div>

      <div>
        <p className="text-[10px] text-muted-foreground">Review notes</p>
        <p className="text-xs text-foreground mt-1">{artifact.reviewNotes}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SafetyItem label="Review only" value="Review only" />
        <SafetyItem label="No file apply" value={`applyAllowed=${String(artifact.applyAllowed)}`} />
        <SafetyItem label="No repository write" value={`githubWrite=${String(artifact.githubWrite)}`} />
        <SafetyItem label="No deployment" value={`deployment=${String(artifact.deployment)}`} />
        <SafetyItem label="Draft only" value={`createdAsDraftOnly=${String(artifact.createdAsDraftOnly)}`} />
      </div>
    </div>
  )
}

function CodeDiffPreviewArtifact({ artifact }: { artifact: AiPatchArtifact }) {
  return (
    <div className="rounded-lg border border-cyan/30 bg-background/60 overflow-hidden">
      <div className="border-b border-cyan/20 bg-cyan/5 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md border border-cyan/30 bg-cyan/10 flex items-center justify-center shrink-0">
              <Code className="w-4 h-4 text-cyan" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-cyan">Code Diff Preview</p>
              <p className="text-sm font-medium text-foreground mt-1">{artifact.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{artifact.summary}</p>
            </div>
          </div>
          <Badge variant="outline" className="border-warning/30 text-warning bg-warning/5 w-fit">
            {artifact.riskLevel} risk
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <ArtifactDetail label="File path" value={artifact.filePath} mono />
          <ArtifactDetail label="Artifact type" value={statusLabel(artifact.artifactType)} />
        </div>

        <PreviewBlock label="Content preview" value={artifact.contentPreview} />
        <DiffPreviewBlock value={artifact.diffPreview} />

        <div className="rounded-md border border-border/50 bg-card/40 p-3">
          <p className="text-[10px] text-muted-foreground">Review notes</p>
          <p className="text-xs text-foreground mt-1">{artifact.reviewNotes}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Safety flags</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <SafetyItem label="Review only" value="Review only" />
            <SafetyItem label="No file apply" value={`applyAllowed=${String(artifact.applyAllowed)}`} />
            <SafetyItem label="No repository write" value={`githubWrite=${String(artifact.githubWrite)}`} />
            <SafetyItem label="No deployment" value={`deployment=${String(artifact.deployment)}`} />
            <SafetyItem label="Draft only" value={`createdAsDraftOnly=${String(artifact.createdAsDraftOnly)}`} />
          </div>
        </div>
      </div>
    </div>
  )
}

function ArtifactDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border/50 bg-card/40 p-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-xs text-foreground mt-1 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  )
}

function DiffPreviewBlock({ value }: { value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background overflow-hidden">
      <div className="border-b border-border/50 bg-secondary/30 px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Diff preview</p>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-5">
        <code>
          {value.split("\n").map((line, index) => (
            <span key={`${index}-${line}`} className={`block ${diffLineTone(line)}`}>
              {line || " "}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

function diffLineTone(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "text-success"
  }

  if (line.startsWith("-") && !line.startsWith("---")) {
    return "text-destructive"
  }

  if (line.startsWith("@@")) {
    return "text-cyan"
  }

  return "text-foreground"
}

function PreviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background p-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <pre className="text-xs font-mono text-foreground mt-1 whitespace-pre-wrap overflow-x-auto">{value}</pre>
    </div>
  )
}
