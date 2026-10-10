"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { fetchSekhemApi } from "@/lib/sekhem-api"
import type { SekhemAuthSession } from "@/lib/sekhem-auth"
import { sekhemRoleLabel } from "@/lib/sekhem-roles"
import { demoRoutePolicy, roleCanAccessDemoRoute } from "@/lib/sekhem-route-access"

export function DemoRouteBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const policy = demoRoutePolicy(pathname)
  const [session, setSession] = useState<SekhemAuthSession | null>(null)
  const [checked, setChecked] = useState(policy.mode === "public_demo")

  useEffect(() => {
    let cancelled = false
    if (policy.mode === "public_demo") {
      setChecked(true)
      setSession(null)
      return () => { cancelled = true }
    }

    setChecked(false)
    void fetchSekhemApi<SekhemAuthSession>("/auth/session").then((result) => {
      if (!cancelled) {
        setSession(result?.authenticated ? result : null)
        setChecked(true)
      }
    })
    return () => { cancelled = true }
  }, [pathname, policy.mode])

  if (policy.mode === "public_demo") {
    return <>
      <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-6 py-2 text-xs text-warning">
        <AlertTriangle className="h-4 w-4" />
        <b>DEMO DATA</b> Illustrative records on this route are not Production state.
      </div>
      {children}
    </>
  }

  if (!checked) {
    return <div className="p-6 text-sm text-muted-foreground">Verifying the authenticated session…</div>
  }

  if (!roleCanAccessDemoRoute(pathname, session?.user.role ?? null)) {
    return <div className="p-6">
      <div className="max-w-xl rounded-lg border border-warning/30 bg-warning/5 p-5">
        <h1 className="font-semibold text-foreground">Authenticated access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">This operational screen is unavailable because the session is missing, expired, or lacks the required role.</p>
        <Link className="mt-4 inline-block text-sm text-gold underline" href={`/login?next=${encodeURIComponent(pathname)}`}>Sign in</Link>
      </div>
    </div>
  }

  return <>
    <div className="flex items-center gap-2 border-b border-success/30 bg-success/5 px-6 py-2 text-xs text-success">
      <ShieldCheck className="h-4 w-4" />
      Authenticated operational view · {sekhemRoleLabel(session?.user.role)}
    </div>
    {children}
  </>
}
