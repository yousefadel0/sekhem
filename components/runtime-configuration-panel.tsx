"use client"

import { useEffect, useState } from "react"
import type { ComponentProps } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchSekhemApi, mutateSekhemApi } from "@/lib/sekhem-api"

type Provider = {
  id: string; displayName: string; providerType: "vllm_openai_compatible" | "mock"; baseUrl: string;
  apiKeyConfigured: boolean; enabled: boolean; healthState: string; defaultTimeoutMs: number;
  structuredOutputDialect: "LLAMACPP_JSON_SCHEMA" | "OPENAI_JSON_SCHEMA" | "VLLM_STRUCTURED_OUTPUTS" | "JSON_OBJECT_ONLY" | null;
  structuredOutputVerifiedAt: string | null
}
type Model = {
  id: string; providerId: string; modelId: string; displayName: string; enabled: boolean; defaultForProvider: boolean;
  contextWindow: number; maxOutputTokens: number; supportedTasks: string[]
}
type Repository = {
  id: string; displayName: string; providerType: "github" | "gitlab" | "local"; repositoryIdentifier: string;
  credentialConfigured: boolean; defaultBranch: string; allowedBranches: string[]; includePaths: string[]; excludePaths: string[]; enabled: boolean
}

const field = "rounded-md border border-border bg-background px-3 py-2 text-sm"

