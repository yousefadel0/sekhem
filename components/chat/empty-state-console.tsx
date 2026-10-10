import React from "react"
import { AlertTriangle, Loader2, FileText, Image as ImageIcon, Code2, ScrollText, Settings } from "lucide-react"

// ─── SEKHEM mark (large, for empty state) ────────────────────────────────────
function SekhemMark({ size = 80 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-lime"
      style={{ filter: "drop-shadow(0 0 12px oklch(0.93 0.30 116 / 0.25))" }}
    >
      <circle
        cx="40" cy="40" r="37"
        stroke="currentColor" strokeWidth="0.7" strokeDasharray="10 7"
        strokeLinecap="round" opacity="0.25"
        className="animate-orbital-spin-slow"
        style={{ transformOrigin: "40px 40px" }}
      />
      <circle
        cx="40" cy="40" r="30"
        stroke="currentColor" strokeWidth="0.9" strokeDasharray="8 5.5"
        strokeLinecap="round" opacity="0.4"
        className="animate-orbital-spin"
        style={{ transformOrigin: "40px 40px" }}
      />
      <circle
        cx="40" cy="40" r="21"
        stroke="currentColor" strokeWidth="0.9" strokeDasharray="6 5" strokeDashoffset="6"
        strokeLinecap="round" opacity="0.5"
        className="animate-orbital-spin-reverse"
        style={{ transformOrigin: "40px 40px" }}
      />
      <path d="M40 18 L62 40 L40 62 L18 40 Z" stroke="currentColor" strokeWidth="1.2" fill="currentColor" fillOpacity="0.06" opacity="0.7" />
      <path d="M40 28 L52 40 L40 52 L28 40 Z" stroke="currentColor" strokeWidth="0.8" fill="currentColor" fillOpacity="0.04" opacity="0.45" />
      <line x1="40" y1="31" x2="40" y2="49" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <line x1="31" y1="40" x2="49" y2="40" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <circle cx="40" cy="40" r="5" fill="currentColor" className="animate-lime-pulse" />
      <circle cx="40" cy="3"  r="2" fill="currentColor" opacity="0.5" />
      <circle cx="40" cy="77" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="3"  cy="40" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="77" cy="40" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="14" cy="14" r="1.2" fill="currentColor" opacity="0.25" />
      <circle cx="66" cy="14" r="1.2" fill="currentColor" opacity="0.25" />
      <circle cx="14" cy="66" r="1.2" fill="currentColor" opacity="0.25" />
      <circle cx="66" cy="66" r="1.2" fill="currentColor" opacity="0.25" />
    </svg>
  )
}

// ─── Command chips ────────────────────────────────────────────────────────────
const COMMAND_CHIPS = [
  {
    label: "INSPECT AUTHENTICATION",
    prompt: "Analyze this project and inspect the authentication implementation.",
    tag: "WORKSPACE",
  },
  {
    label: "EXPLAIN BGP",
    prompt: "Explain BGP routing protocol — how it works and why it's used in large networks",
    tag: "NETWORKING",
  },
  {
    label: "REVIEW NETWORK CONFIG",
    prompt: "Review a typical spine-leaf network configuration and identify key considerations",
    tag: "NETWORKING",
  },
  {
    label: "PLAN A PROJECT REVIEW",
    prompt: "Inspect this workspace and create a bounded read-only review plan. Acceptance: identify relevant source files and missing information.",
    tag: "PLANNING",
  },
  {
    label: "DEBUG AN ENGINEERING ISSUE",
    prompt: "Help me debug a BGP session flapping issue — what are the common causes and how to diagnose",
    tag: "DEBUGGING",
  },
]

// ─── Capability cards ─────────────────────────────────────────────────────────
// Honest capability indicators — marked "READY" only for what actually works
const CAPABILITIES = [
  {
    icon: Code2,
    label: "ANALYZE CODE",
    status: "ACTIVE" as const,
    description: "Review code, debug issues, explain logic",
  },
  {
    icon: ScrollText,
    label: "READ LOGS",
    status: "ACTIVE" as const,
    description: "Parse log files, identify errors, trace issues",
  },
  {
    icon: Settings,
    label: "INSPECT CONFIGS",
    status: "ACTIVE" as const,
    description: "Analyze config files and network definitions",
  },
  {
    icon: FileText,
    label: "ANALYZE DOCUMENTS",
    status: "ACTIVE" as const,
    description: "Understand specifications, runbooks, reports",
  },
  {
    icon: ImageIcon,
    label: "IMAGE ATTACHMENTS",
    // Honest: file attachment UX is ready; server-side file processing requires a backend contract
    status: "ATTACH_READY" as const,
    description: "Images can be attached. Image analysis is unavailable in this conversation path.",
  },
]

