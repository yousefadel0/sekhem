"use client"
import { WorkspaceEditor } from "@/components/workspace/workspace-editor"
import { AdminControlPanel } from "@/components/admin/admin-control-panel"
import { PersonalProjectForm } from "@/components/workspace/personal-project-form"
import { SshTargetPanel } from "@/components/workspace/ssh-target-panel"
import { BrowserPanel } from "@/components/workspace/browser-panel"
import { WorkspaceTerminal } from "@/components/workspace/workspace-terminal"
import { CommandPalette } from "@/components/workspace/command-palette"
import { editorReference } from "@/lib/editor-document"
import { clearSubmittedDraft, freshConversationDraft } from "@/lib/conversation-drafts"

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowDown, ArrowUpRight, Bot, FolderKanban, Info, Plus, ShieldCheck } from "lucide-react"
import { fetchSekhemApi, SekhemApiError } from "@/lib/sekhem-api"
import { logoutSekhemSession, type SekhemAuthSession } from "@/lib/sekhem-auth"
import { sekhemRoleLabel } from "@/lib/sekhem-roles"
import {
  fetchProjects,
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  postConversationMessage,
  uploadConversationAttachment,
  isTriggerAgentResponse,
  isConversationTransfer,
  reconcileConversationMessages,
  acknowledgeConversationMessage,
  conversationWorkspaceChanged,
  isConversationWorkspaceConflict,
  CONVERSATION_WORKSPACE_NOTICE,
  type ProjectSummaryDto,
  type ConversationSummaryDto,
  type ConversationMessageDto,
  type AgentRunStatus,
} from "@/lib/sekhem-conversation"
import { acceptsConversationPreview, conversationLocation, restoredConversationMessages, submissionRun } from "@/lib/conversation-restoration"
import { useWorkspaceSurface } from "@/lib/use-workspace-surface"
import { useConversationRuns } from "@/hooks/useConversationRuns"
import { useWorkspace } from "@/hooks/useWorkspace"
import { useWorkspaceRuntime } from "@/hooks/useWorkspaceRuntime"
import { WorkspaceExplorer } from "@/components/workspace/workspace-explorer"
import { AgentRunCard } from "@/components/chat/agent-run-card"
import { conversationAgentRun, getWorkspaceFile, requestWorkspaceOperation, runActivity, type WorkspaceBinding, type WorkspaceFile, type RuntimeWorkspaceBinding, type RuntimeWorkspaceReference, type WorkspaceOperationView } from "@/lib/sekhem-agent"

export type ConversationRequestStatus =
  | "idle"
  | "sending"
  | "generating"
  | "completed"
  | "error"
  | "cancelled"

export interface QueuedMessageItem {
  id: string
  content: string
  attachments: AttachmentItem[]
  createdAt: string
  mode: "auto" | "chat" | "agent"
}

export interface ConversationExecutionState {
  agentRunId: string | null
  status: AgentRunStatus | null
  progress: number
  failureReason: string | null
}

