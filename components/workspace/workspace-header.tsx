"use client"
import { Bell, ChevronDown, FolderGit2, LogOut, Menu, Settings2 } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { SekhemAuthSession } from "@/lib/sekhem-auth"
import { sekhemRoleLabel } from "@/lib/sekhem-roles"
import type { ProjectSummaryDto } from "@/lib/sekhem-conversation"
import { IconButton, SekhemMark } from "./sekhem-primitives"
import type { WorkspaceRuntimeState } from "@/lib/workspace-runtime-status"

export function WorkspaceHeader({ session, projects, selectedProjectId, isProjectsLoading, onProjectChange, onLogout, onMobileMenuOpen, onSettings, context, runtime }: {
  runtime?: WorkspaceRuntimeState;
  session: SekhemAuthSession | null; projects: ProjectSummaryDto[]; selectedProjectId: string | null; isProjectsLoading: boolean;
  onProjectChange: (id: string) => void; onLogout: () => void; onMobileMenuOpen: () => void; onSettings: () => void; context: string
}) {
  return <header className="sekhem-header">
    <IconButton label="Open navigation menu" onClick={onMobileMenuOpen} className="mobile-menu-button"><Menu size={19} /></IconButton>
    <a className="sekhem-brand" href="/" aria-label="SEKHEM home"><SekhemMark size={36} /><span><strong>SEKHEM</strong><small>AI FOR REAL WORK</small></span></a>
    <div className="project-selector"><FolderGit2 size={15} aria-hidden="true" /><select id="project-selector" aria-label="Select project" disabled={isProjectsLoading || !projects.length} value={selectedProjectId ?? ""} onChange={event => onProjectChange(event.target.value)}>
      {!projects.length && <option value="">{isProjectsLoading ? "Loading projects…" : "No authorized projects"}</option>}
      {projects.map(project => <option key={project.id} value={project.id}>{project.customerFacingName || project.name || project.slug}</option>)}
    </select><ChevronDown size={13} aria-hidden="true" /></div>
    <span className="header-context"><span>/</span>{context}</span>
    <div className="header-actions">
      <Popover><PopoverTrigger asChild><button type="button" className="sekhem-icon-button" aria-label="Notifications" title="Notifications"><Bell size={17} /></button></PopoverTrigger><PopoverContent align="end" className="w-72 text-sm space-y-2"><strong>Notifications</strong><p className="text-muted-foreground text-xs">A global notification feed is not connected. Run activity and approval requests are available inside the current conversation.</p></PopoverContent></Popover>
      <IconButton label="Workspace settings" onClick={onSettings}><Settings2 size={17} /></IconButton>
      <DropdownMenu><DropdownMenuTrigger className="profile-button" aria-label="Account menu"><span className="profile-avatar">{(session?.user.displayName || "U").slice(0, 1)}</span><span className="profile-name">{session?.user.displayName || "Account"}</span><ChevronDown size={12} /></DropdownMenuTrigger>
        <DropdownMenuContent align="end"><DropdownMenuLabel>{session?.user.displayName}<span className="block text-xs font-normal text-muted-foreground">{sekhemRoleLabel(session?.user.role)}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onSelect={onSettings}>Workspace settings</DropdownMenuItem><DropdownMenuItem onSelect={onLogout}><LogOut size={14} />Logout</DropdownMenuItem></DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
}
