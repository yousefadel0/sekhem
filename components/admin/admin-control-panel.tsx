"use client"

import { useEffect, useRef, useState } from "react"
import { ADMIN_ROLES, adminList, adminErrorMessage, saveAdminUser, saveAdminMember, removeAdminMember, type AdminUser, type AdminGroup, type AdminMember, type AdminAudit, type AdminRole } from "@/lib/sekhem-admin"
import { postSekhemApi } from "@/lib/sekhem-api"
import { sekhemRoleLabel } from "@/lib/sekhem-roles"
import { RuntimeConfigurationPanel } from "@/components/runtime-configuration-panel"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const field = "min-w-0 rounded-md border border-border bg-background p-2 text-sm"
type Action = (work: () => Promise<unknown>, message: string) => Promise<boolean>
function RoleSelect({ name = "role", value, onChange, disabled = false }: { name?: string; value?: string; onChange?: (value: AdminRole) => void; disabled?: boolean }) {
  return <select aria-label="Role" name={name} className={field} disabled={disabled} value={value} defaultValue={value === undefined ? "Viewer" : undefined} onChange={event => onChange?.(event.target.value as AdminRole)}>{ADMIN_ROLES.map(role => <option key={role} value={role}>{sekhemRoleLabel(role)}</option>)}</select>
}
function UserRow({ user, self, busy, act }: { user: AdminUser; self: boolean; busy: boolean; act: Action }) {
  const [name, setName] = useState(user.displayName), [role, setRole] = useState(user.roles?.[0]?.role.key ?? "Viewer"), [status, setStatus] = useState(user.status)
  const changed = name.trim() !== user.displayName || role !== user.roles?.[0]?.role.key || status !== user.status
  return <form className="rounded-lg border border-border p-3 space-y-2" aria-label={`Edit ${user.email}`} onSubmit={event => {
    event.preventDefault(); void act(() => saveAdminUser(user.id, { displayName: name.trim(), ...(role !== user.roles?.[0]?.role.key ? { role } : {}), ...(status !== user.status ? { status } : {}) }), "Account updated. Role changes and suspension revoke existing sessions.")
  }}><p className="break-all text-sm">{user.email} {self && <span className="text-muted-foreground">(your account)</span>}</p>
    <div className="grid gap-2 sm:grid-cols-3"><Input aria-label="Display name" value={name} required onChange={event => setName(event.target.value)} disabled={busy} /><RoleSelect value={role} onChange={setRole} disabled={self || busy} />
      <select aria-label="Account status" className={field} value={status} disabled={self || busy} onChange={event => setStatus(event.target.value as typeof status)}><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
    <Button size="sm" type="submit" disabled={busy || !changed}>Save account</Button>
  </form>
}
function Membership({ kind, id, users, members, busy, act }: { kind: "projects" | "groups"; id: string; users: AdminUser[]; members: AdminMember[]; busy: boolean; act: Action }) {
  return <div className="space-y-3"><form className="grid gap-2 sm:grid-cols-3" onSubmit={event => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form)
    void act(() => saveAdminMember(kind, id, String(data.get("userId")), String(data.get("role"))), "Membership saved.")
  }}><select aria-label="Member account" name="userId" className={field} required disabled={busy} defaultValue=""><option value="" disabled>Select active account</option>{users.filter(user => user.status === "active").map(user => <option key={user.id} value={user.id}>{user.displayName} · {user.email}</option>)}</select>
    {kind === "projects" ? <RoleSelect disabled={busy} /> : <select aria-label="Group role" name="role" className={field} disabled={busy}><option value="member">Member</option></select>}
    <Button type="submit" disabled={busy}>Save membership</Button></form>
    {members.length === 0 ? <p className="text-sm text-muted-foreground">No members.</p> : members.map(member => <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2"><span className="min-w-0 break-all text-sm">{member.user.displayName} · {kind === "projects" ? sekhemRoleLabel(member.role) : member.role}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => { void act(() => removeAdminMember(kind, id, member.userId), "Membership removed.") }}>Remove member</Button></div>)}
  </div>
}

export function AdminControlPanel({ userId, projectId }: { userId: string; projectId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]), [groups, setGroups] = useState<AdminGroup[]>([]), [members, setMembers] = useState<AdminMember[]>([]), [audit, setAudit] = useState<AdminAudit[]>([])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState("")
  const [tab, setTab] = useState("accounts"), [revision, setRevision] = useState(0)
  const actionPending = useRef(false)
  useEffect(() => {
    let active = true; setLoading(true); setError(null)
    void Promise.all([adminList<AdminUser>("/admin/users"), adminList<AdminGroup>("/admin/groups"), adminList<AdminAudit>("/admin/audit"),
      projectId ? adminList<AdminMember>(`/admin/projects/${encodeURIComponent(projectId)}/members`) : Promise.resolve([])]).then(([nextUsers, nextGroups, nextAudit, nextMembers]) => {
      if (active) { setUsers(nextUsers); setGroups(nextGroups); setAudit(nextAudit); setMembers(nextMembers) }
    }).catch(reason => { if (active) { setUsers([]); setGroups([]); setAudit([]); setMembers([]); setError(adminErrorMessage(reason)) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId, revision])
  const act: Action = async (work, success) => {
    if (actionPending.current) return false
    actionPending.current = true; setBusy(true); setError(null); setMessage("")
    try { await work(); setMessage(success); setRevision(value => value + 1); return true }
    catch (reason) { setError(adminErrorMessage(reason)); return false }
    finally { actionPending.current = false; setBusy(false) }
  }
  return <div className="admin-control-content space-y-4 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">Manage organization accounts and project access. Personal chats and workspaces remain private.</p><Button variant="outline" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>Refresh administration</Button></div>
    {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm break-words">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <Tabs value={tab} onValueChange={setTab}><TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="accounts">Accounts</TabsTrigger><TabsTrigger value="access">Project access</TabsTrigger><TabsTrigger value="services">Services</TabsTrigger><TabsTrigger value="audit">Activity</TabsTrigger></TabsList>
      <TabsContent value="accounts" className="space-y-4">{loading ? <p role="status">Loading accounts…</p> : <>
        {!error && <form className="rounded-lg border border-border p-3 space-y-3" aria-label="Create account" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget, data = new FormData(form)
          void act(() => saveAdminUser(null, { email: String(data.get("email")), displayName: String(data.get("displayName")), password: String(data.get("password")), role: String(data.get("role")) }), "Account created.").then(saved => { if (saved) form.reset() })
        }}><h3 className="font-medium">Create account</h3><div className="grid gap-2 sm:grid-cols-2"><Input aria-label="New account email" name="email" type="email" required placeholder="Email" disabled={busy} /><Input aria-label="New account name" name="displayName" required placeholder="Display name" disabled={busy} /><Input aria-label="Initial password" name="password" type="password" required autoComplete="new-password" placeholder="Initial password" disabled={busy} /><RoleSelect disabled={busy} /></div><Button type="submit" disabled={busy}>Create account</Button></form>}
        {users.length === 0 && !error ? <p>No accounts found.</p> : users.map(user => <UserRow key={`${user.id}:${revision}`} user={user} self={user.id === userId} busy={busy} act={act} />)}
      </>}</TabsContent>
      <TabsContent value="access" className="space-y-5">{loading ? <p>Loading project access…</p> : !error && <>
        <section className="space-y-3"><h3 className="font-medium">Current project members</h3>{projectId ? <Membership kind="projects" id={projectId} users={users} members={members} busy={busy} act={act} /> : <p>Select a project in the workspace first.</p>}</section>
        <section className="space-y-3"><h3 className="font-medium">Groups</h3><form className="flex flex-wrap gap-2" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget, data = new FormData(form)
          void act(() => postSekhemApi("/admin/groups", { name: String(data.get("name")), slug: String(data.get("slug")) }, { throwOnError: true }), "Group created.").then(saved => { if (saved) form.reset() })
        }}><Input aria-label="Group name" name="name" required placeholder="Group name" disabled={busy} /><Input aria-label="Group slug" name="slug" required placeholder="Group identifier" disabled={busy} /><Button type="submit" disabled={busy}>Create group</Button></form>
          {groups.length === 0 ? <p>No groups found.</p> : groups.map(group => <details key={group.id} className="rounded-lg border border-border p-3"><summary>{group.name} · {group.members.length} members</summary><div className="pt-3"><Membership kind="groups" id={group.id} users={users} members={group.members} busy={busy} act={act} /></div></details>)}</section>
      </>}</TabsContent>
      <TabsContent value="services"><p className="text-sm text-muted-foreground">Provider, model and repository configuration. Saving settings does not authorize access to a user's local files.</p>{tab === "services" && <RuntimeConfigurationPanel />}</TabsContent>
      <TabsContent value="audit">{loading ? <p>Loading activity…</p> : !error && <><p className="text-sm text-muted-foreground">Latest 100 organization events.</p>{audit.length === 0 ? <p>No activity recorded.</p> : <ul className="space-y-2">{audit.map(event => <li key={event.id} className="rounded border border-border p-3 text-sm break-words"><strong>{event.action}</strong><p>{event.actor} · {event.module} · {event.target}</p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul>}</>}</TabsContent>
    </Tabs>
  </div>
}
