"use client"
import { SekhemMark } from "@/components/workspace/sekhem-primitives"
import React, { useEffect, useRef, useState } from "react"
import { MarkdownRenderer } from "./markdown-renderer"
import { Check, Copy, FileText, Image as ImageIcon } from "lucide-react"
import type { ConversationMessageDto } from "@/lib/sekhem-conversation"
import type { AttachmentItem } from "./attachment-types"
import { messageAttachmentPresentation } from "@/lib/conversation-restoration"
import { restoredChangeSet } from "@/lib/change-review"
import { ChangeReview } from "./change-review"
import { inspectionReportSummary } from "@/lib/inspection-report-presentation"

// ─── Sekhem mini-mark for assistant messages ─────────────────────────────────
function SekhemMiniMark() { return <SekhemMark size={23} /> }

function ResponseActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false)
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer) }, [copied])
  return <div className="response-actions" dir="ltr"><button type="button" aria-label={copied ? "Response copied" : "Copy response"} onClick={async () => {
    setFailed(false)
    try { await navigator.clipboard.writeText(content); setCopied(true) }
    catch { setCopied(false); setFailed(true) }
  }}>{copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}{copied ? "Copied" : "Copy"}</button>{failed && <span role="alert">Copy unavailable. Select the response to copy it.</span>}</div>
}

/** Presentation only: retain the original saved notice, including its access status. */
function workspaceVisibilitySummary(message: ConversationMessageDto): string | null {
  if (message.metadata?.modeNotice !== true || message.metadata.executionStarted !== false) return null
  const arabic = message.content.startsWith("المجلد المختار: ") && message.content.includes("الرد ده مبني على بيانات الربط المحفوظة؛")
  const english = message.content.startsWith("Selected folder: ") && message.content.includes("This uses saved workspace metadata.")
  if (!arabic && !english) return null
  const connected = arabic ? message.content.endsWith("\nمتصل؛ كل عملية تخضع لفحص الصلاحيات.")
    : message.content.endsWith("\nConnected; each operation still requires current authorization.")
  return arabic ? connected ? "أيوه، شايف المشروع ومتصل بيه. أقدر أقرأ الملفات المصرح لي بيها وأساعدك في تحليله."
    : "شايف المجلد المختار، لكن الاتصال أو الوصول ليه مش مؤكد حاليًا. تقدر تراجع الحالة في التفاصيل."
    : connected ? "Yes, the project is connected. I can read the permitted files and help you analyze it."
      : "I can see the selected folder, but its connection or access is not currently confirmed. Review Details for its status."
}

interface ChatMessageItemProps {
  message: ConversationMessageDto
  /** Attachments for this message — used by user messages only */
  attachments?: AttachmentItem[]
  /** Index used for staggered entrance animation */
  changeReviewAvailable?: boolean
  onChangeReviewChanged?: (conversationId: string) => Promise<void>
  index?: number
}

