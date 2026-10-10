"use client"
import { useRef } from "react"

/** Layout only. No workflow state is stored here. */
export function PaneResize({ label, value, min, max, onChange, axis = "x", reverse = false }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void; axis?: "x" | "y"; reverse?: boolean
}) {
  const start = useRef<{ coordinate: number; value: number } | null>(null)
  const change = (delta: number) => onChange(Math.max(min, Math.min(max, value + delta)))
  return <div role="separator" tabIndex={0} aria-label={label} aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} className={`ide-resize ide-resize-${axis}`}
    onPointerDown={e => { start.current = { coordinate: axis === "x" ? e.clientX : e.clientY, value }; e.currentTarget.setPointerCapture(e.pointerId) }}
    onPointerMove={e => { if (start.current) onChange(Math.max(min, Math.min(max, start.current.value + ((axis === "x" ? e.clientX : e.clientY) - start.current.coordinate) * (reverse ? -1 : 1)))) }}
    onPointerUp={e => { start.current = null; e.currentTarget.releasePointerCapture(e.pointerId) }} onPointerCancel={() => { start.current = null }}
    onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); change((e.key === "ArrowLeft" || e.key === "ArrowUp" ? -20 : 20) * (reverse ? -1 : 1)) } }} />
}
