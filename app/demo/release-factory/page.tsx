import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  Lock,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  XCircle
} from "lucide-react";

const releaseCandidates = [
  {
    id: "RC-FP20-001",
    name: "Sekhem controlled release package",
    version: "candidate-2026.06.fp20",
    qaStatus: "FIX",
    approvalState: "PM review pending",
    artifactHash: "sha256: 9f3a...c21b",
    artifacts: ["Frontend build artifact placeholder", "Evidence bundle placeholder", "Release notes placeholder"],
    evidenceChecklist: [
      { label: "Frontend lint/build evidence", status: "PASS" },
      { label: "Security gate evidence", status: "FIX" },
      { label: "Rollback plan evidence", status: "PASS" },
      { label: "PM final approval", status: "BLOCKED" }
    ],
    blockers: ["Security gate evidence link not attached", "PM final approval not granted"],
    rollbackPlan: "Rollback package and operator runbook reference are placeholders until backend evidence storage is wired."
  },
  {
    id: "RC-FP20-002",
    name: "Evidence-only dry run package",
    version: "candidate-2026.06.evidence-dry-run",
    qaStatus: "PASS",
    approvalState: "Reviewer accepted, PM gate still required",
    artifactHash: "sha256: 4ac8...91df",
    artifacts: ["Checklist export placeholder", "Validation summary placeholder", "Customer-safe release summary placeholder"],
    evidenceChecklist: [
      { label: "Artifact checksum display", status: "PASS" },
      { label: "Evidence checklist display", status: "PASS" },
      { label: "No-auto-deploy notice", status: "PASS" },
      { label: "PM final approval", status: "BLOCKED" }
    ],
    blockers: ["Final production cutover approval not requested"],
    rollbackPlan: "Rollback plan display only. Execution must remain outside the UI and requires explicit PM approval."
  }
];

const governanceRules = [
  "This page displays release readiness state only.",
  "No deployment can be started from this UI.",
  "Artifact upload and release execution require backend/runtime contracts.",
  "Customer wording must say release candidate or PM review state, not production ready."
];

function statusTone(status: string) {
  if (status === "PASS") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "FIX") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (status === "BLOCKED") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

