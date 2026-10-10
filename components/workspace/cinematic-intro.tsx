"use client"
import { useEffect, useState } from "react"

/** Presentation only: never reports simulated initialization or progress. */
export function CinematicIntro() {
  const [visible, setVisible] = useState(false)
  const dismiss = () => {
    setVisible(false)
    try { window.sessionStorage.setItem("sekhem-intro-done", "1") } catch { /* Optional visual preference only. */ }
  }
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    try { if (window.sessionStorage.getItem("sekhem-intro-done")) return } catch { return }
    setVisible(true)
    const timer = window.setTimeout(dismiss, 1100)
    const skip = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss() }
    window.addEventListener("keydown", skip)
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", skip) }
  }, [])
  if (!visible) return null
  return <div className="sekhem-intro" aria-label="SEKHEM introduction">
    <span className="intro-eyebrow">BUILT FOR BUILDERS</span>
    <div className="intro-wordmark" aria-label="SEKHEM">{"SEKHEM".split("").map((letter, index) => <span key={index} style={{ animationDelay: `${index * 70}ms` }} aria-hidden="true">{letter}</span>)}<i aria-hidden="true" /></div>
    <p>YOUR AI ENGINEERING PARTNER</p>
    <span className="intro-footnote">IDEAS <b>→</b> ANALYSIS <b>→</b> REAL IMPACT</span>
    <button type="button" onClick={dismiss} autoFocus>Enter workspace <span>↗</span></button>
  </div>
}