interface EmptyStateConsoleProps {
  onSendMessage: (content: string) => void
  projectContractNotice: string | null
  isProjectsLoading: boolean
}

export function EmptyStateConsole({
  onSendMessage,
  projectContractNotice,
  isProjectsLoading,
}: EmptyStateConsoleProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-xl flex flex-col items-center gap-7">

        {/* Mark */}
        <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
          <SekhemMark size={76} />
        </div>

        {/* Headline */}
        <div className="space-y-2 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <h1 className="text-xl sm:text-2xl font-bold tracking-[0.05em] text-foreground uppercase">
            Your Engineering Core Is Ready.
          </h1>
          <p className="text-sm text-muted-foreground/70 max-w-sm mx-auto leading-relaxed">
            Ask SEKHEM to analyze, explain, build, validate, or reason about your engineering problem.
            Attach files using the paperclip icon.
          </p>
        </div>

        {/* Project contract notice */}
        {isProjectsLoading ? (
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/60 animate-fade-in">
            <Loader2 className="w-3 h-3 animate-spin text-lime/60" />
            <span>Resolving project context…</span>
          </div>
        ) : projectContractNotice ? (
          <div
            className="w-full p-3.5 rounded-lg border border-amber/25 bg-amber/5 text-left space-y-1.5 animate-fade-up"
            style={{ animationDelay: "80ms" }}
            role="alert"
          >
            <div className="flex items-center gap-2 text-amber text-[10px] font-mono font-semibold uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Project Contract Notice</span>
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed pl-5 font-mono">
              {projectContractNotice}
            </p>
          </div>
        ) : null}

        {/* Capability cards */}
        <div
          className="w-full animate-fade-up"
          style={{ animationDelay: "100ms" }}
        >
          <div className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-[0.25em] text-left pl-0.5 mb-2">
            Core Capabilities
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <p className="text-xs text-muted-foreground">Supported features do not grant access to the current workspace.</p>
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon
              const isAttachReady = cap.status === "ATTACH_READY"
              return (
                <div
                  key={cap.label}
                  className="
                    group flex flex-col gap-2 p-3 rounded-lg text-left
                    border border-border/35 bg-surface-1/40
                    transition-all duration-150
                  "
                  title={cap.description}
                >
                  <div className="flex items-center justify-between">
                    <Icon
                      className="w-3.5 h-3.5 text-lime/50"
                      aria-hidden="true"
                    />
                    <span
                      className={`
                        text-[8px] font-mono tracking-widest uppercase
                        ${isAttachReady
                          ? "text-cyan/60"
                          : "text-lime/60"}
                      `}
                    >
                      {isAttachReady ? "ATTACH" : "ACTIVE"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono tracking-wider text-foreground/65 uppercase leading-tight">
                    {cap.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Command chips */}
        <div
          className="w-full space-y-2 animate-fade-up"
          style={{ animationDelay: "140ms" }}
        >
          <div className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-[0.25em] text-left pl-0.5">
            Command Examples
          </div>
          <div className="grid gap-2">
            {COMMAND_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSendMessage(chip.prompt)}
                className="
                  group flex items-center justify-between w-full
                  px-4 py-3 rounded-lg text-left
                  border border-border/40 bg-surface-1/50
                  hover:border-lime/30 hover:bg-surface-2/60
                  transition-all duration-150
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime/40
                "
                aria-label={`Send command: ${chip.label}`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-lime/40 group-hover:bg-lime/70 transition-colors shrink-0"
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-mono tracking-wider text-foreground/70 group-hover:text-foreground/90 transition-colors uppercase">
                    {chip.label}
                  </span>
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/30 group-hover:text-lime/40 transition-colors tracking-widest uppercase shrink-0 ml-3">
                  {chip.tag}
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
