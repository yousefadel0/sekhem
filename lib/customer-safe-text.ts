"use client"

const replacements: Array<[RegExp, string]> = [
  [/\bbackend\b/gi, "live"],
  [/\bAPI\b/g, "service"],
  [/\bfixture\b/gi, "sample"],
  [/\bfallback\b/gi, "sample"],
  [/\bpersisted\b/gi, "saved"],
  [/\bread[- ]?back\b/gi, "review"],
  [/\binternal\b/gi, "private"],
  [/\bn8n\b/gi, "workflow system"],
  [/\bproduction\b/gi, "live"],
  [/\blogs?\b/gi, "activity"],
  [/stack traces?/gi, "diagnostics"],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "private address"]
]

export function customerSafeText(value: string | null | undefined, fallback = "available"): string {
  const source = value?.trim() || fallback

  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), source)
}