export function RuntimeConfigurationPanel() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [message, setMessage] = useState("Loading persisted configuration…")
  const [discovered, setDiscovered] = useState<Record<string, string[]>>({})

  async function reload() {
    const [nextProviders, nextModels, nextRepositories] = await Promise.all([
      fetchSekhemApi<Provider[]>("/ai-gateway/providers"),
      fetchSekhemApi<Model[]>("/ai-gateway/models"),
      fetchSekhemApi<Repository[]>("/repository-source/connections"),
    ])
    setProviders(nextProviders ?? [])
    setModels(nextModels ?? [])
    setRepositories(nextRepositories ?? [])
    setMessage(nextProviders && nextModels && nextRepositories ? "Live persisted configuration" : "Configuration API unavailable or this session is not Admin")
  }

  useEffect(() => { void reload() }, [])

  async function createProvider(form: FormData) {
    const providerType = String(form.get("providerType"))
    const result = await mutateSekhemApi<Provider>("POST", "/ai-gateway/providers", {
      displayName: String(form.get("displayName")),
      providerType,
      baseUrl: String(form.get("baseUrl")),
      apiKey: String(form.get("apiKey")),
      defaultTimeoutMs: Number(form.get("defaultTimeoutMs")),
    })
    setMessage(result ? "Provider saved disabled; test it before activation." : "Provider was not saved. Check the fields and Admin session.")
    if (result) await reload()
  }

  async function replaceProviderKey(id: string, form: FormData) {
    const result = await updateProvider(id, { apiKey: String(form.get("apiKey")) }, false)
    setMessage(result ? "Provider key replaced and masked." : "Provider key was not replaced.")
    if (result) await reload()
  }

  async function updateProvider(id: string, data: Record<string, unknown>, refresh = true) {
    const result = await mutateSekhemApi<Provider>("PATCH", `/ai-gateway/providers/${encodeURIComponent(id)}`, data)
    if (refresh) {
      setMessage(result ? "Provider configuration updated; retest before activation." : "Provider update failed safely.")
      if (result) await reload()
    }
    return result
  }

  async function testProvider(id: string) {
    const result = await mutateSekhemApi<Provider>("POST", `/ai-gateway/providers/${encodeURIComponent(id)}/test`)
    setMessage(result?.healthState === "healthy" ? "Provider connection test passed." : "Provider connection test failed safely.")
    await reload()
  }

  async function toggleProvider(provider: Provider) {
    const result = await mutateSekhemApi<Provider>("POST", `/ai-gateway/providers/${encodeURIComponent(provider.id)}/activation`, { enabled: !provider.enabled })
    setMessage(result ? `Provider ${result.enabled ? "activated" : "disabled"}.` : "Provider activation was rejected; a successful test is required.")
    if (result) await reload()
  }

  async function discover(providerId: string) {
    const result = await fetchSekhemApi<string[]>(`/ai-gateway/providers/${encodeURIComponent(providerId)}/discover-models`)
    setDiscovered((current) => ({ ...current, [providerId]: result ?? [] }))
    setMessage(result ? `${result.length} model ID(s) discovered; manual entry remains available.` : "Model discovery failed safely.")
  }

  async function createModel(form: FormData) {
    const result = await mutateSekhemApi<Model>("POST", "/ai-gateway/models", {
      providerId: String(form.get("providerId")),
      modelId: String(form.get("modelId")),
      displayName: String(form.get("displayName")),
      contextWindow: Number(form.get("contextWindow")),
      maxOutputTokens: Number(form.get("maxOutputTokens")),
      supportedTasks: ["repository_analysis"],
      defaultForProvider: form.get("defaultForProvider") === "on",
    })
    setMessage(result ? "Model saved." : "Model was not saved.")
    if (result) await reload()
  }

  async function updateModel(model: Model, data: Record<string, unknown>) {
    const result = await mutateSekhemApi<Model>("PATCH", `/ai-gateway/models/${encodeURIComponent(model.id)}`, data)
    setMessage(result ? "Model configuration updated." : "Model update failed safely.")
    if (result) await reload()
  }

  async function createRepository(form: FormData) {
    const result = await mutateSekhemApi<Repository>("POST", "/repository-source/connections", {
      displayName: String(form.get("displayName")),
      providerType: String(form.get("providerType")),
      repositoryIdentifier: String(form.get("repositoryIdentifier")),
      credential: String(form.get("credential")),
      defaultBranch: String(form.get("defaultBranch")),
      allowedBranches: csv(form.get("allowedBranches")),
      includePaths: csv(form.get("includePaths")),
      excludePaths: csv(form.get("excludePaths")),
    })
    setMessage(result ? "Repository connection saved disabled; test it before enabling." : "Repository connection was not saved.")
    if (result) await reload()
  }

  async function testRepository(id: string) {
    const result = await mutateSekhemApi<{ connected: true; branches: { name: string }[] }>("POST", `/repository-source/connections/${encodeURIComponent(id)}/test`)
    setMessage(result ? `Read-only repository test passed (${result.branches.length} allowed branch(es)).` : "Read-only repository test failed safely.")
  }

  async function updateRepository(repository: Repository, data: Record<string, unknown>) {
    const result = await mutateSekhemApi<Repository>("PATCH", `/repository-source/connections/${encodeURIComponent(repository.id)}`, data)
    setMessage(result ? "Repository connection updated." : "Repository update failed safely.")
    if (result) await reload()
  }

  return <div className="mt-4 space-y-4">
    <div className="rounded-lg border border-cyan/30 bg-cyan/5 p-3 text-xs text-muted-foreground">
      <span className="font-medium text-cyan">{message}</span> Credentials are accepted only by the backend, encrypted at rest, and never returned.
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>AI providers</CardTitle></CardHeader><CardContent className="space-y-4">
        <form action={createProvider} className="grid gap-3 sm:grid-cols-2">
          <Labeled name="displayName" label="Display name" required />
          <label className="space-y-1 text-xs"><span>Provider type</span><select name="providerType" className={`${field} w-full`}><option value="vllm_openai_compatible">vLLM / OpenAI compatible</option><option value="mock">Mock (tests)</option></select></label>
          <Labeled name="baseUrl" label="Base URL" placeholder="http://100.x.x.x:8000" required />
          <Labeled name="defaultTimeoutMs" label="Timeout (ms)" type="number" defaultValue="30000" required />
          <Labeled name="apiKey" label="Optional API key" type="password" autoComplete="new-password" />
          <div className="flex items-end"><Button type="submit">Save provider</Button></div>
        </form>
        {providers.map((provider) => <div key={provider.id} className="rounded-lg border p-3 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><b>{provider.displayName}</b><p className="text-muted-foreground">{provider.providerType === "vllm_openai_compatible" ? "Generic OpenAI-compatible" : provider.providerType} · {provider.baseUrl}</p><p className="text-muted-foreground">Structured output: {provider.structuredOutputDialect ?? "auto / unverified"} · verified {provider.structuredOutputVerifiedAt ? new Date(provider.structuredOutputVerifiedAt).toLocaleString() : "not yet"}</p></div><div className="flex gap-2"><Badge variant="outline">{provider.healthState}</Badge><Badge variant="outline">key {provider.apiKeyConfigured ? "configured" : "not configured"}</Badge></div></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void testProvider(provider.id)}>Test</Button><Button size="sm" variant="outline" onClick={() => void discover(provider.id)}>Discover models</Button><Button size="sm" variant="outline" onClick={() => void toggleProvider(provider)}>{provider.enabled ? "Disable" : "Activate"}</Button></div>
          {discovered[provider.id]?.length ? <p className="text-muted-foreground">Discovered: {discovered[provider.id].join(", ")}</p> : null}
          <form action={async (form) => { const dialect = String(form.get("structuredOutputDialect")); await updateProvider(provider.id, { displayName: String(form.get("displayName")), baseUrl: String(form.get("baseUrl")), defaultTimeoutMs: Number(form.get("defaultTimeoutMs")), ...(dialect ? { structuredOutputDialect: dialect } : {}) }) }} className="grid gap-2 sm:grid-cols-5"><Input name="displayName" defaultValue={provider.displayName} aria-label="Provider display name" /><Input name="baseUrl" defaultValue={provider.baseUrl} aria-label="Provider base URL" /><Input name="defaultTimeoutMs" type="number" defaultValue={provider.defaultTimeoutMs} aria-label="Provider timeout" /><select name="structuredOutputDialect" defaultValue={provider.structuredOutputDialect ?? ""} className={field} aria-label="Structured output dialect"><option value="">Auto-detect on Test</option><option value="LLAMACPP_JSON_SCHEMA">llama.cpp JSON Schema</option><option value="OPENAI_JSON_SCHEMA">OpenAI JSON Schema</option><option value="VLLM_STRUCTURED_OUTPUTS">vLLM structured outputs</option><option value="JSON_OBJECT_ONLY">JSON object compatibility</option></select><Button size="sm" variant="secondary">Save edits</Button></form>
          <form action={(form) => replaceProviderKey(provider.id, form)} className="flex gap-2"><Input name="apiKey" type="password" autoComplete="new-password" placeholder="Replace or clear key" /><Button size="sm" variant="secondary">Replace key</Button></form>
        </div>)}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Models</CardTitle></CardHeader><CardContent className="space-y-4">
        <form action={createModel} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs"><span>Provider</span><select name="providerId" className={`${field} w-full`} required>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
          <Labeled name="modelId" label="Model ID (manual or discovered)" required />
          <Labeled name="displayName" label="Display name" required />
          <Labeled name="contextWindow" label="Context window" type="number" defaultValue="32768" required />
          <Labeled name="maxOutputTokens" label="Max output tokens" type="number" defaultValue="2048" required />
          <label className="flex items-center gap-2 text-xs"><input name="defaultForProvider" type="checkbox" /> Default for provider</label>
          <Button type="submit">Save model</Button>
        </form>
        {models.map((model) => <div key={model.id} className="rounded-lg border p-3 text-xs space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{model.displayName}</b><p className="text-muted-foreground">{model.modelId} · {model.contextWindow} context</p></div><div className="flex gap-2"><Badge variant="outline">{model.defaultForProvider ? "default" : model.enabled ? "enabled" : "disabled"}</Badge><Button size="sm" variant="outline" onClick={() => void updateModel(model, { enabled: !model.enabled })}>{model.enabled ? "Disable" : "Enable"}</Button>{!model.defaultForProvider && <Button size="sm" variant="outline" onClick={() => void updateModel(model, { defaultForProvider: true })}>Make default</Button>}</div></div><form action={(form) => updateModel(model, { displayName: String(form.get("displayName")), modelId: String(form.get("modelId")), contextWindow: Number(form.get("contextWindow")), maxOutputTokens: Number(form.get("maxOutputTokens")) })} className="grid gap-2 sm:grid-cols-5"><Input name="displayName" defaultValue={model.displayName} aria-label="Model display name" /><Input name="modelId" defaultValue={model.modelId} aria-label="Model ID" /><Input name="contextWindow" type="number" defaultValue={model.contextWindow} aria-label="Context window" /><Input name="maxOutputTokens" type="number" defaultValue={model.maxOutputTokens} aria-label="Max output tokens" /><Button size="sm" variant="secondary">Save edits</Button></form></div>)}
      </CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Read-only repository connections</CardTitle></CardHeader><CardContent className="space-y-4">
      <form action={createRepository} className="grid gap-3 md:grid-cols-3">
        <Labeled name="displayName" label="Display name" required />
        <label className="space-y-1 text-xs"><span>Provider type</span><select name="providerType" className={`${field} w-full`}><option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="local">Local read-only</option></select></label>
        <Labeled name="repositoryIdentifier" label="Repository identifier / URL" required />
        <Labeled name="credential" label="Optional read-only credential" type="password" autoComplete="new-password" />
        <Labeled name="defaultBranch" label="Default branch" defaultValue="main" required />
        <Labeled name="allowedBranches" label="Allowed branches (comma separated)" defaultValue="main" required />
        <Labeled name="includePaths" label="Include paths" defaultValue="backend/src/**" required />
        <Labeled name="excludePaths" label="Exclude paths" defaultValue="**/*.generated.*,**/fixtures/**" />
        <div className="flex items-end"><Button type="submit">Save repository</Button></div>
      </form>
      {repositories.map((repository) => <div key={repository.id} className="rounded-lg border p-3 text-xs space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{repository.displayName}</b><p className="text-muted-foreground">{repository.providerType} · {repository.repositoryIdentifier} · {repository.defaultBranch}</p></div><div className="flex gap-2"><Badge variant="outline">credential {repository.credentialConfigured ? "configured" : "not configured"}</Badge><Badge variant="outline">{repository.enabled ? "enabled" : "disabled"}</Badge></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void testRepository(repository.id)}>Test read</Button><Button size="sm" variant="outline" onClick={() => void updateRepository(repository, { enabled: !repository.enabled })}>{repository.enabled ? "Disable" : "Enable"}</Button></div><form action={(form) => updateRepository(repository, { displayName: String(form.get("displayName")), defaultBranch: String(form.get("defaultBranch")), allowedBranches: csv(form.get("allowedBranches")), includePaths: csv(form.get("includePaths")), excludePaths: csv(form.get("excludePaths")) })} className="grid gap-2 md:grid-cols-6"><Input name="displayName" defaultValue={repository.displayName} aria-label="Repository display name" /><Input name="defaultBranch" defaultValue={repository.defaultBranch} aria-label="Default branch" /><Input name="allowedBranches" defaultValue={repository.allowedBranches.join(",")} aria-label="Allowed branches" /><Input name="includePaths" defaultValue={repository.includePaths.join(",")} aria-label="Include paths" /><Input name="excludePaths" defaultValue={repository.excludePaths.join(",")} aria-label="Exclude paths" /><Button size="sm" variant="secondary">Save edits</Button></form><form action={(form) => updateRepository(repository, { credential: String(form.get("credential")) })} className="flex gap-2"><Input name="credential" type="password" autoComplete="new-password" placeholder="Replace or clear read-only credential" /><Button size="sm" variant="secondary">Replace credential</Button></form></div>)}
    </CardContent></Card>
  </div>
}

function Labeled(props: ComponentProps<typeof Input> & { label: string }) {
  const { label, ...input } = props
  return <div className="space-y-1"><Label htmlFor={String(input.name)}>{label}</Label><Input id={String(input.name)} {...input} /></div>
}

function csv(value: FormDataEntryValue | null): string[] {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean)
}
