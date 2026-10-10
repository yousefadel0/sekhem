import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCode2,
  FileText,
  GitCompare,
  Lock,
  Octagon,
  ShieldCheck,
  StopCircle,
  XCircle
} from "lucide-react";

const taskContract = {
  id: "FP-11",
  title: "AI Review UI + QA",
  owner: "Tasker 2",
  riskClass: "Class C — human approval required",
  sourceOfTruth: "Backend review contract",
  executionMode: "Display-only UI shell",
  status: "Mock review state"
};

const scopeModel = {
  allowed: [
    "Display task contract metadata",
    "Display draft diff for human review",
    "Collect reviewer notes as UI state",
    "Show test evidence placeholders",
    "Show approve / reject / stop states"
  ],
  blocked: [
    "Real AI provider activation",
    "Tool execution",
    "File apply or patch write",
    "Merge or deployment action",
    "DB write or runtime restart"
  ]
};

const draftDiff = [
  { type: "context", text: "src/workflows/review-plan.ts" },
  { type: "remove", text: "- runDraftAutomatically(taskId)" },
  { type: "add", text: "+ createDraftForHumanReview(taskContractId)" },
  { type: "add", text: "+ requireReviewerApprovalBeforeApply()" },
  { type: "context", text: "// Draft is shown for review only; no file apply from UI." }
];

const reviewerNotes = [
  "Confirm task contract is complete before approval.",
  "Evidence placeholders must resolve to backend-owned records before final gate.",
  "Stop state must remain visible and must not execute tools from UI."
];

const evidenceRecords = [
  { label: "Lint evidence", status: "Placeholder", detail: "Awaiting approved validation runner output." },
  { label: "Build evidence", status: "Placeholder", detail: "Awaiting artifact or CI reference." },
  { label: "Security evidence", status: "Placeholder", detail: "Awaiting security gate scan summary." }
];

const blockers = [
  "Backend review contract required before live persistence.",
  "Evidence links are placeholders until validation storage is wired.",
  "No approval action may apply code from the frontend."
];

const actionStates = [
  { label: "Approve", icon: CheckCircle2, tone: "green", description: "UI state only; backend approval endpoint required before persistence." },
  { label: "Reject", icon: XCircle, tone: "gold", description: "UI state only; rejection reason must be stored by backend contract." },
  { label: "Stop", icon: StopCircle, tone: "red", description: "UI state only; stop command must be enforced by backend/runtime owner." }
];

function statusTone(status: string) {
  if (["PASS", "Approved"].includes(status)) return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  if (["FIX", "Placeholder", "Pending"].includes(status)) return "bg-amber-500/10 text-amber-300 border-amber-500/30";
  if (["BLOCKED", "Blocked"].includes(status)) return "bg-red-500/10 text-red-300 border-red-500/30";
  return "bg-slate-500/10 text-slate-300 border-slate-500/30";
}

export default function AiReviewPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-amber-500/20 bg-slate-900/80 p-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-sm text-amber-300">FP-11</span>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-sm text-cyan-300">Frontend shell only</span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">Customer-safe labels</span>
              </div>
              <h1 className="text-3xl font-semibold">AI Review Workspace</h1>
              <p className="mt-2 max-w-3xl text-slate-300">Review AI-assisted draft output, task contract scope, risk class, evidence, and human approval state without activating a provider, executing tools, applying files, merging, or deploying.</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-amber-300"><ShieldCheck size={18} /> Backend remains source of truth</div>
              <div className="mt-2 flex items-center gap-2 text-red-300"><Lock size={18} /> No production claim</div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2 text-amber-300"><ClipboardCheck size={20} /><h2 className="text-xl font-semibold">Task Contract</h2></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(taskContract).map(([key, value]) => (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4" key={key}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{key.replace(/([A-Z])/g, " $1")}</p>
                  <p className="mt-1 text-sm text-slate-200">{value}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-red-500/20 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-red-300"><AlertTriangle size={20} /><h2 className="text-xl font-semibold">Risk Class</h2></div>
            <p className="text-3xl font-semibold text-red-200">Class C</p>
            <p className="mt-2 text-sm text-slate-300">Human review and backend approval gate required before any state transition. UI cannot approve or apply code by itself.</p>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ScopeCard title="Allowed Scope" icon={CheckCircle2} items={scopeModel.allowed} tone="green" />
          <ScopeCard title="Blocked Scope" icon={Octagon} items={scopeModel.blocked} tone="red" />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2 text-cyan-300"><GitCompare size={20} /><h2 className="text-xl font-semibold">Draft Diff Display</h2></div>
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 font-mono text-sm">
              {draftDiff.map((line) => (
                <div className={`px-4 py-2 ${line.type === "add" ? "bg-emerald-500/10 text-emerald-200" : line.type === "remove" ? "bg-red-500/10 text-red-200" : "text-slate-400"}`} key={line.text}>
                  {line.text}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-amber-300"><FileText size={20} /><h2 className="text-xl font-semibold">Reviewer Notes</h2></div>
            <ul className="space-y-3 text-sm text-slate-300">
              {reviewerNotes.map((note) => <li className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3" key={note}>{note}</li>)}
            </ul>
          </article>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-cyan-300"><FileCode2 size={20} /><h2 className="text-xl font-semibold">Test Evidence</h2></div>
            <div className="space-y-3">
              {evidenceRecords.map((record) => (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3" key={record.label}>
                  <div className="flex items-center justify-between gap-2">
                    <strong>{record.label}</strong>
                    <span className={`rounded-full border px-2 py-1 text-xs ${statusTone(record.status)}`}>{record.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-400">{record.detail}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-red-300"><AlertTriangle size={20} /><h2 className="text-xl font-semibold">Blockers</h2></div>
            <ul className="space-y-3 text-sm text-slate-300">
              {blockers.map((blocker) => <li className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3" key={blocker}>{blocker}</li>)}
            </ul>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center gap-2 text-emerald-300"><ShieldCheck size={20} /><h2 className="text-xl font-semibold">Action States</h2></div>
            <div className="space-y-3">
              {actionStates.map(({ label, icon: Icon, tone, description }) => (
                <button className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-left" key={label}>
                  <div className={`flex items-center gap-2 ${tone === "green" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-amber-300"}`}><Icon size={18} />{label}</div>
                  <p className="mt-2 text-sm text-slate-400">{description}</p>
                </button>
              ))}
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function ScopeCard({ title, icon: Icon, items, tone }: { title: string; icon: typeof CheckCircle2; items: string[]; tone: "green" | "red" }) {
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <div className={`mb-4 flex items-center gap-2 ${tone === "green" ? "text-emerald-300" : "text-red-300"}`}><Icon size={20} /><h2 className="text-xl font-semibold">{title}</h2></div>
      <ul className="space-y-3 text-sm text-slate-300">
        {items.map((item) => <li className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3" key={item}>{item}</li>)}
      </ul>
    </article>
  );
}
