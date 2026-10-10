"use client"

import React, { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Shield, AlertCircle, Loader2, ArrowRight } from "lucide-react"
import { runSekhemLoginFlow } from "@/lib/sekhem-auth"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLoading) return

    setIsLoading(true)
    setErrorMessage("")

    try {
      const result = await runSekhemLoginFlow(email, password, () => {
        const next = searchParams.get("next") || "/"
        router.push(next)
      })

      if (!result.authenticated) {
        setErrorMessage(result.message)
      }
    } catch {
      setErrorMessage("An unexpected authentication error occurred.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Brand & Operational Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-secondary/30 text-[11px] font-mono tracking-widest text-muted-foreground uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Sovereign Control Plane
        </div>
        <h1 className="text-3xl font-bold tracking-[0.2em] text-foreground uppercase">
          SEKHEM
        </h1>
        <p className="text-xs text-muted-foreground tracking-wide">
          AI-Assisted Open Infrastructure Platform
        </p>
      </div>

      {/* Primary Authentication Card */}
      <Card className="border-border/60 bg-card/90 shadow-2xl backdrop-blur-sm">
        <CardHeader className="pb-4 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Lock className="w-3.5 h-3.5 text-gold" />
              <span>OPERATOR ENCLAVE</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/70">
              <Shield className="w-3 h-3 text-cyan" />
              <span>AIR-GAPPED READY</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-5">
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Error Notification */}
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md animate-in fade-in-50 duration-200"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
                <span className="font-medium leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Email / Username Field */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-foreground/90">
                Operator Identifier
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@sekhem.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="username"
                className="bg-secondary/20 border-border/60 focus-visible:border-gold/60 focus-visible:ring-gold/30 text-sm font-sans"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium text-foreground/90">
                  Secret Key / Password
                </Label>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                className="bg-secondary/20 border-border/60 focus-visible:border-gold/60 focus-visible:ring-gold/30 text-sm font-sans"
              />
            </div>

            {/* Submission Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-gold text-background hover:bg-gold/90 font-medium text-xs tracking-wider uppercase transition-all duration-150 h-10 shadow-sm"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-background" />
                  Authenticating Session...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Authenticate Session
                  <ArrowRight className="w-3.5 h-3.5 text-background" />
                </span>
              )}
            </Button>
          </form>

          {/* Sovereign Enterprise SSO Area */}
          <div className="pt-4 border-t border-border/40 space-y-2">
            <Button
              type="button"
              variant="outline"
              disabled
              className="w-full text-xs text-muted-foreground border-border/50 bg-secondary/10 opacity-60 cursor-not-allowed h-9"
            >
              Single Sign-On (SSO not configured)
            </Button>
            <p className="text-[11px] text-center text-muted-foreground/60 font-mono">
              Enterprise IdP integration disabled for sovereign tier
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security & Architecture Enclave Notice */}
      <div className="text-center space-y-1">
        <p className="text-[11px] text-muted-foreground/70 tracking-tight">
          Protected by Sekhem Sovereign Security Enclave
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="sekhem-login min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-gold/20 selection:text-gold">
      <Suspense fallback={<div className="w-full max-w-md h-96 rounded-xl border border-border/40 bg-card/50 animate-pulse" />}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
