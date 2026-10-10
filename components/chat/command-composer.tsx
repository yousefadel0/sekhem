"use client"
import { ComposerSubmission } from "@/lib/conversation-restoration"

import { ApprovalModeSelector } from "./approval-mode-selector"
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  ArrowUp,
  Paperclip,
  X,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  File,
  AlertCircle,
  Mic,
  MicOff,
} from "lucide-react"

declare global {
  interface Window {
    SpeechRecognition?: any
    webkitSpeechRecognition?: any
  }
}
import {
  type AttachmentItem,
  type AttachmentValidationError,
  type FileCategory,
  formatFileSize,
  getFileCategory,
  validateFile,
  MAX_FILE_COUNT,
} from "./attachment-types"

// ─── File category icon ───────────────────────────────────────────────────────
function CategoryIcon({ category, className }: { category: FileCategory; className?: string }) {
  const cls = className ?? "w-3.5 h-3.5 shrink-0"
  switch (category) {
    case "image":   return <FileImage className={cls} aria-hidden="true" />
    case "pdf":     return <FileText  className={cls} aria-hidden="true" />
    case "code":    return <FileCode  className={cls} aria-hidden="true" />
    case "data":    return <FileJson  className={cls} aria-hidden="true" />
    case "config":  return <FileCode  className={cls} aria-hidden="true" />
    case "log":     return <FileText  className={cls} aria-hidden="true" />
    case "doc":     return <FileText  className={cls} aria-hidden="true" />
    default:        return <File      className={cls} aria-hidden="true" />
  }
}

