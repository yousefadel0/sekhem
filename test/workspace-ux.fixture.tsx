/** Isolated browser layout fixture. No login, Runtime, file access, or Agent calls.
 * Serve only on a separate loopback test port; this is not live acceptance.
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { SekhemShell, PrimaryNavigation, type WorkspaceSection } from "../components/workspace/sekhem-shell"
import { WorkspaceExplorer } from "../components/workspace/workspace-explorer"
import { ProjectChat } from "../components/workspace/project-chat"
import { FilePanel } from "../components/workspace/agent-workspace"

function Fixture() {
  const [surface, setSurface] = useState<"workspace" | "chat" | "agent">("workspace")
  const [section, setSection] = useState<WorkspaceSection>("workspace")
  const [expanded, setExpanded] = useState(false)
  const [drawer, setDrawer] = useState<"navigation" | "explorer" | "chat" | null>(null)
  const [draft, setDraft] = useState("")
  const workspace = () => { setSurface("workspace"); setExpanded(false); setDrawer(null); setSection("workspace") }
  return <SekhemShell collapsed={false} drawer={drawer} onDrawer={setDrawer} mobileSurface={surface} chatExpanded={expanded}
    onSurface={value => { if (value === "workspace") workspace(); else { setSurface(value); setExpanded(false) } }}
    header={<header className="sekhem-header"><strong>SEKHEM</strong><p>UI layout fixture · no Runtime or live acceptance</p></header>}
    navigation={<PrimaryNavigation collapsed={false} onCollapse={() => {}} section={section} onNavigate={value => { if (value === "workspace") workspace(); else { setSection(value); setSurface("agent") } }} />}
    explorer={<WorkspaceExplorer binding={null} status="Unavailable" error={null} onOpen={() => {}} projectId="fixture-project" ensureConversation={async () => "fixture-conversation"} onChanged={async () => {}} onConnect={() => {}} inventory={{ devices: [], grants: [], loading: false, error: null }} />}
    workarea={<div className="engineering-center"><FilePanel file={null} status="No file selected" error={null} onOpen={() => {}} /></div>}
    chat={<ProjectChat expanded={expanded} onExpand={() => setExpanded(value => !value)} onHistory={() => {}} onNew={() => {}} projectName="Fixture project" conversationTitle="Draft preservation test">
      <div className="chat-message-scroll"><div className="chat-thread"><p>Chat remains available while file details are open.</p></div></div>
      <textarea aria-label="Fixture draft" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Draft" />
    </ProjectChat>}
  />
}
createRoot(document.getElementById("root")!).render(<Fixture />)
