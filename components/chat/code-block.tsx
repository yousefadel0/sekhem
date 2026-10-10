"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { Check, Copy } from "lucide-react"

interface CodeBlockProps {
  language?: string
  code: string
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  const handleCopy = useCallback(async () => {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for environments without clipboard API
      const textarea = document.createElement("textarea")
      textarea.value = code
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      try {
        if (!document.execCommand("copy")) throw new Error("Copy unavailable")
        setCopied(true)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => setCopied(false), 2000)
      } catch { setCopied(false); setCopyError(true) } finally {
        document.body.removeChild(textarea)
      }
    }
  }, [code])

  const displayLanguage = language?.trim().toUpperCase() || "TEXT"

  return (
    <div
      className="response-code-block my-3 rounded-md border border-border/60 bg-surface-1 overflow-hidden"
      style={{ boxShadow: "0 2px 12px oklch(0 0 0 / 0.3)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-surface-2/60">
        <span
          className="text-[10px] font-mono tracking-widest text-muted-foreground/70 uppercase select-none"
          aria-label={`Language: ${displayLanguage}`}
        >
          {displayLanguage}
        </span>

        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Code copied" : "Copy code"}
          className={`
            group flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider
            border transition-all duration-200 select-none
            ${
              copied
                ? "border-lime/50 bg-lime/10 text-lime"
                : "border-border/40 bg-surface-3/40 text-muted-foreground hover:border-border/70 hover:text-foreground/80 hover:bg-surface-3/70"
            }
          `}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy
                className="w-3 h-3 transition-transform group-hover:scale-110"
                aria-hidden="true"
              />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {copyError && <p role="alert" className="px-4 py-2 text-xs text-destructive">Copy unavailable. Select the code to copy it.</p>}

      {/* Code body */}
      <div className="overflow-x-auto">
        <pre
          className="code-block-pre p-4 text-[13px] leading-relaxed text-foreground/88 font-mono"
          style={{ minWidth: "max-content" }}
        >
          <code>{code}</code>
        </pre>
      </div>
    </div>
  )
}
