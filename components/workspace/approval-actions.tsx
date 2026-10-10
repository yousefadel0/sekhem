"use client"
import { useState } from "react"

/** Arabic detection matches the backend's existing locale heuristic (conversation.service.ts). */
const ARABIC = /[\u0600-\u06ff]/

export interface ApprovalChoiceHandlers {
  onApprove: () => void | Promise<unknown>
  onReject: () => void | Promise<unknown>
  onSkip?: () => void | Promise<unknown>
  onCancel: () => void | Promise<unknown>
  /** Existing bounded Workspace Read Grant consent; absent when unavailable for this action. */
  onAlwaysAllow?: () => void | Promise<unknown>
  /** Revokes an existing broader read consent through its existing endpoint. */
  onAskEveryTime?: () => void | Promise<unknown>
}

/**
 * Inline human-approval card for one pending Agent action.
 * Reuses only the existing approval/cancellation endpoints wired by callers;
 * it never authorizes anything itself and shows the resulting state after a choice.
 */
export function ApprovalActions({ disabled, state, purpose, target, reason, onApprove, onReject, onSkip, onCancel, onAlwaysAllow, onAskEveryTime }: {
  disabled: boolean
  /** Current persisted approval state label shown to the user. */
  state?: string
  /** What the Agent wants to do (safe summary). */
  purpose?: string
  /** Target path/action when safely available. */
  target?: string
  /** Why approval is required. */
  reason?: string
} & ApprovalChoiceHandlers) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const arabic = ARABIC.test(purpose ?? "") || ARABIC.test(reason ?? "")
  const choose = async (label: { en: string; ar: string }, work: () => void | Promise<unknown>) => {
    if (disabled || busy) return
    setBusy(true); setError(null)
    try { await work(); setDone(label.en) } catch (e) { setError(e instanceof Error ? e.message : "Approval request failed") }
    finally { setBusy(false) }
  }
  const L = (en: string, ar: string) => <>{arabic ? <><span lang="ar" dir="rtl">{ar}</span><span className="approval-label-en" lang="en" dir="ltr"> · {en}</span></> : <span lang="en" dir="ltr">{en}</span>}</>
  return <section className={`workspace-starters approval-card ${arabic ? "is-rtl-mixed" : ""}`} aria-label={arabic ? "مراجعة إجراء صريح" : "Explicit action review"}>
    <p className="approval-waiting" role="status">
      {L("SEKHEM is waiting for your decision.", "سِكِم ينتظر قرارك.")}
      {state && <> <bdi className="approval-state">{state}</bdi></>}
    </p>
    {(purpose !== undefined || target !== undefined || reason !== undefined) && <dl className="approval-receipt">
      {purpose !== undefined && <><dt>{L("Action", "الإجراء")}</dt><dd dir="auto"><bdi>{purpose}</bdi></dd></>}
      {target !== undefined && <><dt>{L("Target", "الهدف")}</dt><dd dir="ltr" className="approval-target"><code>{target}</code></dd></>}
      {reason !== undefined && <><dt>{L("Why approval is required", "سبب طلب الموافقة")}</dt><dd dir="auto"><bdi>{reason}</bdi></dd></>}
    </dl>}
    {onAlwaysAllow && <p>{L("Bounded workspace reading only; no file changes, deletion, or command access. It expires within one hour or sooner with the current access grant.", "قراءة محدودة لمساحة العمل فقط، دون تعديل أو حذف ملفات أو تشغيل أوامر. تنتهي خلال ساعة أو قبل ذلك حسب صلاحية الوصول الحالية.")}</p>}
    <div className="approval-choices" role="group" aria-label={arabic ? "خيارات الموافقة" : "Approval choices"}>
      <button type="button" disabled={disabled || busy} onClick={() => void choose({ en: "Allowed once", ar: "تم السماح مرة واحدة" }, onApprove)}>
        {L("Allow once", "السماح مرة واحدة")}
      </button>
      {onAlwaysAllow && <button type="button" disabled={disabled || busy} onClick={() => void choose({ en: "Bounded workspace reading allowed", ar: "تم السماح بقراءة مساحة العمل لمدة محدودة" }, onAlwaysAllow)}>
        {L("Allow bounded reading (up to 1 hour)", "السماح بالقراءة لمدة محدودة (حتى ساعة)")}
      </button>}
      {onAskEveryTime && <button type="button" disabled={disabled || busy} onClick={() => void choose({ en: "Will ask every time", ar: "سيُطلب الموافقة في كل مرة" }, onAskEveryTime)}>
        {L("Ask every time", "اسألني في كل مرة")}
      </button>}
      <button type="button" disabled={disabled || busy} onClick={() => void choose({ en: "Action rejected", ar: "تم رفض الإجراء" }, onReject)}>
        {L("Reject", "رفض")}
      </button>
      {onSkip && <button type="button" disabled={disabled || busy} onClick={() => void choose({ en: "Action skipped", ar: "تم تجاهل الإجراء" }, onSkip)}>{L("Skip", "تجاهل")}</button>}
      <button type="button" disabled={disabled || busy} onClick={() => void choose({ en: "Operation cancelled", ar: "تم إلغاء العملية" }, onCancel)}>
        {L("Cancel", "إلغاء")}
      </button>
    </div>
    <p className="panel-caption">{L("Only “Allow once” authorizes this reviewed action. Replies in Chat never approve it.", "خيار «السماح مرة واحدة» فقط يصرّح بهذا الإجراء بعد مراجعته. الردود في المحادثة لا تعتبر موافقة.")}</p>
    {busy && <p role="status">{L("Submitting your decision…", "جارٍ إرسال قرارك…")}</p>}
    {done && !busy && <p role="status">{arabic ? <span lang="ar" dir="rtl">الحالة: <bdi>{done}</bdi></span> : <span lang="en" dir="ltr">Resulting state: {done}</span>}</p>}
    {error && <p role="alert" className="workspace-notice"><bdi>{error}</bdi></p>}
  </section>
}