export default function ReleaseFactoryPage() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-amber-500/20 bg-slate-900/80 p-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone="gold">FP-20</Badge>
                <Badge tone="cyan">Release Factory UI + QA</Badge>
                <Badge tone="red">No auto deploy</Badge>
                <Badge tone="green">Customer-safe wording</Badge>
              </div>
              <h1 className="text-3xl font-semibold">Release Factory</h1>
              <p className="mt-2 max-w-3xl text-slate-300">
                Display release candidate artifacts, hashes, evidence checklist, approval state, blockers, rollback plan, and QA status without executing deployment, upload, DB writes, or release actions.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-amber-300"><ShieldCheck size={18} /> Backend remains source of truth</div>
              <div className="mt-2 flex items-center gap-2 text-red-300"><Lock size={18} /> Final release requires explicit PM approval</div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Metric label="Release candidates" value={releaseCandidates.length} icon={PackageCheck} tone="gold" />
          <Metric label="Deployment triggers" value="0" icon={Lock} tone="green" />
          <Metric label="Missing evidence blockers" value="3" icon={AlertTriangle} tone="red" />
          <Metric label="QA status model" value="PASS / FIX / BLOCKED" icon={ClipboardCheck} tone="cyan" />
        </section>

        <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 shrink-0 text-amber-300" size={22} />
            <div>
              <h2 className="text-lg font-semibold text-amber-200">Governance boundary</h2>
              <p className="mt-1 text-sm text-slate-300">Release Factory is display-only. It cannot deploy, upload artifacts, execute release steps, write to a database, or claim production readiness.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {governanceRules.map((rule) => <Badge key={rule}>{rule}</Badge>)}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          {releaseCandidates.map((candidate) => (
            <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5" key={candidate.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="gold">{candidate.id}</Badge>
                    <Badge tone="cyan">{candidate.version}</Badge>
                    <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(candidate.qaStatus)}`}>{candidate.qaStatus}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold">{candidate.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">Approval state: {candidate.approvalState}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm">
                  <div className="flex items-center gap-2 text-slate-300"><GitBranch size={17} /> Artifact hash</div>
                  <code className="mt-2 block text-amber-300">{candidate.artifactHash}</code>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <Panel title="Artifact List" icon={Archive}>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {candidate.artifacts.map((artifact) => <li className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3" key={artifact}>{artifact}</li>)}
                  </ul>
                </Panel>

                <Panel title="Evidence Checklist" icon={ClipboardCheck}>
                  <div className="space-y-2">
                    {candidate.evidenceChecklist.map((item) => (
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3" key={item.label}>
                        <span className="text-sm text-slate-300">{item.label}</span>
                        <span className={`rounded-full border px-2 py-1 text-xs ${statusTone(item.status)}`}>{item.status}</span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Missing Evidence Blockers" icon={AlertTriangle}>
                  <ul className="space-y-2 text-sm text-red-200">
                    {candidate.blockers.map((blocker) => <li className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3" key={blocker}>{blocker}</li>)}
                  </ul>
                </Panel>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <Panel title="Rollback Plan" icon={RotateCcw}>
                  <p className="text-sm text-slate-300">{candidate.rollbackPlan}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="green">Rollback display present</Badge>
                    <Badge tone="gold">Execution outside UI</Badge>
                  </div>
                </Panel>

                <Panel title="Release Approval State" icon={CheckCircle2}>
                  <p className="text-sm text-slate-300">Candidate can move forward only after backend evidence and explicit PM approval. This page contains no release execution controls.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="red">No deployment button</Badge>
                    <Badge tone="red">No artifact upload execution</Badge>
                    <Badge tone="gold">PM approval required</Badge>
                  </div>
                </Panel>
              </div>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <QAStatus status="PASS" title="UI shell coverage" detail="Release Factory page, artifact/hash display, evidence checklist, rollback plan, and no-auto-deploy label are present." />
          <QAStatus status="FIX" title="Evidence wiring" detail="Backend evidence platform must provide real evidence links before final gate." />
          <QAStatus status="BLOCKED" title="Release execution" detail="Deployment and artifact upload execution remain blocked from UI by design." />
        </section>
      </section>
    </main>
  );
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "gold" | "cyan" | "green" | "red" }) {
  const tones = {
    default: "border-slate-700 bg-slate-800 text-slate-300",
    gold: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300"
  };
  return <span className={`rounded-full border px-3 py-1 text-xs ${tones[tone]}`}>{children}</span>;
}

function Metric({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof PackageCheck; tone: "gold" | "green" | "red" | "cyan" }) {
  const toneClass = tone === "gold" ? "text-amber-300" : tone === "green" ? "text-emerald-300" : tone === "red" ? "text-red-300" : "text-cyan-300";
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <Icon className={toneClass} size={22} />
      <strong className="mt-3 block text-2xl">{value}</strong>
      <span className="text-sm text-slate-400">{label}</span>
    </article>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof PackageCheck; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="mb-3 flex items-center gap-2 text-amber-300"><Icon size={18} /><h3 className="font-semibold">{title}</h3></div>
      {children}
    </section>
  );
}

function QAStatus({ status, title, detail }: { status: "PASS" | "FIX" | "BLOCKED"; title: string; detail: string }) {
  const Icon = status === "PASS" ? CheckCircle2 : status === "FIX" ? XCircle : AlertTriangle;
  return (
    <article className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Icon size={20} /><h3 className="font-semibold">{title}</h3></div>
        <span className={`rounded-full border px-3 py-1 text-xs ${statusTone(status)}`}>{status}</span>
      </div>
      <p className="mt-3 text-sm text-slate-300">{detail}</p>
    </article>
  );
}