// ─── Single attachment chip ───────────────────────────────────────────────────
function AttachmentChip({
  att,
  onRemove,
}: {
  att: AttachmentItem
  onRemove: (id: string) => void
}) {
  const category = getFileCategory(att.file)
  const isImage = category === "image" && att.previewUrl

  return (
    <div
      className="
        group relative flex items-center gap-2
        pl-1.5 pr-2 py-1.5 rounded-lg
        border border-border/50 bg-surface-2/70
        hover:border-lime/25 hover:bg-surface-2/90
        transition-all duration-150
        text-[11px] font-mono
        animate-fade-in
      "
      aria-label={`Attached: ${att.name} (${formatFileSize(att.size)})`}
    >
      {/* Image thumbnail or category icon */}
      {isImage ? (
        <div className="w-8 h-8 rounded overflow-hidden shrink-0 border border-border/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={att.previewUrl}
            alt={att.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-8 h-8 rounded flex items-center justify-center bg-surface-3/50 shrink-0 border border-border/35">
          <CategoryIcon category={category} className="w-3.5 h-3.5 text-lime/60" />
        </div>
      )}

      {/* Filename + size */}
      <div className="flex flex-col min-w-0">
        <span className="text-foreground/80 truncate max-w-[110px] leading-tight">
          {att.name}
        </span>
        <span className="text-muted-foreground/45 text-[9px]">
          {formatFileSize(att.size)}
        </span>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(att.id)}
        aria-label={`Remove ${att.name}`}
        className="
          ml-0.5 w-4 h-4 rounded-full flex items-center justify-center
          text-muted-foreground/40
          hover:text-foreground/70 hover:bg-surface-3/80
          transition-colors duration-100
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime/40
          shrink-0
        "
      >
        <X className="w-2.5 h-2.5" aria-hidden="true" />
      </button>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface CommandComposerProps {
  approvalMode?: unknown
  onApprovalModeChanged?: () => Promise<void>
  value: string
  onChange: (value: string) => void
  onSend: (attachments: AttachmentItem[]) => void
  disabled?: boolean
  currentConversationId?: string | null
  focusTrigger?: unknown
  isGenerating?: boolean
  queuedCount?: number
  onReference?: () => void
}

// ─── Main composer ────────────────────────────────────────────────────────────
export function CommandComposer({
  approvalMode, onApprovalModeChanged,
  value,
  onChange,
  onSend,
  disabled = false,
  currentConversationId,
  focusTrigger,
  isGenerating = false,
  queuedCount = 0,
  onReference,
}: CommandComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const submission = useRef(new ComposerSubmission())
  const submittedDraftValue = useRef(value)
  if (submittedDraftValue.current !== value) {
    submittedDraftValue.current = value
    if (value.trim()) submission.current.edited()
  }
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Attachment state
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [validationError, setValidationError] = useState<AttachmentValidationError | null>(null)

  // Drag & drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const nextHeight = Math.min(el.scrollHeight, 200)
    el.style.height = `${nextHeight}px`
  }, [value])

  // Desktop autofocus
  const focusInput = useCallback(() => {
    if (typeof window === "undefined") return
    if (window.innerWidth < 768) return // Guard against mobile keyboard pop-up
    const activeEl = document.activeElement
    // Do not steal focus if active element is another input, select, textarea, or in a modal
    if (
      activeEl &&
      activeEl !== textareaRef.current &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.tagName === "SELECT" ||
        activeEl.getAttribute("role") === "dialog" ||
        activeEl.closest("[role='dialog']"))
    ) {
      return
    }
    if (textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      focusInput()
    }, 50)
    return () => clearTimeout(timer)
  }, [focusInput, focusTrigger, currentConversationId, disabled])

  // Web Speech API state (native browser speech recognition)
  const [isSpeechSupported, setIsSpeechSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const baseTextRef = useRef("")

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasSpeech = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
      setIsSpeechSupported(hasSpeech)
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (!isSpeechSupported) return

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
      }
      setIsListening(false)
      return
    }

    try {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognitionClass) {
        setIsSpeechSupported(false)
        return
      }

      const recognition = new SpeechRecognitionClass()
      recognitionRef.current = recognition
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US"

      baseTextRef.current = value

      recognition.onstart = () => {
        setIsListening(true)
        setValidationError(null)
      }

      recognition.onresult = (event: any) => {
        let transcript = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        const base = baseTextRef.current.trim()
        const separator = base.length > 0 ? " " : ""
        onChange(`${base}${separator}${transcript.trimStart()}`)
      }

      recognition.onerror = (event: any) => {
        setIsListening(false)
        if (event.error === "not-allowed") {
          setValidationError({
            type: "type",
            message: "Microphone permission was denied. Allow microphone access in your browser to use voice dictation.",
          })
        } else if (event.error !== "no-speech") {
          setValidationError({
            type: "type",
            message: `Voice dictation error: ${event.error}`,
          })
        }
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.start()
    } catch (err) {
      setIsListening(false)
      setValidationError({
        type: "type",
        message: `Failed to initialize speech recognition: ${(err as Error).message}`,
      })
    }
  }, [isSpeechSupported, isListening, value, onChange])

  // Stop listening on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch {}
      }
    }
  }, [])

  // Cleanup object URLs on unmount / removal
  useEffect(() => {
    return () => {
      attachments.forEach((att) => {
        if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
      })
    }
  }, [])

  // ── Process incoming files (from picker, drop, or paste) ──────────────────
  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    setValidationError(null)

    const newAttachments: AttachmentItem[] = []

    for (const file of fileArray) {
      const error = validateFile(file, attachments.length + newAttachments.length)
      if (error) {
        setValidationError(error)
        // Stop processing on first error; don't silently discard
        break
      }

      const isImage = file.type.startsWith("image/")
      const previewUrl = isImage ? URL.createObjectURL(file) : undefined

      newAttachments.push({
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl,
        state: "selected",
      })
    }

    if (newAttachments.length > 0) {
      if (newAttachments.length) submission.current.edited()
      setAttachments((prev) => [...prev, ...newAttachments])
    }
  }, [attachments.length])

  // ── Remove attachment ─────────────────────────────────────────────────────
  const removeAttachment = useCallback((id: string) => {
    submission.current.edited()
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id)
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
    setValidationError(null)
  }, [])

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const hasContent = value.trim().length > 0
    const hasAttachments = attachments.length > 0
    if ((!hasContent && !hasAttachments) || disabled) return

    if (!submission.current.claim()) return
    const attsToSend = [...attachments]

    // Clear attachments — revoke URLs first
    attachments.forEach((att) => {
      if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
    })
    setAttachments([])
    setValidationError(null)

    onSend(attsToSend)

    // Keep focus in the composer immediately available for next message
    setTimeout(() => {
      focusInput()
    }, 50)
  }, [value, attachments, disabled, onSend, focusInput])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      handleSend()
    }
  }

  // ── File picker ───────────────────────────────────────────────────────────
  const handleFilePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
    }
    // Reset input so same file can be re-selected
    e.target.value = ""
    // Safely return focus to textarea immediately so user can press Enter to send
    setTimeout(() => {
      focusInput()
    }, 50)
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "copy"
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragOver(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processFiles(files)
    }
  }

  // ── Paste image from clipboard ────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile()
        if (file) {
          // Rename the pasted file for display; use Blob + cast to avoid TS File ctor issues
          const ext = item.type.split("/")[1] || "png"
          const blob = file.slice(0, file.size, file.type)
          // Object.assign gives us a typed File-like with a proper name
          const namedFile = Object.assign(blob, {
            name: `pasted-image-${Date.now()}.${ext}`,
            lastModified: Date.now(),
          }) as unknown as File
          imageFiles.push(namedFile)
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault()
      processFiles(imageFiles)
    }
    // Otherwise fall through to normal paste behavior
  }, [processFiles])

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled

  // The backend inspects content; the picker must allow unknown text extensions.

  return (
    <div className="command-composer w-full px-3 pb-2 pt-2 shrink-0" data-generating={isGenerating}>

      {/* ── Attachment chips ── */}
      {attachments.length > 0 && (
        <div
          className="flex flex-wrap gap-2 mb-2.5 px-1"
          aria-label="Attached files"
          role="list"
        >
          {attachments.map((att) => (
            <div key={att.id} role="listitem">
              <AttachmentChip att={att} onRemove={removeAttachment} />
            </div>
          ))}
          {attachments.some(att => att.type.startsWith("image/")) && <p className="w-full text-xs text-muted-foreground">Image preview only. Image understanding is unavailable.</p>}
        </div>
      )}

      {/* ── Validation error ── */}
      {validationError && (
        <div
          className="flex items-start gap-2 mx-1 mb-2.5 px-3 py-2 rounded-lg border border-amber/30 bg-amber/6 text-[11px] font-mono text-amber/80 animate-fade-in"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{validationError.message}</span>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="ml-auto shrink-0 text-amber/50 hover:text-amber transition-colors"
            aria-label="Dismiss error"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Outer shell ── */}
      <div
        className={`
          composer-focus-ring
          relative rounded-xl border bg-card/90 backdrop-blur-md
          transition-all duration-200
          ${disabled ? "border-border/30 opacity-75" : ""}
          ${isDragOver
            ? "border-lime/50 bg-lime/[0.03]"
            : disabled
              ? ""
              : "border-border/60 hover:border-border/80"
          }
        `}
        style={{
          boxShadow: isDragOver
            ? "0 0 0 1px oklch(0.93 0.30 116 / 0.2), 0 4px 24px oklch(0 0 0 / 0.35)"
            : "0 4px 24px oklch(0 0 0 / 0.35), 0 1px 4px oklch(0 0 0 / 0.2)",
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag & drop overlay label */}
        {isDragOver && (
          <div
            className="
              absolute inset-0 z-10 rounded-xl flex items-center justify-center
              bg-background/70 backdrop-blur-sm pointer-events-none
            "
            aria-hidden="true"
          >
            <div className="flex flex-col items-center gap-1.5 select-none">
              <div className="w-8 h-8 rounded-full border border-lime/40 bg-lime/8 flex items-center justify-center">
                <Paperclip className="w-3.5 h-3.5 text-lime" />
              </div>
              <span className="text-[11px] font-mono tracking-[0.25em] text-lime/80 uppercase">
                DROP INTO SEKHEM
              </span>
            </div>
          </div>
        )}

        {/* Command indicator dot */}
        <div className="absolute left-4 top-3.5 flex items-center gap-1.5 pointer-events-none select-none">
          <span className="w-1 h-1 rounded-full bg-lime/60 animate-signal-blink" aria-hidden="true" />
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          id="command-composer-input"
          dir="auto"
          value={value}
          onChange={(e) => { submission.current.edited(); onChange(e.target.value) }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Ask SEKHEM anything…"
          disabled={disabled}
          rows={2}
          aria-label="Message input — press Enter to send, Shift+Enter for new line"
          className={`
            w-full resize-none bg-transparent border-0 outline-none
            text-sm text-foreground/90 leading-relaxed
            placeholder:text-muted-foreground/35
            font-sans pl-8 pr-14 pt-3.5 pb-3
            min-h-[52px] max-h-[200px] overflow-y-auto
            ${disabled ? "cursor-not-allowed" : ""}
          `}
          style={{ scrollbarWidth: "none" }}
        />

        {/* Send button */}
        <div className="absolute right-3 bottom-3">
          <button
            type="button"
            id="command-send-button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label={
              disabled
                ? "Message unavailable"
                : isGenerating
                ? "Queue message for this conversation"
                : "Send message"
            }
            title={
              isGenerating
                ? "Generation in progress — click to queue message"
                : "Send message (Enter)"
            }
            className={`
              flex items-center justify-center w-8 h-8 rounded-lg
              font-mono text-xs transition-all duration-150
              ${
                disabled
                  ? "bg-border/30 text-muted-foreground/30 cursor-not-allowed"
                  : canSend
                  ? isGenerating
                    ? "bg-amber text-background hover:bg-amber/85 active:scale-95 shadow-md"
                    : "bg-lime text-background hover:bg-lime/85 active:scale-95 shadow-md"
                  : "bg-surface-2 text-muted-foreground/30 cursor-not-allowed"
              }
            `}
            style={canSend && !disabled ? { boxShadow: isGenerating ? "0 2px 10px oklch(0.80 0.20 80 / 0.3)" : "0 2px 10px oklch(0.93 0.30 116 / 0.3)" } : undefined}
          >
            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Footer bar */}
        <div className="flex items-center justify-between px-3 pb-2.5 pt-0 gap-2">

          {/* Left: Attach button + metadata */}
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground/40 select-none min-w-0">
            {/* Attach button */}
            <button
              type="button"
              id="attachment-picker-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || attachments.length >= MAX_FILE_COUNT}
              aria-label="Attach files"
              title="Attach source files and documents"
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded-md
                border transition-all duration-150
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime/40
                ${
                  disabled || attachments.length >= MAX_FILE_COUNT
                    ? "border-border/20 text-muted-foreground/20 cursor-not-allowed"
                    : attachments.length > 0
                    ? "border-lime/30 bg-lime/6 text-lime/70 hover:border-lime/50 hover:text-lime/90"
                    : "border-border/35 text-muted-foreground/50 hover:border-border/60 hover:text-foreground/60"
                }
              `}
            >
              <Paperclip className="w-3 h-3" aria-hidden="true" />
              {attachments.length > 0 && (
                <span className="text-[10px] font-semibold">{attachments.length}</span>
              )}
            </button>

            {/* Voice Dictation button (Web Speech API) */}
            <button
              type="button"
              id="voice-dictation-button"
              onClick={toggleListening}
              disabled={disabled || !isSpeechSupported}
              aria-label={
                !isSpeechSupported
                  ? "Voice dictation not supported by this browser"
                  : isListening
                  ? "Stop voice dictation"
                  : "Start voice dictation"
              }
              title={
                !isSpeechSupported
                  ? "Voice dictation requires Web Speech API (Chrome/Edge/Safari)"
                  : isListening
                  ? "Listening... Click to stop"
                  : "Voice dictation (Web Speech API)"
              }
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded-md
                border transition-all duration-150
                focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime/40
                ${
                  !isSpeechSupported
                    ? "border-border/20 text-muted-foreground/25 cursor-not-allowed opacity-50"
                    : isListening
                    ? "border-crimson/60 bg-crimson/15 text-crimson animate-pulse shadow-sm"
                    : "border-border/35 text-muted-foreground/50 hover:border-border/60 hover:text-foreground/60"
                }
              `}
            >
              {isListening ? (
                <>
                  <Mic className="w-3 h-3 text-crimson " aria-hidden="true" />
                  <span className="text-[9px] font-mono text-crimson font-semibold tracking-wider">REC</span>
                </>
              ) : !isSpeechSupported ? (
                <MicOff className="w-3 h-3" aria-hidden="true" />
              ) : (
                <Mic className="w-3 h-3" aria-hidden="true" />
              )}
            </button>

            {onReference && <button type="button" className="sekhem-icon-button reference-button" aria-label="Browse workspace files" title="Browse workspace files" onClick={onReference}>@</button>}
            <ApprovalModeSelector key={currentConversationId ?? "new"} conversationId={currentConversationId} mode={approvalMode} disabled={disabled} onChanged={onApprovalModeChanged} />
            {isGenerating && <span className="composer-request-state">Generating…</span>}
            {queuedCount > 0 && <span className="composer-request-state">{queuedCount} queued</span>}
          </div>


        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        id="attachment-file-input"
        multiple
        onChange={handleFilePickerChange}
        className="sr-only"
        aria-label="File attachment input"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}