// ─── New cinematic workspace components ──────────────────────────────────────
import { CinematicIntro } from "@/components/workspace/cinematic-intro"
import { WorkspaceHeader } from "@/components/workspace/workspace-header"
import { SessionList } from "@/components/workspace/workspace-sidebar"
import { SekhemShell, PrimaryNavigation, type WorkspaceSection } from "@/components/workspace/sekhem-shell"
import { AgentWorkspace, RunStatusBadge } from "@/components/workspace/agent-workspace"
import { RuntimeAccessStatus, RuntimeSetup, TrustedRuntimeComposer } from "@/components/workspace/trusted-runtime-control"
import { AgentControlCard } from "@/components/workspace/agent-control-card"
import { ProjectChat, ConversationWorkspaceNotice, ConversationWorkspaceIndicator, HistoricalContextControl, ChatContextBar } from "@/components/workspace/project-chat"
import { selectHistoricalContext, type HistoricalContextView } from "@/lib/sekhem-conversation"
import { RuntimeStatus, TechnicalPanel } from "@/components/workspace/sekhem-primitives"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { ChatMessageItem } from "@/components/chat/chat-message-item"
import { ConversationActivity, isRoutineHistory } from "@/components/chat/conversation-activity"
import { ThinkingIndicator } from "@/components/chat/thinking-indicator"
import { CommandComposer } from "@/components/chat/command-composer"
import type { AttachmentItem } from "@/components/chat/attachment-types"

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MainWorkspacePage() {
  const router = useRouter()

  // ── Session state ──
  const [session, setSession] = useState<SekhemAuthSession | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(true)

  // ── Project state ──
  const [projects, setProjects] = useState<ProjectSummaryDto[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const selectedProjectIdRef = useRef(selectedProjectId)
  useEffect(() => { selectedProjectIdRef.current = selectedProjectId }, [selectedProjectId])
  const [isProjectsLoading, setIsProjectsLoading] = useState(true)
  const [projectContractNotice, setProjectContractNotice] = useState<string | null>(null)

  // ── Conversation & message state ──
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [requestStateByConversationId, setRequestStateByConversationId] = useState<Record<string, ConversationRequestStatus>>({})
  const [submittedByConversation, setSubmittedByConversation] = useState<Record<string, { id: string; content: string }>>({})
  const requestInFlight = currentConversationId ? ["sending", "generating"].includes(requestStateByConversationId[currentConversationId] ?? "") : false
  const runState = useConversationRuns(currentConversationId, requestInFlight)
  const conversationAgent = conversationAgentRun(runState.history, runState.details)
  const conversationAgentDetail = conversationAgent ? runState.details[conversationAgent.id] : undefined
  const workspace = useWorkspace(selectedProjectId, runState.conversation?.metadata.runtimeWorkspace as RuntimeWorkspaceReference | undefined)
  const workspaceRuntime = useWorkspaceRuntime(selectedProjectId, workspace.binding?.runtime, workspace.status)
  const runtimeStatus = workspace.binding?.runtime ? workspaceRuntime.state.bindingStatus : workspace.status
  const [runtimeRead, setRuntimeRead] = useState<{ binding: RuntimeWorkspaceBinding; view: WorkspaceOperationView } | null>(null)
  const [pendingWorkspaceRead, setPendingWorkspaceRead] = useState<{ binding: WorkspaceBinding; path: string; conversationId: string | null } | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [editorLocation, setEditorLocation] = useState<{ path: string; line: number } | undefined>()
  const [inspectorTab, setInspectorTab] = useState("files")
  const [selectedFile, setSelectedFile] = useState<WorkspaceFile | null>(null)
  const [fileStatus, setFileStatus] = useState("Idle")
  const [fileError, setFileError] = useState<string | null>(null)
  const fileSequence = useRef(0)
  const restoredConversation = useRef(false)
  const [inputMessage, setInputMessage] = useState("")
  const messageMode = "auto" as "auto" | "chat" | "agent"
  // Per-conversation message storage: keyed by conversation ID (or NEW_CHAT_KEY)
  const [messagesByConversationId, setMessagesByConversationId] = useState<Record<string, ConversationMessageDto[]>>({})
  // Per-conversation request status (idle, sending, generating, completed, error, cancelled)
  // Per-conversation FIFO message queue
  const [queueByConversationId, setQueueByConversationId] = useState<Record<string, QueuedMessageItem[]>>({})
  // Per-conversation composer input drafts
  const [draftsByConversationId, setDraftsByConversationId] = useState<Record<string, string>>({})
  // Per-conversation error / contract notice
  const [errorByConversationId, setErrorByConversationId] = useState<Record<string, string | null>>({})
  // Per-conversation execution dock state


  // General contract / project notice
  const [generalNotice, setGeneralNotice] = useState<string | null>(null)
  // Composer autofocus trigger counter
  const [focusTrigger, setFocusTrigger] = useState(0)
  const [section, setSection] = useState<WorkspaceSection>("workspace")
  const [drawer, setDrawer] = useState<"navigation" | "explorer" | "chat" | null>(null)
  const [mobileSurface, setMobileSurface] = useWorkspaceSurface()
  const [chatExpanded, setChatExpanded] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  useEffect(() => {
    if (session?.user.role === "Admin" && new URLSearchParams(window.location.search).get("admin") === "1") setAdminOpen(true)
  }, [session?.user.role])
  const [chatDetailsOpen, setChatDetailsOpen] = useState(false)
  const revealAgentWorkspace = useCallback(() => { setSection("workspace"); setMobileSurface("agent"); setChatExpanded(false); setDrawer(null) }, [])
  const openWorkspace = useCallback(() => { setSection("workspace"); setMobileSurface("workspace"); setChatExpanded(false); setDrawer(null) }, [])
  useEffect(() => {
    if (workspace.status === "AUTHENTICATION_REQUIRED" || workspaceRuntime.inventory.authenticationRequired) {
      setSession(null); setSessionError("Your session has expired. Sign in again to access your project and workspace.")
    }
  }, [workspace.status, workspaceRuntime.inventory.authenticationRequired])

  // ── Session list state ──
  const [conversations, setConversations] = useState<ConversationSummaryDto[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [conversationsError, setConversationsError] = useState<string | null>(null)
  const isLoadingSession = runState.isLoading && !runState.conversation

  // ── Message attachment map — keyed by optimistic message ID ──────────────────
  const messageAttachmentsRef = useRef<Map<string, AttachmentItem[]>>(new Map())

  // ── Concurrency & sequence refs ─────────────────────────────────────────────
  const currentConversationIdRef = useRef<string | null>(null)
  useEffect(() => {
    currentConversationIdRef.current = currentConversationId
  }, [currentConversationId])

  const conversationListSequence = useRef(0)
  const queueProcessingRef = useRef<Record<string, boolean>>({})
  const workspaceRejectedConversations = useRef(new Set<string>())
  // Ref mirror of queueByConversationId — always kept in sync so the queue
  // processor never suffers from stale-closure or React-18-batching races.
  const queueRefByConversationId = useRef<Record<string, QueuedMessageItem[]>>({})

  const NEW_CHAT_KEY = "__new_chat__"
  const activeKey = currentConversationId ?? NEW_CHAT_KEY
  const activeMessages = messagesByConversationId[activeKey] ?? []
  const activeRequestStatus = requestStateByConversationId[activeKey] ?? "idle"
  const isGenerating = activeRequestStatus === "generating" || activeRequestStatus === "sending"
  const activeQueue = queueByConversationId[activeKey] ?? []
  const selectedRun = runState.selectedRun ?? runState.history.find(run => run.id === runState.selectedId)
  const currentExecution: ConversationExecutionState = {
    agentRunId: selectedRun?.id ?? null, status: selectedRun?.status ?? null,
    progress: selectedRun?.progressPercent ?? 0, failureReason: runState.selectedRun?.failureReason ?? null
  }
  const contractNotice = errorByConversationId[activeKey] || runState.error || generalNotice
  const savedBinding = runState.conversation?.metadata.workspaceBinding as WorkspaceBinding | undefined
  const conversationBinding = workspace.binding?.location === "TRUSTED_RUNTIME" ? workspace.binding : savedBinding ?? workspace.binding
  const bindingChanged = Boolean((currentConversationId && workspaceRejectedConversations.current.has(currentConversationId)) ||
    conversationWorkspaceChanged(runState.conversation, workspace.binding, workspace.status) ||
    (workspace.binding?.location !== "TRUSTED_RUNTIME" && savedBinding && workspace.binding && savedBinding.version !== workspace.binding.version))
  const bindingUnresolved = Boolean(runState.conversation?.modeContext?.workspace && (!workspace.binding || workspace.status === "Loading" || workspace.error))

  // Sets/Records for sidebar indicators:
  const generatingConversationIds = useMemo(() => {
    const set = new Set<string>()
    for (const [id, status] of Object.entries(requestStateByConversationId)) {
      if (status === "generating" || status === "sending") {
        set.add(id)
      }
    }
    return set
  }, [requestStateByConversationId])

  const queuedConversationIds = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [id, q] of Object.entries(queueByConversationId)) {
      if (q && q.length > 0) {
        map[id] = q.length
      }
    }
    return map
  }, [queueByConversationId])

  // ── Workspace UI state ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // ── Scroll intelligence ──
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [hasNewMessage, setHasNewMessage] = useState(false)

  // Reconcile saved messages after run snapshots, retaining only unsent optimistic messages.
  useEffect(() => {
    const detail = runState.conversation
    if (!detail || detail.id !== currentConversationIdRef.current) return
    setSelectedProjectId(detail.projectId)
    window.history.replaceState(null, "", conversationLocation(detail))
    setMessagesByConversationId(previous => {
      return { ...previous, [detail.id]: reconcileConversationMessages(restoredConversationMessages(detail), previous[detail.id] ?? []) }
    })
  }, [runState.conversation])
  useEffect(() => { fileSequence.current++; setSelectedFile(null); setRuntimeRead(null); setPendingWorkspaceRead(null); setFileError(null); setFileStatus("Idle") }, [currentConversationId, selectedProjectId, workspace.binding?.id, workspace.binding?.version])
  const ensureWorkspaceConversation = async (forBinding?: import("@/lib/sekhem-agent").RuntimeWorkspaceBinding) => {
    if (!selectedProjectId) throw new Error("Select an authorized project")
    const current = currentConversationIdRef.current
    const conversation = runState.conversation
    const expected = conversation?.modeContext?.workspace
    const matchesBinding = !!forBinding && !!expected && conversation?.id === current &&
      expected.workspaceId === forBinding.workspaceId && expected.bindingVersion === forBinding.version &&
      expected.runtimeId === forBinding.runtimeId && expected.runtimeFingerprint === forBinding.runtimeFingerprint
    if (forBinding) {
      if (current && matchesBinding) return current
    } else if (current) {
      if (workspaceRejectedConversations.current.has(current) || conversationWorkspaceChanged(conversation, workspace.binding, workspace.status)) {
        throw new Error(CONVERSATION_WORKSPACE_NOTICE)
      }
      return current
    }
    const c = await createConversation(selectedProjectId, "Workspace", undefined, { throwOnError: true })
    if (!c?.id) throw new Error("Conversation creation failed")
    setCurrentConversationId(c.id); currentConversationIdRef.current = c.id
    setGeneralNotice(null)
    window.history.replaceState(null, "", `/?project=${encodeURIComponent(selectedProjectId)}&conversation=${encodeURIComponent(c.id)}`)
    return c.id
  }
  const refreshWorkspace = async () => { if (currentConversationIdRef.current) await runState.refresh(currentConversationIdRef.current); await workspace.refresh(); await workspaceRuntime.refresh() }
  const analyzeRuntimeEvidence = async (instruction: string, reference: import("@/lib/sekhem-agent").RuntimeEvidenceReference) => {
    if (currentConversationIdRef.current !== reference.conversationId || selectedProjectId !== reference.projectId) throw new Error("Select the evidence's original Conversation and project")
    const result = await postConversationMessage(reference.conversationId, instruction, undefined, { triggerAgent: true, runtimeEvidence: [reference], throwOnError: true })
    if (!result || !isTriggerAgentResponse(result)) throw new Error("Agent request was not accepted")
    runState.accept(reference.conversationId, result.agentRunId)
    await runState.refresh(reference.conversationId)
    setInspectorTab("run"); revealAgentWorkspace()
  }
  const openFile = async (binding: WorkspaceBinding, path: string, consentJustApproved = false) => {
    const reference = editorReference(path)
    if (reference) { path = reference.path; setEditorLocation(reference) }
    let origin = currentConversationIdRef.current
    if (binding.location === "TRUSTED_RUNTIME" && !workspaceRuntime.state.readAuthorized && !consentJustApproved) {
      setPendingWorkspaceRead({ binding, path, conversationId: origin }); openWorkspace(); return
    }
    const sequence = ++fileSequence.current
    setInspectorTab("files"); revealAgentWorkspace(); setSelectedFile(null); setFileError(null); setFileStatus("Loading")
    setRuntimeRead(null)
    try {
      if (binding.location === "TRUSTED_RUNTIME") {
        if (!binding.runtime) throw new Error("Runtime binding unavailable")
        const owner = await ensureWorkspaceConversation()
        if (origin && origin !== currentConversationIdRef.current) return
        origin = owner
        if (owner !== currentConversationIdRef.current) return
        const view = await requestWorkspaceOperation(binding.runtime, "file", owner, path)
        if (acceptsConversationPreview(origin, currentConversationIdRef.current, sequence, fileSequence.current)) { setRuntimeRead({ binding: binding.runtime, view }); setFileStatus(view.state) }
        return
      }
      const file = await getWorkspaceFile(binding, path)
      if (acceptsConversationPreview(origin, currentConversationIdRef.current, sequence, fileSequence.current)) { setSelectedFile(file); setFileStatus(file?.status ?? "Unavailable") }
    } catch (error) {
      if (acceptsConversationPreview(origin, currentConversationIdRef.current, sequence, fileSequence.current)) { setFileStatus(error instanceof SekhemApiError && error.status === 403 ? "Unauthorized" : "Unavailable"); setFileError(error instanceof Error ? error.message : "File read failed") }
    }
  }

  // ── Auth + project load ───────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true

    async function checkAuthAndLoadProjects() {
      try {
        const currentSession = await fetchSekhemApi<SekhemAuthSession>("/auth/session", { throwOnError: true })
        if (!isMounted) return

        if (!currentSession?.authenticated) {
          router.push("/login?next=/")
          return
        }
        setSession(currentSession)

        try {
          const projectList = await fetchProjects()
          if (!isMounted) return
          if (Array.isArray(projectList) && projectList.length > 0) {
            setProjects(projectList)
            setSelectedProjectId(projectList.find(project => project.id === new URLSearchParams(window.location.search).get("project"))?.id ?? projectList[0].id)
            setProjectContractNotice(null)
          } else {
            setProjects([])
            setSelectedProjectId(null)
            setProjectContractNotice(
              "Create a personal project from Projects, then connect your computer and choose a folder."
            )
          }
        } catch (error) {
          if (isMounted) {
            setProjects([])
            setSelectedProjectId(null)
            setProjectContractNotice(
              error instanceof Error ? error.message : "Projects are unavailable."
            )
          }
        } finally {
          if (isMounted) setIsProjectsLoading(false)
        }
      } catch (error) {
        if (isMounted && error instanceof SekhemApiError && error.status === 401) router.push("/login?next=/")
        else if (isMounted) setSessionError(error instanceof Error ? error.message : "Session service is unavailable")
      } finally {
        if (isMounted) setIsSessionLoading(false)
      }
    }

    void checkAuthAndLoadProjects()
    return () => { isMounted = false }
  }, [router])

  // ── Load session list whenever project resolves ───────────────────────────
  const loadConversations = useCallback(async (projectId: string | null) => {
    const sequence = ++conversationListSequence.current
    setConversationsLoading(true)
    setConversationsError(null)
    try {
      const list = await listConversations(projectId ?? undefined)
      if (sequence === conversationListSequence.current) setConversations(list)
    } catch (err) {
      if (sequence === conversationListSequence.current) setConversationsError(err instanceof Error ? err.message : "Failed to load sessions")
    } finally {
      if (sequence === conversationListSequence.current) setConversationsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load conversations once we have confirmed auth (isSessionLoading is done)
    if (isSessionLoading) return
    void loadConversations(selectedProjectId)
  }, [selectedProjectId, isSessionLoading])

  // ── Intelligent scroll behavior ───────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const container = chatContainerRef.current
    if (!container) return
    const dist = container.scrollHeight - container.scrollTop - container.clientHeight
    const near = dist < 120
    isNearBottomRef.current = near
    setIsNearBottom(near)
    if (near) setHasNewMessage(false)
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior })
    setHasNewMessage(false)
    setIsNearBottom(true)
    isNearBottomRef.current = true
  }, [])

  useEffect(() => {
    if (activeMessages.length === 0 && !contractNotice) return
    if (isNearBottomRef.current) {
      scrollToBottom()
    } else {
      setHasNewMessage(true)
    }
  }, [activeMessages.length, contractNotice])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await logoutSekhemSession()
    } finally {
      router.push("/login")
    }
  }

  const handleNewChat = useCallback(() => {
    restoredConversation.current = true
    window.history.replaceState(null, "", selectedProjectId ? `/?project=${encodeURIComponent(selectedProjectId)}` : "/")
    // 1. Save current active conversation draft
    const prevKey = currentConversationIdRef.current ?? NEW_CHAT_KEY
    setDraftsByConversationId(prev => freshConversationDraft(prev, prevKey, inputMessage, NEW_CHAT_KEY))

    // 2. Switch to new chat
    setCurrentConversationId(null)
    currentConversationIdRef.current = null
    setGeneralNotice(null)
    setInputMessage("")
    setDraftsByConversationId(previous => ({ ...previous, [NEW_CHAT_KEY]: "" }))
    setInspectorTab("run")
    setDrawer(null)
    setFocusTrigger((c) => c + 1)
    scrollToBottom("instant")
  }, [inputMessage, draftsByConversationId, scrollToBottom, selectedProjectId])

  // ── Select an existing session (concurrency safe: never mutates other in-flight sessions) ──
  const handleSelectSession = useCallback((conversationId: string) => {
    if (conversationId === currentConversationIdRef.current) return
    fileSequence.current++; setSelectedFile(null); setRuntimeRead(null); setPendingWorkspaceRead(null); setFileError(null); setFileStatus("Idle")
    restoredConversation.current = true
    const previousKey = currentConversationIdRef.current ?? NEW_CHAT_KEY
    setDraftsByConversationId(previous => ({ ...previous, [previousKey]: inputMessage }))
    setCurrentConversationId(conversationId)
    currentConversationIdRef.current = conversationId
    setInputMessage(draftsByConversationId[conversationId] ?? "")
    setDrawer(null)
    setFocusTrigger(value => value + 1)
    setInspectorTab("run")
    setGeneralNotice(null)
    // The hook fetches once; its authorized response restores the actual project and URL.
    scrollToBottom("instant")
  }, [inputMessage, draftsByConversationId, scrollToBottom])


  // ── Per-conversation FIFO message queue processor ──────────────────────────
  // DESIGN: reads from queueRefByConversationId (a mutable ref always kept in
  // sync with React state) so we never rely on reading state inside a setter
  // which is subject to React-18 batching races.
  const processConversationQueue = useCallback(async (convId: string) => {
    if (queueProcessingRef.current[convId] || workspaceRejectedConversations.current.has(convId)) return

    // Read the ref directly — always up-to-date, no batching race.
    const currentRefQueue = queueRefByConversationId.current[convId] ?? []
    if (currentRefQueue.length === 0) {
      setRequestStateByConversationId((prev) => {
        if (prev[convId] === "error") return prev
        return { ...prev, [convId]: "idle" }
      })
      return
    }

    // Dequeue the head item from the ref first.
    const itemToProcess = currentRefQueue[0]
    const remaining = currentRefQueue.slice(1)
    queueRefByConversationId.current[convId] = remaining

    // Sync React state to reflect the dequeue.
    setQueueByConversationId((prev) => ({
      ...prev,
      [convId]: remaining,
    }))

    queueProcessingRef.current[convId] = true
    setSubmittedByConversation(previous => ({ ...previous, [convId]: { id: itemToProcess.id, content: itemToProcess.content } }))
    setRequestStateByConversationId((prev) => ({ ...prev, [convId]: "generating" }))

    try {
      // 1. Upload attachments if present
      const uploadedAttachmentIds: string[] = []
      if (itemToProcess.attachments && itemToProcess.attachments.length > 0) {
        for (const att of itemToProcess.attachments) {
          const uploaded = await uploadConversationAttachment(convId, att.file, { throwOnError: true })
          if (uploaded?.id) {
            uploadedAttachmentIds.push(uploaded.id)
          }
        }
      }

      // 2. Dispatch the message to the real Conversation API.
      const result = await postConversationMessage(
        convId,
        itemToProcess.content,
        { clientMessageId: itemToProcess.id },
        {
          ...(itemToProcess.mode === "chat" ? { chat: true } : itemToProcess.mode === "agent" ? { triggerAgent: true } : {}),
          attachmentIds: uploadedAttachmentIds.length > 0 ? uploadedAttachmentIds : undefined,
          throwOnError: true,
        }
      )

      if (!result) {
        throw new Error("Backend did not return a response from POST /api/conversations/:id/messages")
      }

      // Clear the queued flag on the optimistic user message and append
      // the assistant reply (if standard response).
      setMessagesByConversationId((prev) => {
        const thread = prev[convId] ?? []
        const updatedThread = thread.map((m) =>
          m.id === itemToProcess.id ? { ...m, metadata: { ...m.metadata, isQueued: false } } : m
        )
        if (isTriggerAgentResponse(result) || isConversationTransfer(result)) {
          return { ...prev, [convId]: acknowledgeConversationMessage(updatedThread, itemToProcess.id, result.messageId) }
        }
        if (updatedThread.some((m) => m.id === result.id)) {
          return { ...prev, [convId]: updatedThread }
        }
        return {
          ...prev,
          [convId]: [...updatedThread, result],
        }
      })

      if (isConversationTransfer(result)) {
        await runState.refresh(convId)
        await loadConversations(selectedProjectIdRef.current)
      } else if (isTriggerAgentResponse(result)) {
        runState.accept(convId, result.agentRunId)
        setInspectorTab("run")
        if (currentConversationIdRef.current === convId) {
          setMobileSurface("chat")
        }
      } else {
        void runState.refresh(convId)
        if (currentConversationIdRef.current === convId) {
          setFocusTrigger((c) => c + 1)
        }
      }
    } catch (error) {
      const workspaceConflict = isConversationWorkspaceConflict(error)
      if (workspaceConflict) workspaceRejectedConversations.current.add(convId)
      const msg =
        error instanceof SekhemApiError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unknown dispatch error"
      setErrorByConversationId((prev) => ({
        ...prev,
        [convId]: workspaceConflict ? CONVERSATION_WORKSPACE_NOTICE : `Queued Dispatch Failure: ${msg}`,
      }))
      setRequestStateByConversationId((prev) => ({ ...prev, [convId]: "error" }))
    } finally {
      queueProcessingRef.current[convId] = false
      // Check the ref for remaining items — dispatch next immediately.
      const afterQueue = queueRefByConversationId.current[convId] ?? []
      if (afterQueue.length > 0 && !workspaceRejectedConversations.current.has(convId)) {
        setTimeout(() => {
          void processConversationQueue(convId)
        }, 0)
      } else {
        setRequestStateByConversationId((prev) => {
          if (prev[convId] === "error") return prev
          return { ...prev, [convId]: "idle" }
        })
      }
    }
  }, [])

  // ── Send message (strictly immutable requestConversationId binding) ────────
  const handleSendMessage = async (contentToSend?: string, attachments: AttachmentItem[] = []) => {
    const draftOrigin = currentConversationIdRef.current ?? NEW_CHAT_KEY
    const text = (contentToSend ?? inputMessage).trim()
    if (currentConversationIdRef.current && !runState.conversation) return
    // Allow send if there's text OR attachments
    if (!text && attachments.length === 0) return
    if (bindingChanged || bindingUnresolved) { setGeneralNotice(bindingChanged ? CONVERSATION_WORKSPACE_NOTICE : "Checking this conversation's workspace binding. Try again when it is available."); return }

    if (!selectedProjectId) {
      setGeneralNotice(
        "Select an authorized project before sending a message."
      )
      return
    }

    let targetConvId = currentConversationIdRef.current

    if (!targetConvId) {
      try {
        const newConv = await createConversation(
          selectedProjectId,
          text.slice(0, 48) || "Workspace Session",
          undefined,
          { throwOnError: true }
        )
        if (!newConv?.id) {
          throw new Error("Backend did not return a conversation ID from POST /api/conversations")
        }
        targetConvId = newConv.id
        setCurrentConversationId(targetConvId)
        currentConversationIdRef.current = targetConvId
        window.history.replaceState(null, "", `/?project=${encodeURIComponent(selectedProjectId)}&conversation=${encodeURIComponent(targetConvId)}`)
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : "Failed to initialize conversation"
        setGeneralNotice(`Initialization Failure: ${msg}`)
        return
      }
    }

    // ── Concurrency invariant: capture immutable requestConversationId ────────
    const requestConversationId = targetConvId

    // Clear input and draft for active conversation
    if (currentConversationIdRef.current === requestConversationId) setInputMessage("")
    setDraftsByConversationId(prev => clearSubmittedDraft(prev, requestConversationId, NEW_CHAT_KEY, draftOrigin))

    const isCurrentlyBusy =
      requestStateByConversationId[requestConversationId] === "generating" ||
      requestStateByConversationId[requestConversationId] === "sending"

    const clientUserMsgId = isCurrentlyBusy
      ? `msg_user_queued_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      : `msg_user_opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    const userMessage: ConversationMessageDto = {
      id: clientUserMsgId,
      conversationId: requestConversationId,
      senderId: session?.user?.id ?? "user",
      senderType: "user",
      content: text,
      metadata: isCurrentlyBusy ? { isQueued: true } : {},
      createdAt: new Date().toISOString(),
    }

    if (attachments.length > 0) {
      messageAttachmentsRef.current.set(clientUserMsgId, attachments)
    }

    setMessagesByConversationId((prev) => ({
      ...prev,
      [requestConversationId]: [...(prev[requestConversationId] ?? []), userMessage],
    }))

    if (isCurrentlyBusy) {
      const queueItem: QueuedMessageItem = {
        id: clientUserMsgId,
        content: text,
        attachments,
        createdAt: userMessage.createdAt,
        mode: messageMode,
      }
      // Update BOTH the ref mirror AND the React state atomically so the
      // queue processor always reads a fresh queue from the ref.
      queueRefByConversationId.current[requestConversationId] = [
        ...(queueRefByConversationId.current[requestConversationId] ?? []),
        queueItem,
      ]
      setQueueByConversationId((prev) => ({
        ...prev,
        [requestConversationId]: [...(prev[requestConversationId] ?? []), queueItem],
      }))
      return
    }

    setRequestStateByConversationId((prev) => ({ ...prev, [requestConversationId]: "generating" }))
    setSubmittedByConversation(previous => ({ ...previous, [requestConversationId]: { id: clientUserMsgId, content: text } }))
    setErrorByConversationId((prev) => ({ ...prev, [requestConversationId]: null }))
    setGeneralNotice(null)

    try {
      // 1. Upload attachments if present to durable storage via POST /api/conversations/:id/attachments
      const uploadedAttachmentIds: string[] = []
      if (attachments.length > 0) {
        for (const att of attachments) {
          const uploaded = await uploadConversationAttachment(requestConversationId, att.file, { throwOnError: true })
          if (uploaded?.id) {
            uploadedAttachmentIds.push(uploaded.id)
          }
        }
      }

      // 2. Dispatch chat message with real attachment IDs
      const result = await postConversationMessage(
        requestConversationId,
        text,
        { clientMessageId: clientUserMsgId },
        {
          ...(messageMode === "chat" ? { chat: true } : messageMode === "agent" ? { triggerAgent: true } : {}),
          attachmentIds: uploadedAttachmentIds.length > 0 ? uploadedAttachmentIds : undefined,
          throwOnError: true,
        }
      )

      if (!result) {
        throw new Error("Backend did not return a response from POST /api/conversations/:id/messages")
      }

      if (isTriggerAgentResponse(result) || isConversationTransfer(result)) {
        setMessagesByConversationId(prev => ({ ...prev, [requestConversationId]:
          acknowledgeConversationMessage(prev[requestConversationId] ?? [], clientUserMsgId, result.messageId) }))
      }
      if (isConversationTransfer(result)) {
        await runState.refresh(requestConversationId)
      } else if (isTriggerAgentResponse(result)) {
        runState.accept(requestConversationId, result.agentRunId)
        setInspectorTab("run")
        if (currentConversationIdRef.current === requestConversationId) {
          setMobileSurface("chat")
        }
      } else {
        void runState.refresh(requestConversationId)
        // Standard ConversationMessageDto: append ONLY to requestConversationId bucket
        setMessagesByConversationId((prev) => {
          const thread = prev[requestConversationId] ?? []
          if (thread.some((m) => m.id === result.id)) return prev
          return {
            ...prev,
            [requestConversationId]: [...thread, result],
          }
        })
        if (currentConversationIdRef.current === requestConversationId) {
          setFocusTrigger((c) => c + 1)
        }
      }

      // A completed request may belong to a project the user has since left.
      void loadConversations(selectedProjectIdRef.current)
    } catch (error) {
      const workspaceConflict = isConversationWorkspaceConflict(error)
      if (workspaceConflict) { workspaceRejectedConversations.current.add(requestConversationId); void workspace.refresh() }
      // Delivery uncertainty is resolved from saved state, never by another POST.
      void runState.refresh(requestConversationId)
      const message =
        error instanceof SekhemApiError
          ? `${error.code}: ${error.message}`
          : error instanceof Error
            ? error.message
            : "Unknown error occurred while communicating with backend conversation endpoints."
      setErrorByConversationId((prev) => ({
        ...prev,
        [requestConversationId]: workspaceConflict ? CONVERSATION_WORKSPACE_NOTICE : `Dispatch Failure: ${message}`,
      }))
      setRequestStateByConversationId((prev) => ({ ...prev, [requestConversationId]: "error" }))
    } finally {
      // Drain: use the ref mirror, not state inside a setter.
      const remainingQueue = queueRefByConversationId.current[requestConversationId] ?? []
      if (remainingQueue.length > 0 && !workspaceRejectedConversations.current.has(requestConversationId)) {
        setTimeout(() => {
          void processConversationQueue(requestConversationId)
        }, 0)
      } else {
        setRequestStateByConversationId((prev) => {
          if (prev[requestConversationId] === "error") return prev
          return { ...prev, [requestConversationId]: "idle" }
        })
      }
    }
  }

  // ── Rename and delete conversation handlers ────────────────────────────────
  const handleRenameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    try {
      const updated = await updateConversation(conversationId, { title: newTitle }, { throwOnError: true })
      if (updated) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conversationId ? { ...c, title: updated.title, updatedAt: updated.updatedAt } : c))
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to rename session"
      setErrorByConversationId((prev) => ({
        ...prev,
        [conversationId]: `Rename Error: ${msg}`,
      }))
    }
  }, [])

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    try {
      await deleteConversation(conversationId, { throwOnError: true })
      setConversations((prev) => prev.filter((c) => c.id !== conversationId))

      // Clean up in-memory state for deleted session
      setMessagesByConversationId((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
      setRequestStateByConversationId((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
      setQueueByConversationId((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })
      // Also clear the ref mirror so stale queued items never dispatch
      // after the conversation is deleted.
      delete queueRefByConversationId.current[conversationId]
      setDraftsByConversationId((prev) => {
        const next = { ...prev }
        delete next[conversationId]
        return next
      })


      // If active conversation was deleted, navigate to New Chat
      if (currentConversationIdRef.current === conversationId) {
        setCurrentConversationId(null)
        currentConversationIdRef.current = null
        setInputMessage("")
        setDraftsByConversationId(previous => ({ ...previous, [NEW_CHAT_KEY]: "" }))
        setInspectorTab("run")
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete session"
      setErrorByConversationId((prev) => ({
        ...prev,
        [conversationId]: `Delete Error: ${msg}`,
      }))
    }
  }, [draftsByConversationId])

  const handleAssignGroupConversation = useCallback(async (conversationId: string, groupName: string) => {
    try {
      // Persist groupName in conversation metadata via PATCH /api/conversations/:id
      const updated = await updateConversation(
        conversationId,
        { metadata: { groupName: groupName || null } },
        { throwOnError: true }
      )
      if (updated) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, metadata: { ...(c.metadata ?? {}), groupName: groupName || undefined }, updatedAt: updated.updatedAt }
              : c
          )
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assign group"
      setErrorByConversationId((prev) => ({
        ...prev,
        [conversationId]: `Group Assignment Error: ${msg}`,
      }))
    }
  }, [])

  // ── Session loading screen ────────────────────────────────────────────────
  useEffect(() => {
    if (restoredConversation.current || isSessionLoading || !session?.authenticated) return
    restoredConversation.current = true
    const id = new URLSearchParams(window.location.search).get("conversation")
    if (id) handleSelectSession(id)
  }, [isSessionLoading, session?.authenticated, handleSelectSession])
  if (sessionError) return <main className="p-8 space-y-4"><h1>Session unavailable</h1><p role="alert">{sessionError}</p><a className="technical-button" href="/login?next=/">Sign in</a><button type="button" className="technical-button" onClick={() => window.location.reload()}>Retry</button></main>

  if (isSessionLoading) {
    return (
      <main
        className="min-h-screen bg-background flex flex-col items-center justify-center"
        aria-label="Loading SEKHEM"
      >
        {/* Ambient glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 50% 40% at 50% 50%, oklch(0.93 0.30 116 / 0.04), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-center gap-5">
          {/* Orbital spinner */}
          <div className="relative flex items-center justify-center w-12 h-12">
            <svg
              width="48" height="48" viewBox="0 0 48 48" fill="none"
              className="animate-orbital-spin text-lime"
              style={{ filter: "drop-shadow(0 0 6px oklch(0.93 0.30 116 / 0.35))" }}
              aria-hidden="true"
            >
              <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1" strokeDasharray="8 5" opacity="0.5" />
              <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="1" strokeDasharray="5 5" strokeDashoffset="5" opacity="0.35" />
              <circle cx="24" cy="24" r="3.5" fill="currentColor" />
            </svg>
          </div>
          <div className="text-center space-y-1.5">
            <p className="text-[11px] font-mono tracking-[0.35em] text-muted-foreground/70 uppercase">
              SEKHEM
            </p>
            <p className="text-[10px] font-mono text-muted-foreground/40 tracking-wider">
              Verifying operator session…
            </p>
          </div>
        </div>
      </main>
    )
  }

  const renderRunCard = (run: import("@/lib/sekhem-agent").AgentRunSummary) => <React.Fragment key={run.id}><AgentRunCard run={run} detail={runState.details[run.id]}
    onAsk={() => setFocusTrigger(value => value + 1)}
    approvalMode={runState.conversation?.metadata.approvalMode === "TASK" ? "TASK" : "MANUAL"}
    stale={runState.isStale}
    conversationId={currentConversationId ?? undefined}
    onChanged={async () => { if (currentConversationId) await runState.refresh(currentConversationId) }}
    proceedDisabled={isGenerating || bindingChanged || bindingUnresolved}
    onProceed={planId => { void handleSendMessage(`Proceed with plan ${planId}`).finally(() => { if (currentConversationId) void runState.refresh(currentConversationId) }) }}
    activity={runState.details[run.id]?.activity?.at(-1)?.eventType}
    onSelect={() => { if (currentConversationId) runState.select(currentConversationId, run.id); setInspectorTab("run"); revealAgentWorkspace() }} />
    {run.workflow?.proposal.state === "READY" && !!run.workflow.proposal.changes?.length && !run.execution && workspaceRuntime.state.binding && <details className="chat-run-access"><summary>Change authorization · Runtime access details</summary><RuntimeAccessStatus key={`access:${run.id}`} projectId={selectedProjectId} runtimeId={workspaceRuntime.state.binding.runtimeId} required={["filesystem.write"]} inventory={runState.isStale || bindingChanged || bindingUnresolved ? { ...workspaceRuntime.inventory, error: "Current conversation bindings unavailable" } : workspaceRuntime.inventory} onConfigure={() => setSettingsOpen(true)} onChanged={refreshWorkspace} /></details>}
    {mobileSurface !== "agent" && (!(runState.details[run.id]?.inspection ?? run.inspection) || (runState.details[run.id]?.inspection ?? run.inspection)?.state === "AWAITING_APPROVAL") && (!["COMPLETED", "CANCELLED", "FAILED"].includes(run.status) || Boolean(runState.details[run.id]?.pendingApprovals.length)) && <AgentControlCard run={runState.details[run.id]} runtime={workspaceRuntime.state} onChanged={async () => { if (currentConversationId) await runState.refresh(currentConversationId) }} />}</React.Fragment>

  const selectedProject = projects.find(project => project.id === selectedProjectId)
  const projectName = selectedProject?.customerFacingName || selectedProject?.name
  const chooseProject = (id: string) => {
    restoredConversation.current = true
    window.history.replaceState(null, "", `/?project=${encodeURIComponent(id)}`)
    setSelectedProjectId(id)
    setCurrentConversationId(null)
    currentConversationIdRef.current = null
    setGeneralNotice(null)
    setInputMessage("")
    setInspectorTab("run")
    openWorkspace()
  }
  const suggestPrompt = (prompt: string) => {
    setInputMessage(prompt)
    setDraftsByConversationId(previous => ({ ...previous, [activeKey]: prompt }))
    setFocusTrigger(value => value + 1)
    setMobileSurface("chat")
  }
  const navigate = (value: WorkspaceSection) => {
    setDrawer(null)
    if (value === "workspace") { openWorkspace(); return }
    if (value === "conversations") { setHistoryOpen(true); return }
    if (value === "settings") { setSettingsOpen(true); return }
    if (value === "search") {
      openWorkspace()
      window.setTimeout(() => document.getElementById("workspace-file-search")?.focus(), 0)
      return
    }
    setSection(value); setMobileSurface(value === "home" ? "chat" : "agent"); setChatExpanded(false)
  }
  const advancedRuntimeControls = <TrustedRuntimeComposer runtime={workspaceRuntime.state} inventory={workspaceRuntime.inventory} onRefresh={workspaceRuntime.refresh} projectId={selectedProjectId} ensureConversation={async () => {
    if (!selectedProjectId) throw new Error("Select an authorized project")
    if (currentConversationIdRef.current) return currentConversationIdRef.current
    const c = await createConversation(selectedProjectId, "Trusted runtime actions", undefined, { throwOnError: true })
    if (!c?.id) throw new Error("Conversation creation failed")
    setCurrentConversationId(c.id); currentConversationIdRef.current = c.id
    window.history.replaceState(null, "", `/?project=${encodeURIComponent(selectedProjectId)}&conversation=${encodeURIComponent(c.id)}`)
    return c.id
  }} onProposed={async (conversationId, runId) => {
    await runState.refresh(conversationId); runState.select(conversationId, runId); handleSelectSession(conversationId)
    setInspectorTab("run"); revealAgentWorkspace(); await loadConversations(selectedProjectId)
  }} />
  const workarea = <div className="engineering-center">
    <CommandPalette onOpenFile={(path, line) => { if (workspace.binding) { setEditorLocation({ path, line: line ?? 1 }); setInspectorTab("files"); if (runtimeRead?.view.operation.relativePath !== path || workspace.binding.id !== runtimeRead.binding.workspaceId || String(workspace.binding.version) !== String(runtimeRead.binding.version)) void openFile(workspace.binding, path) } }} actions={[
      { name: "Search Workspace", run: () => { openWorkspace(); (document.querySelector<HTMLInputElement>('input[aria-label="Search workspace text"]') ?? document.getElementById("workspace-file-search"))?.focus() } },
      { name: "New Terminal", run: () => { if (terminalOpen) window.dispatchEvent(new Event("sekhem-new-terminal")); else setTerminalOpen(true) } },
      { name: "Split Editor", run: () => window.dispatchEvent(new CustomEvent("sekhem-editor-command", { detail: "split" })) },
      { name: "Close Editor", run: () => window.dispatchEvent(new CustomEvent("sekhem-editor-command", { detail: "close" })) },
      { name: "Find in File", run: () => window.dispatchEvent(new CustomEvent("sekhem-editor-command", { detail: "find" })) },
      { name: "Ask SEKHEM", run: () => suggestPrompt("") },
      { name: "Review Pending Proposal", run: () => navigate("approvals") },
      { name: "Show Agent Activity", run: () => { setInspectorTab("run"); revealAgentWorkspace() } },
      { name: "Show Approvals", run: () => navigate("approvals") },
      { name: "Refresh Workspace", run: () => void refreshWorkspace() },
    ]} />
    <div className="workspace-context-line"><span>{projectName ?? "No project"} <span>/</span> {section === "runs" ? "Agent Runs" : section === "approvals" ? "Approvals" : section === "projects" ? "Projects" : section === "home" ? "Home" : "Workspace"}</span><span>{conversationBinding?.name ?? "No workspace bound"}</span></div>
    <button type="button" className="technical-button" aria-expanded={terminalOpen} onClick={() => setTerminalOpen(value => !value)}>Terminal / PowerShell</button>
    {(projectContractNotice || bindingChanged || runState.error) && <div className="workspace-notice" role="alert">{projectContractNotice || (bindingChanged ? "The workspace binding changed. Start a new conversation to use the current workspace." : runState.error)}{runState.error && currentConversationId && <button type="button" className="technical-button" onClick={() => void runState.refresh(currentConversationId)}>Refresh conversation</button>}</div>}
    {section === "projects" ? <TechnicalPanel className="section-page"><div className="empty-kicker">PROJECTS</div><h1>Your engineering projects</h1><PersonalProjectForm onCreated={async id => { const next = await fetchProjects(); if (!next) throw new Error("Project was created but its list could not be refreshed. Reload Projects."); setProjects(next); setProjectContractNotice(null); chooseProject(id) }} /><p className="panel-caption">Your personal projects and shared projects you belong to.</p><div className="project-cards">{projects.map(project => <button key={project.id} type="button" onClick={() => chooseProject(project.id)}><FolderKanban size={23} /><strong>{project.customerFacingName || project.name}</strong><span>{project.slug}</span><ArrowUpRight size={16} /></button>)}</div>{!projects.length && <p className="panel-empty">{projectContractNotice || "Create your first personal project."}</p>}</TechnicalPanel>
      : section === "runs" ? <TechnicalPanel className="section-page"><div className="empty-kicker">CONVERSATION / AGENT RUNS</div><h1>Run history</h1><p className="panel-caption">Saved runs in this conversation. Choose a conversation to review its runs.</p><button type="button" className="technical-button" onClick={() => setHistoryOpen(true)}>Choose conversation<ArrowUpRight size={14} /></button><div className="run-history">{runState.history.map(run => <button type="button" key={run.id} onClick={() => { if (currentConversationId) runState.select(currentConversationId, run.id); setInspectorTab("run"); revealAgentWorkspace() }}><Bot size={19} /><span><strong>{run.title}</strong><small>{run.id}</small></span>{runState.details[run.id] && <RunStatusBadge run={runState.details[run.id]} />}</button>)}</div>{!runState.history.length && <p className="panel-empty">No Agent runs in the selected conversation.</p>}</TechnicalPanel>
        : section === "approvals" && (runState.selectedRun?.execution || runState.selectedRun?.control || runState.selectedRun?.id.startsWith("rtrun_")) ? <AgentControlCard run={runState.selectedRun} onChanged={async () => { if (currentConversationId) await runState.refresh(currentConversationId) }} />
          : section === "approvals" ? <TechnicalPanel className="section-page"><div className="empty-kicker">CURRENT RUN</div><h1>Approval requests</h1><p className="panel-caption">Persisted requests for the selected run. This view does not grant authority or execute work.</p>{runState.selectedRun?.pendingApprovals.length ? runState.selectedRun.pendingApprovals.map(approval => <div className="approval-receipt" key={approval.id}><ShieldCheck size={18} /><strong>{approval.approvalType}</strong><span>{approval.status} · {approval.requiredRole}</span>{approval.dueAt && <time dateTime={approval.dueAt}>Due {new Date(approval.dueAt).toLocaleString()}</time>}</div>) : <p className="panel-empty">No pending approval requests recorded for this run.</p>}<div className="execution-boundary"><Info size={15} />Approval records a decision only. Permit issuance and execution are separate stages.</div></TechnicalPanel>
            : <AgentWorkspace runtime={workspaceRuntime.state} runtimeFile={<WorkspaceEditor onSaveProposed={() => { if (currentConversationId) void runState.refresh(currentConversationId) }} savedRuns={runState.history} onReviewProposal={() => navigate("approvals")} workflow={runState.selectedRun?.workflow && (!runState.selectedRun.presentation?.engineeringPlan || runState.selectedRun.workflow.proposal.planId === runState.selectedRun.presentation.engineeringPlan.planId) ? runState.selectedRun.workflow : undefined} location={editorLocation} key={`${currentConversationId}:${workspaceRuntime.state.binding?.workspaceId}:${workspaceRuntime.state.binding?.version}`} runtime={runtimeRead ? { binding: { ...(workspace.binding?.runtime ?? runtimeRead.binding), status: runtimeStatus as RuntimeWorkspaceBinding["status"] }, initial: runtimeRead.view } : undefined} file={selectedFile} status={fileStatus} error={fileError} available={runtimeStatus === "READY" && !bindingChanged && !bindingUnresolved && (!runtimeRead || workspace.binding?.id === runtimeRead.binding.workspaceId && String(workspace.binding?.version) === String(runtimeRead.binding.version))} ensureConversation={ensureWorkspaceConversation} onAnalyze={analyzeRuntimeEvidence} readAuthorized={workspaceRuntime.state.readAuthorized} />} tab={inspectorTab} onTab={setInspectorTab} run={section === "home" ? undefined : runState.selectedRun} events={runState.events} streamStatus={runState.streamStatus} file={selectedFile} fileStatus={fileStatus} fileError={fileError} onOpen={(binding, path) => void openFile(binding, path)} onPrompt={suggestPrompt} loading={isLoadingSession} onControlChanged={async () => { if (currentConversationId) await runState.refresh(currentConversationId) }} />}
  </div>
  return <>
    <CinematicIntro />
    <SekhemShell collapsed={sidebarCollapsed} drawer={drawer} onDrawer={setDrawer} mobileSurface={mobileSurface} onSurface={surface => { if (surface === "workspace") openWorkspace(); else { setMobileSurface(surface); setChatExpanded(false) } }} chatExpanded={chatExpanded}
      header={<WorkspaceHeader runtime={workspaceRuntime.state} session={session} projects={projects} selectedProjectId={selectedProjectId} isProjectsLoading={isProjectsLoading} onProjectChange={chooseProject} onLogout={handleLogout} onMobileMenuOpen={() => setDrawer("navigation")} onSettings={() => setSettingsOpen(true)} context="Engineering workspace" />}
      navigation={<PrimaryNavigation runtime={workspaceRuntime.state} section={section} onNavigate={navigate} collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed(value => !value)} />}
      explorer={<WorkspaceExplorer onConnect={() => setSettingsOpen(true)} requestedRead={pendingWorkspaceRead?.path} onReadCancel={() => setPendingWorkspaceRead(null)} onReadAllowed={async () => { const pending = pendingWorkspaceRead; setPendingWorkspaceRead(null); if (pending && pending.conversationId === currentConversationIdRef.current && pending.binding.id === workspace.binding?.id && pending.binding.version === workspace.binding.version) await openFile(pending.binding, pending.path, true) }} inventory={workspaceRuntime.inventory} runtime={workspaceRuntime.state} projectId={selectedProjectId} ensureConversation={ensureWorkspaceConversation} onChanged={refreshWorkspace} binding={workspace.binding} status={runtimeStatus} error={workspace.error} selectedPath={runtimeRead && runtimeRead.binding.workspaceId === workspace.binding?.id && String(runtimeRead.binding.version) === String(workspace.binding?.version) ? runtimeRead.view.operation.relativePath : selectedFile?.binding.version === workspace.binding?.version ? selectedFile?.path : undefined} onOpen={path => { if (workspace.binding) void openFile(workspace.binding, path) }} />}
      terminal={terminalOpen && <WorkspaceTerminal onOpenReference={reference => { if (workspace.binding) void openFile(workspace.binding, reference) }} key={`${currentConversationId}:${workspaceRuntime.state.binding?.version}`} cwd={workspaceRuntime.state.binding?.rootPath} runtimeId={workspaceRuntime.state.binding?.runtimeId} conversationId={currentConversationId} runIds={runState.history.map(run => run.id)}
      disabled={bindingChanged || bindingUnresolved || runState.isStale || isGenerating || workspaceRuntime.state.bindingStatus !== "READY" || workspaceRuntime.state.connection !== "CONNECTED" || workspaceRuntime.state.grantStatus !== "ACTIVE" || !workspaceRuntime.state.grant?.capabilities.includes("terminal.execute")}
      ensureConversation={ensureWorkspaceConversation} onInspect={id => { if (currentConversationId) runState.select(currentConversationId, id); setInspectorTab("run"); revealAgentWorkspace() }} onAsk={id => suggestPrompt(`Explain the saved result of terminal action ${id}. Do not execute or retry anything.`)} onChanged={async (id, runId) => { await runState.refresh(id); if (runId) runState.select(id, runId); handleSelectSession(id) }} />}
      statusBar={<><span>{conversationBinding?.name ?? "No workspace"}</span><button type="button" onClick={() => setSettingsOpen(true)}>Runtime: {workspaceRuntime.state.connection}</button><button type="button" onClick={() => setChatDetailsOpen(true)}>Grant: {workspaceRuntime.state.grantStatus}</button><button type="button" onClick={() => setChatDetailsOpen(true)}>Read: {workspaceRuntime.state.readAuthorized ? "Authorized" : "Approval required"}</button><button type="button" onClick={() => { if (currentConversationId && conversationAgent) runState.select(currentConversationId, conversationAgent.id); setInspectorTab("run"); revealAgentWorkspace() }}>Agent: {conversationAgent ? runActivity(conversationAgent, conversationAgentDetail?.activity?.at(-1)?.eventType, conversationAgentDetail?.presentation?.planning) : "Idle"}</button><span>Governed execution</span></>}
      workarea={workarea}
      chat={<ProjectChat expanded={chatExpanded} onExpand={() => setChatExpanded(value => !value)} onHistory={() => setHistoryOpen(true)} onNew={handleNewChat} conversationTitle={runState.conversation?.title} projectName={projectName}>
        <ChatContextBar name={savedBinding?.name ?? conversationBinding?.name} changed={bindingChanged} unavailable={bindingUnresolved || !!workspace.error || !["READY", "Available"].includes(workspace.status)} accessWarning={workspaceRuntime.state.binding ? workspaceRuntime.state.grantStatus !== "ACTIVE" || !workspaceRuntime.state.readAuthorized || ["filesystem.list", "filesystem.read", "filesystem.search"].some(capability => !workspaceRuntime.state.grant?.capabilities.includes(capability as any)) : false} stale={runState.isStale} onDetails={() => setChatDetailsOpen(true)} onActivity={() => { setInspectorTab("run"); setChatExpanded(false); setMobileSurface(value => value === "agent" ? "workspace" : "agent") }} />
        <div ref={chatContainerRef} onScroll={handleScroll} className="chat-message-scroll" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
          {activeMessages.length === 0 && !isGenerating && !contractNotice && !isLoadingSession ? <div className="chat-empty"><span className="empty-kicker">LET’S BUILD UNDERSTANDING</span><h3>Start with a question.</h3><p>Talk through an idea, read a file, or ask SEKHEM to inspect this project. Agent work appears alongside this conversation.</p><button className="technical-button" type="button" disabled={!selectedProjectId} onClick={() => suggestPrompt("Analyze the project")}>Explore this project<ArrowUpRight size={14} /></button></div> : <div className="chat-thread">
            {isLoadingSession && <p className="panel-caption" role="status">Restoring conversation…</p>}
            <ConversationActivity messages={activeMessages} routine={msg => !runState.isStale && isRoutineHistory(msg, runState.history, runState.details)} renderMessage={(msg, idx) => <React.Fragment key={msg.id}><ChatMessageItem message={msg} index={idx} changeReviewAvailable={!runState.isStale && !runState.isLoading && !bindingChanged && !bindingUnresolved && Boolean(runState.conversation)} onChangeReviewChanged={async id => { if (currentConversationIdRef.current === id) await runState.refresh(id) }} attachments={messageAttachmentsRef.current.get(typeof msg.metadata.clientMessageId === "string" ? msg.metadata.clientMessageId : msg.id)} />{runState.history.filter(run => runState.details[run.id]?.presentation?.originatingMessageId === msg.id).map(renderRunCard)}</React.Fragment>} />
            {runState.history.filter(run => !activeMessages.some(message => message.id === runState.details[run.id]?.presentation?.originatingMessageId)).map(renderRunCard)}
            {isGenerating && !submissionRun(runState.conversation, currentConversationId ? submittedByConversation[currentConversationId] : undefined) && <ThinkingIndicator stale={runState.isStale} />}
            {runState.isStale && runState.conversation && <p role="status" className="text-xs text-amber">Updates unavailable. Showing the last successfully saved conversation state.</p>}
          {contractNotice && <div role="alert" className="workspace-notice"><strong><AlertTriangle size={14} />{errorByConversationId[activeKey] ? "Request notice" : runState.error ? "Conversation unavailable" : "Notice"}</strong><p>{errorByConversationId[activeKey] ? "The request could not be completed. Review the details and saved state before trying again." : runState.error ? runState.error : generalNotice}</p>{errorByConversationId[activeKey] && <details><summary>Details</summary><p>{contractNotice}</p></details>}</div>}
            <div ref={messagesEndRef} />
          </div>}
          {hasNewMessage && !isNearBottom && <button className="latest-message-button" type="button" onClick={() => scrollToBottom()} aria-label="Scroll to latest message"><ArrowDown size={14} />Latest response</button>}
        </div>
        <CommandComposer key={`composer:${activeKey}`} approvalMode={runState.conversation?.metadata.approvalMode} onApprovalModeChanged={async () => { if (currentConversationId) await runState.refresh(currentConversationId) }} value={inputMessage} onChange={val => { setInputMessage(val); setDraftsByConversationId(prev => ({ ...prev, [activeKey]: val })) }} onSend={attachments => void handleSendMessage(undefined, attachments)} disabled={!selectedProjectId || bindingChanged || bindingUnresolved || Boolean(currentConversationId && !runState.conversation)} currentConversationId={currentConversationId} focusTrigger={focusTrigger} isGenerating={isGenerating} queuedCount={activeQueue.length} onReference={() => { openWorkspace(); document.getElementById("workspace-file-search")?.focus() }} />
        <div className="chat-footer"><span>Shift + Enter for new line</span><span>SEKHEM · Conversation</span></div>
      </ProjectChat>}
    />
    <Sheet open={chatDetailsOpen} onOpenChange={setChatDetailsOpen}><SheetContent className="settings-sheet"><SheetHeader><SheetTitle>Conversation details</SheetTitle><SheetDescription>Workspace, access and historical context for this conversation. These details do not grant authority.</SheetDescription></SheetHeader><div className="settings-content">
        <ConversationWorkspaceIndicator name={savedBinding?.name ?? (runState.conversation?.modeContext?.workspace?.workspaceId === workspace.binding?.id ? workspace.binding?.name : undefined)} changed={bindingChanged} unavailable={bindingUnresolved || !!workspace.error || !["READY", "Available"].includes(workspace.status)} />
        {currentConversationId && <HistoricalContextControl key={`historical-context:${currentConversationId}`} sources={conversations.filter(source => source.id !== currentConversationId && source.projectId === runState.conversation?.projectId)} view={runState.conversation?.metadata.historicalContextView as HistoricalContextView | undefined} disabled={bindingChanged || bindingUnresolved || runState.isStale || runState.isLoading || !runState.conversation} onSelect={async sourceId => { const id = currentConversationId; await selectHistoricalContext(id, sourceId); await runState.refresh(id) }} />}
        {bindingChanged && <ConversationWorkspaceNotice saved={conversationBinding} active={workspace.activeBinding} onNew={handleNewChat} />}
        {runState.conversation?.modeContext?.source && <div className="chat-binding-note"><button type="button" className="technical-button" onClick={() => handleSelectSession(runState.conversation!.modeContext!.source!.conversationId)}>Open source Chat</button><span>Linked source message · {runState.conversation.modeContext.source.messageId}</span></div>}
        <p className="panel-caption px-3">Workspace conversation · Inspect, plan and review changes here. Mutations require explicit approval.</p>
        {workspaceRuntime.state.binding && (["EXPIRED", "MISSING"].includes(workspaceRuntime.state.grantStatus) || ["filesystem.list", "filesystem.read", "filesystem.search"].some(capability => !workspaceRuntime.state.grant?.capabilities.includes(capability as any))) && <RuntimeAccessStatus key={`runtime-access:${currentConversationId}:${workspaceRuntime.state.binding.version}`} projectId={selectedProjectId} runtimeId={workspaceRuntime.state.binding.runtimeId} inventory={bindingChanged || bindingUnresolved ? { ...workspaceRuntime.inventory, error: "Current conversation bindings unavailable" } : workspaceRuntime.inventory} required={["filesystem.list", "filesystem.read", "filesystem.search"]} onConfigure={() => { setChatDetailsOpen(false); setSettingsOpen(true) }} onChanged={refreshWorkspace} />}
        <RuntimeStatus runtime={workspaceRuntime.state} />
        <button type="button" className="technical-button" onClick={() => { setChatDetailsOpen(false); setSettingsOpen(true) }}>Workspace settings</button>
      </div></SheetContent></Sheet>
    <Sheet open={historyOpen} onOpenChange={setHistoryOpen}><SheetContent side="left" className="conversation-history-sheet"><SheetHeader><SheetTitle>Conversations</SheetTitle><SheetDescription>{projectName || "Current project"} · Saved conversation history</SheetDescription></SheetHeader><button type="button" className="technical-button mx-4" onClick={() => { handleNewChat(); setHistoryOpen(false); setMobileSurface("chat") }}><Plus size={15} />New conversation</button><div className="history-scroll"><SessionList conversations={conversations} conversationsLoading={conversationsLoading} conversationsError={conversationsError} activeConversationId={currentConversationId} collapsed={false} onSelectConversation={id => { handleSelectSession(id); setHistoryOpen(false) }} onRenameConversation={handleRenameConversation} onDeleteConversation={handleDeleteConversation} onAssignGroupConversation={handleAssignGroupConversation} generatingConversationIds={generatingConversationIds} queuedConversationIds={queuedConversationIds} projects={projects} /></div></SheetContent></Sheet>
    <Sheet open={adminOpen} onOpenChange={setAdminOpen}><SheetContent className="settings-sheet" style={{ width: "min(900px, 100vw)", maxWidth: "100vw" }}><SheetHeader><SheetTitle>Admin Control</SheetTitle><SheetDescription>Accounts, project access, services and activity.</SheetDescription></SheetHeader><div className="settings-content">{adminOpen && session?.user.role === "Admin" && <AdminControlPanel userId={session.user.id} projectId={selectedProjectId ?? ""} />}</div></SheetContent></Sheet>
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}><SheetContent className="settings-sheet"><SheetHeader><SheetTitle>Workspace settings</SheetTitle><SheetDescription>Current account and workspace capabilities.</SheetDescription></SheetHeader><div className="settings-content"><div><h3>Account</h3><strong>{session?.user.displayName}</strong><p>{sekhemRoleLabel(session?.user.role)}</p></div><div><h3>Project workspace</h3><strong>{workspace.binding?.name ?? "Unavailable"}</strong><p>{workspace.status} · {workspace.binding?.location === "TRUSTED_RUNTIME" ? "Trusted Local Runtime" : "Backend host"} · Reading access is separate from change authorization</p></div>{selectedProjectId && <SshTargetPanel key={selectedProjectId} projectId={selectedProjectId} />}{selectedProjectId && <BrowserPanel key={`${selectedProjectId}:${currentConversationId}`} projectId={selectedProjectId} conversationId={currentConversationId} onSource={async () => { if (currentConversationId) await runState.refresh(currentConversationId) }} />}<RuntimeStatus runtime={workspaceRuntime.state} /><RuntimeSetup key={`${selectedProjectId}:${workspaceRuntime.state.binding?.runtimeId}`} boundRuntimeId={workspaceRuntime.state.binding?.runtimeId} projectId={selectedProjectId} inventory={workspaceRuntime.inventory} onChanged={workspaceRuntime.refresh} />{session?.user.role === "Admin" && <button type="button" className="technical-button" onClick={() => { setSettingsOpen(false); setAdminOpen(true) }}>Admin Control</button>}<details className="workspace-advanced"><summary>Advanced runtime controls</summary>{advancedRuntimeControls}</details><button type="button" className="technical-button" onClick={handleLogout}>Logout</button></div></SheetContent></Sheet>
  </>
}