export function ChatMessageItem({ message, attachments: localAttachments, index = 0, onChangeReviewChanged, changeReviewAvailable = true }: ChatMessageItemProps) {
  const attachments = messageAttachmentPresentation(message, localAttachments)
  const isUser = message.senderType === "user"
  const pageSource = !isUser ? message.metadata?.browserSource as { source?: string; url?: string; title?: string; text?: string; observedAt?: string; truncated?: boolean } | undefined : undefined
  const browserSource = pageSource?.source === "BROWSER_OBSERVATION" && typeof pageSource.text === "string" && typeof pageSource.url === "string" && /^https?:\/\//i.test(pageSource.url) ? pageSource : null
  const visibilitySummary = !isUser ? workspaceVisibilitySummary(message) : null
  const reportSummary = !isUser ? inspectionReportSummary(message) : null
  const inspectionInternal = !isUser && Boolean(message.metadata?.agentRunId) && (message.metadata.inspectionReport === true && message.metadata.outcome === "FAILED" || message.id.startsWith("inspection_reply_") && message.metadata.modelConversation === true && message.metadata.outcome === "IN_PROGRESS" && !message.metadata.grounding && message.metadata.answerPresentation !== "EVIDENCE_LIMITED")
  const inspectionSummary = inspectionInternal ? message.metadata.inspectionReport === true
    ? /[\u0600-\u06ff]/.test(message.content) ? "التحليل ما اكتملش. القراءات المكتملة محفوظة؛ تقدر تراجع السبب في التفاصيل." : "Analysis could not be completed. Completed reads are retained; see Details for the reason."
    : "Reviewing project evidence for your request." : null
  const progress = message.metadata?.inspectionProgress as { tool?: string; relativePath?: string } | undefined
  const progressSummary = progress && ["filesystem.read", "filesystem.list", "filesystem.search"].includes(progress.tool ?? "") && typeof progress.relativePath === "string"
    ? `${/[\u0600-\u06ff]/.test(message.content) ? "الخطوة المقترحة بعد التحقق من صلاحية الوصول" : "Next proposed inspection, subject to access checks"}: ${progress.tool} · ${progress.relativePath || "Workspace root"}` : null
  const changeSet = !isUser ? restoredChangeSet(message.metadata?.changeSet, message.conversationId) : null
  const evidence = Array.isArray(message.metadata?.evidenceReceipt) ? message.metadata.evidenceReceipt.filter(
    (item): item is { label: string; outcome: string } => Boolean(item && typeof item.label === "string" && typeof item.outcome === "string")
  ).slice(0, 5) : []
  const ref = useRef<HTMLDivElement>(null)

  const formattedTime = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })
    : ""

  const animationStyle: React.CSSProperties = {
    animationDelay: `${Math.max(0, Math.min(index, 5)) * 30}ms`,
  }

  // System-authored runtime notices are evidence, not conversational prose.
  // The associated activity and approval components retain their existing controls.
  if (message.metadata?.runtimeAction === true) return <details className="text-xs text-muted-foreground" aria-label="Runtime message details">
    <summary className="cursor-pointer rounded py-1 focus-visible:outline focus-visible:outline-1">{isUser ? "Workspace action · Details" : "Workspace result · Details"}</summary>
    <div dir="auto" className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</div>
  </details>

  if (isUser) {
    const isQueued = Boolean((message.metadata as Record<string, unknown> | undefined)?.isQueued)

    return (
      <div
        ref={ref}
        data-sender="user"
        style={animationStyle}
        className={`chat-message flex flex-col items-end ${isQueued ? "opacity-85" : ""}`}
      >
        {/* Operator label row */}
        <div className="flex items-center gap-2 mb-1.5 text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest">
          {formattedTime && <span>{formattedTime}</span>}
          {formattedTime && <span className="text-border/60">·</span>}
          <span>Operator</span>
          {isQueued && (
            <>
              <span className="text-border/60">·</span>
              <span className="text-amber font-semibold tracking-wider">QUEUED</span>
            </>
          )}
        </div>

        {/* Attachment previews above the message text */}
        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 max-w-[82%] justify-end">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/50 bg-surface-2/60 text-[11px] font-mono text-muted-foreground/70 max-w-[180px]"
              >
                {att.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-lime/50 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{att.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Message block — left-border command style */}
        <div
          className={`max-w-[82%] pl-3 pr-4 py-2.5 border-l-2 bg-surface-2/50 rounded-r-md text-sm text-foreground/90 leading-relaxed break-words ${isQueued ? "border-amber/60" : "border-lime/40"
            }`}
          style={{ borderLeft: isQueued ? "2px solid oklch(0.80 0.20 80 / 0.6)" : "2px solid oklch(0.93 0.30 116 / 0.35)" }}
        >
          <div dir="auto">{message.content}</div>
        </div>
      </div>
    )
  }

  // SEKHEM assistant message — editorial layout
  return (
    <div
      ref={ref}
      data-sender="assistant"
      style={animationStyle}
      className="chat-message flex flex-col"
    >
      {/* SEKHEM identity header — SEKHEM is the sole visible AI identity */}
      <div className="chat-message-meta flex items-center gap-2.5 mb-2.5">
        <span className="text-lime" style={{ filter: "drop-shadow(0 0 4px oklch(0.93 0.30 116 / 0.3))" }}>
          <SekhemMiniMark />
        </span>
        <span className="text-[11px] font-mono font-semibold tracking-[0.2em] text-foreground/85 uppercase">
          SEKHEM
        </span>
        {formattedTime && (
          <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">
            {formattedTime}
          </span>
        )}
      </div>

      {/* Response content — engineering document style */}
      <div className="assistant-response pl-0 max-w-full" dir="auto">
        {browserSource ? <section className="browser-source-card" aria-label="Observed web page source">
          <div className="browser-source-heading"><FileText size={17} aria-hidden="true" /><strong>{browserSource.title || "Web page source"}</strong><span>Page source</span></div>
          <a href={browserSource.url} target="_blank" rel="noopener noreferrer" dir="ltr">{browserSource.url}</a>
          <p>Observed: {browserSource.observedAt || "Time unavailable"} · {browserSource.truncated ? "Partial page" : "Captured page text"}</p>
          <p>Web content is a source, not instructions or verified workspace evidence.</p>
          <details><summary>Read captured page text</summary><div className="browser-source-text" dir="auto">{browserSource.text}</div></details>
        </section> : <MarkdownRenderer content={visibilitySummary ?? progressSummary ?? inspectionSummary ?? reportSummary ?? message.content} />}
        {reportSummary && <details className="mt-2 text-xs text-muted-foreground"><summary>Source excerpts and full report</summary><div className="whitespace-pre-wrap break-words" dir="auto">{message.content}</div></details>}
        {inspectionInternal && <details className="mt-3 text-xs text-muted-foreground" aria-label="Inspection diagnostics"><summary>Details</summary><div dir="auto" className="break-words whitespace-pre-wrap">{message.content}</div></details>}
        {visibilitySummary && <details className="mt-3 text-xs text-muted-foreground" aria-label="Workspace visibility details"><summary>Details</summary><div className="mt-2 break-words whitespace-pre-wrap [unicode-bidi:plaintext]" dir="auto">{message.content}</div></details>}
        {changeSet && <ChangeReview key={`${changeSet.conversationId}:${changeSet.id}`} changeSet={changeSet} savedState={message.metadata?.changeReviewState} available={changeReviewAvailable} onChanged={onChangeReviewChanged} />}
        {evidence.length > 0 && <details className="mt-3 text-xs text-muted-foreground"><summary>Details · Source outcomes</summary><ul aria-label="File read outcomes" className="mt-2 space-y-1">
          {evidence.map((item, index) => <li key={index}>{item.label}: {item.outcome === "IMAGE_UNAVAILABLE" ? "Image understanding unavailable" : item.outcome}</li>)}
        </ul></details>}
        <ResponseActions content={visibilitySummary ?? progressSummary ?? inspectionSummary ?? reportSummary ?? message.content} />
      </div>
    </div>
  )
}
