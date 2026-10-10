import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  FileCheck2,
  GitBranch,
  Lock,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PolicyStatus = "PASS" | "FIX" | "BLOCKED"

type QualityStage = {
  order: number
  title: string
  owner: string
  status: PolicyStatus
  icon: typeof Sparkles
  summary: string
  evidence: string[]
}

const safetyState = {
  generatorModel: "mock/local-placeholder",
  reviewerModel: "separate mock/local-placeholder",
  providerCallExecuted: false,
  draftCreated: true,
  autoApply: false,
  githubWrite: false,
  deployment: false,
  humanReviewRequired: true,
  policyStatus: "FIX" as PolicyStatus,
  securityGateRequired: true,
  testPlanRequired: true
}

const stages: QualityStage[] = [
  {
    order: 1,
    title: "Task Input",
    owner: "Product owner / PM",
    status: "PASS",
    icon: ClipboardCheck,
    summary: "The requested code task is captured as a review-only instruction with scope, constraints, and forbidden actions.",
    evidence: ["Task ID recorded", "Allowed files defined", "No deploy/apply permission granted"]
  },
  {
    order: 2,
    title: "Generator Draft",
    owner: "Generator placeholder",
    status: "PASS",
    icon: Sparkles,
    summary: "A draft change is represented for review. The generator is explicitly mock/local-placeholder and does not call an external provider.",
    evidence: ["generatorModel = mock/local-placeholder", "providerCallExecuted = false", "draftCreated = true"]
  },
  {
    order: 3,
    title: "Reviewer / Critic",
    owner: "Separate reviewer placeholder",
    status: "PASS",
    icon: FileCheck2,
    summary: "A separate reviewer stage checks the draft for scope fit, regressions, missing tests, and unsafe assumptions.",
    evidence: ["reviewerModel = separate mock/local-placeholder", "Reviewer is separate from generator", "Critic output is review-only"]
  },
  {
    order: 4,
    title: "Policy Gate",
    owner: "AI Gateway policy",
    status: "FIX",
    icon: Lock,
    summary: "Policy review must resolve open issues before the draft can move to human approval. This demo shows a visible FIX state, not automatic approval.",
    evidence: ["policyStatus = FIX", "autoApply = false", "humanReviewRequired = true"]
  },
  {
    order: 5,
    title: "Test Plan",
    owner: "QA / Tasker",
    status: "PASS",
    icon: Code2,
    summary: "The required test plan is visible before any apply/deploy decision and must include targeted tests, build, lint, and regression checks.",
    evidence: ["testPlanRequired = true", "Targeted tests listed", "Full-suite exceptions must be separated"]
  },
  {
    order: 6,
    title: "Security Gate",
    owner: "Security",
    status: "PASS",
    icon: ShieldCheck,
    summary: "Security review remains mandatory and blocks on sensitive output, forbidden actions, repo writes, deployment, or unsafe provider behavior.",
    evidence: ["securityGateRequired = true", "githubWrite = false", "deployment = false"]
  },
  {
    order: 7,
    title: "Human Decision",
    owner: "PM / Human reviewer",
    status: "BLOCKED",
    icon: UserCheck,
    summary: "Final action is blocked until a human explicitly approves the reviewed evidence. The product does not apply, push, or deploy automatically.",
    evidence: ["humanReviewRequired = true", "No automatic apply", "No production readiness claim"]
  }
]

const requiredChecks = [
  ["Generator visible", true],
  ["Reviewer visible", true],
  ["Policy gate visible", true],
  ["Test plan visible", true],
  ["Security gate visible", true],
  ["Human gate visible", true]
] as const

const backendDependencies = [
  "Connect this UI to a persisted AI Patch draft record.",
  "Persist reviewer/critic evidence as an auditable artifact.",
  "Expose policy/test/security gate state from backend APIs.",
  "Keep provider calls disabled unless a separate PM-approved activation task allows dry-run routing."
]

function statusClass(status: PolicyStatus) {
  return cn(
    "text-[10px]",
    status === "PASS" && "border-success/40 text-success bg-success/10",
    status === "FIX" && "border-warning/40 text-warning bg-warning/10",
    status === "BLOCKED" && "border-destructive/40 text-destructive bg-destructive/10"
  )
}

function booleanBadge(value: boolean) {
  return value ? (
    <Badge variant="outline" className="border-success/40 text-success bg-success/10">true</Badge>
  ) : (
    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground bg-secondary/40">false</Badge>
  )
}

export default function CodeQualityLoopPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <GitBranch className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sekhem Code Quality Control Loop</h1>
            <p className="text-sm text-muted-foreground">
              Visible review path for AI-generated code before any apply, repository write, or deployment.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-warning/40 text-warning bg-warning/10">
          Mock / Dry-run UI proof
        </Badge>
      </div>

      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Frontend proof only — backend dependency remains open</p>
              <p className="text-xs text-muted-foreground mt-1">
                This route makes the quality loop visible using mock/local-placeholder states. It does not activate a provider,
                accept credentials, write to GitHub, apply files, run deployment, or touch the database.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-cyan" />
              Required visible stages
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stages.map((stage) => {
              const Icon = stage.icon
              return (
                <div key={stage.order} className="rounded-lg border border-border bg-card/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-secondary/60 border border-border flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-cyan" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Stage {stage.order}</span>
                          <Badge variant="outline" className={statusClass(stage.status)}>{stage.status}</Badge>
                        </div>
                        <h2 className="text-sm font-semibold text-foreground mt-1">{stage.title}</h2>
                        <p className="text-xs text-muted-foreground mt-1">Owner: {stage.owner}</p>
                        <p className="text-sm text-muted-foreground mt-2">{stage.summary}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {stage.evidence.map((item) => (
                      <div key={item} className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-success" />
                Safety state
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">generatorModel</span>
                <code>{safetyState.generatorModel}</code>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">reviewerModel</span>
                <code>{safetyState.reviewerModel}</code>
              </div>
              {Object.entries(safetyState)
                .filter(([key]) => key !== "generatorModel" && key !== "reviewerModel" && key !== "policyStatus")
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">{key}</span>
                    {booleanBadge(Boolean(value))}
                  </div>
                ))}
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">policyStatus</span>
                <Badge variant="outline" className={statusClass(safetyState.policyStatus)}>{safetyState.policyStatus}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Visibility checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {requiredChecks.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  {value ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-warning" />
            Backend dependency task
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Backend integration is intentionally not claimed in this UI proof. Create a follow-up backend task before treating the loop as enforceable runtime behavior.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {backendDependencies.map((dependency) => (
              <div key={dependency} className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                {dependency}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
