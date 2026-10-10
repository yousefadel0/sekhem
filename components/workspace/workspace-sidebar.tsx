"use client"

import React, { useMemo } from "react"
import { MessagesSquare, X, Loader2, AlertTriangle, MoreVertical, Pencil, Trash2, Check, Folder, Calendar, ChevronDown, ChevronRight } from "lucide-react"
import type { ConversationSummaryDto, ProjectSummaryDto } from "@/lib/sekhem-conversation"

// Persisted conversation history, including existing rename, grouping and delete actions.
function relativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  } catch {
    return ""
  }
}

// ─── Date bucket helper ───────────────────────────────────────────────────────
type DateBucket = "Today" | "Yesterday" | "Older"

function dateBucket(dateStr: string): DateBucket {
  try {
    const now = new Date()
    const d = new Date(dateStr)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yestStart  = new Date(todayStart.getTime() - 86400000)
    if (d >= todayStart) return "Today"
    if (d >= yestStart)  return "Yesterday"
    return "Older"
  } catch {
    return "Older"
  }
}

// ─── Session list item ────────────────────────────────────────────────────────
// ─── Session list item ────────────────────────────────────────────────────────
interface SessionItemProps {
  conversation: ConversationSummaryDto
  active: boolean
  collapsed: boolean
  onClick: () => void
  isGenerating?: boolean
  queuedCount?: number
  onRename?: (id: string, newTitle: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onAssignGroup?: (id: string, groupName: string) => Promise<void>
  existingGroups?: string[]
}

function SessionItem({
  conversation,
  active,
  collapsed,
  onClick,
  isGenerating = false,
  queuedCount = 0,
  onRename,
  onDelete,
  onAssignGroup,
  existingGroups = [],
}: SessionItemProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [draftTitle, setDraftTitle] = React.useState(conversation.title || "")
  const [isSaving, setIsSaving] = React.useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [showMenu, setShowMenu] = React.useState(false)
  const [isAssigningGroup, setIsAssigningGroup] = React.useState(false)
  const [groupDraft, setGroupDraft] = React.useState("")
  const [isSavingGroup, setIsSavingGroup] = React.useState(false)

  const currentGroupName = typeof conversation.metadata?.groupName === "string"
    ? conversation.metadata.groupName
    : ""

  const label = conversation.title || "Untitled Session"
  const relTime = relativeTime(conversation.updatedAt)

  React.useEffect(() => {
    setDraftTitle(conversation.title || "")
  }, [conversation.title])

  const handleStartAssignGroup = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    setGroupDraft(currentGroupName)
    setIsAssigningGroup(true)
  }

  const handleSaveGroup = async (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.stopPropagation()
    if (onAssignGroup) {
      setIsSavingGroup(true)
      try {
        await onAssignGroup(conversation.id, groupDraft.trim())
        setIsAssigningGroup(false)
      } finally {
        setIsSavingGroup(false)
      }
    } else {
      setIsAssigningGroup(false)
    }
  }

  const handleCancelGroup = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsAssigningGroup(false)
  }

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    setIsConfirmingDelete(false)
    setIsEditing(true)
  }

  const handleSaveRename = async (e?: React.MouseEvent | React.FormEvent) => {
    if (e) e.stopPropagation()
    const trimmed = draftTitle.trim()
    if (!trimmed || trimmed === conversation.title) {
      setIsEditing(false)
      return
    }
    if (onRename) {
      setIsSaving(true)
      try {
        await onRename(conversation.id, trimmed)
        setIsEditing(false)
      } finally {
        setIsSaving(false)
      }
    } else {
      setIsEditing(false)
    }
  }

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraftTitle(conversation.title || "")
    setIsEditing(false)
  }

  const handleStartDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    setIsConfirmingDelete(true)
  }

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete) {
      setIsDeleting(true)
      try {
        await onDelete(conversation.id)
      } finally {
        setIsDeleting(false)
        setIsConfirmingDelete(false)
      }
    }
  }

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsConfirmingDelete(false)
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${label}${isGenerating ? " (Generating…)" : ""}`}
        aria-label={label}
        aria-current={active ? "true" : undefined}
        className={`
          w-full flex items-center justify-center p-2 rounded-md transition-all duration-150 relative
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lime/40
          ${active
            ? "bg-lime/10 border border-lime/20 text-lime"
            : "text-muted-foreground/50 hover:text-foreground/80 hover:bg-surface-2/50"
          }
        `}
      >
        <MessagesSquare className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        {isGenerating && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber animate-ping"
            aria-label="Generating"
          />
        )}
      </button>
    )
  }

  if (isEditing) {
    return (
      <div
        className="px-2 py-1.5 rounded-md bg-surface-2/80 border border-lime/30 space-y-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void handleSaveRename()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setIsEditing(false)
            }
          }}
          disabled={isSaving}
          autoFocus
          className="w-full text-[11px] font-mono bg-background px-1.5 py-1 rounded border border-border/60 text-foreground focus:outline-none focus:border-lime"
          aria-label="Edit session title"
        />
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={handleCancelRename}
            disabled={isSaving}
            className="p-1 text-muted-foreground hover:text-foreground rounded text-[9px] font-mono flex items-center gap-0.5"
            aria-label="Cancel rename"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => void handleSaveRename()}
            disabled={isSaving || !draftTitle.trim()}
            className="px-1.5 py-0.5 bg-lime/20 text-lime hover:bg-lime/30 rounded text-[9px] font-mono flex items-center gap-1 font-semibold"
            aria-label="Save title"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            <span>Save</span>
          </button>
        </div>
      </div>
    )
  }

  if (isAssigningGroup) {
    return (
      <div
        className="px-2 py-1.5 rounded-md bg-surface-2/80 border border-amber/30 space-y-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[9px] font-mono text-amber/80 uppercase tracking-wider">Assign to Group</p>
        {existingGroups.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {existingGroups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={(e) => { e.stopPropagation(); setGroupDraft(g) }}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-colors ${
                  groupDraft === g
                    ? "bg-amber/20 text-amber border-amber/40"
                    : "bg-surface-3/60 text-muted-foreground/60 border-border/30 hover:text-foreground hover:border-border/60"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          value={groupDraft}
          onChange={(e) => setGroupDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void handleSaveGroup() }
            else if (e.key === "Escape") { e.preventDefault(); setIsAssigningGroup(false) }
          }}
          placeholder="Group name…"
          disabled={isSavingGroup}
          autoFocus
          className="w-full text-[11px] font-mono bg-background px-1.5 py-1 rounded border border-border/60 text-foreground focus:outline-none focus:border-amber placeholder:text-muted-foreground/30"
          aria-label="Group name"
        />
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={handleCancelGroup}
            disabled={isSavingGroup}
            className="p-1 text-muted-foreground hover:text-foreground rounded text-[9px] font-mono flex items-center gap-0.5"
            aria-label="Cancel group assignment"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={(e) => void handleSaveGroup(e)}
            disabled={isSavingGroup}
            className="px-1.5 py-0.5 bg-amber/20 text-amber hover:bg-amber/30 rounded text-[9px] font-mono flex items-center gap-1 font-semibold"
            aria-label="Save group assignment"
          >
            {isSavingGroup ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            <span>Apply</span>
          </button>
        </div>
      </div>
    )
  }

  if (isConfirmingDelete) {
    return (
      <div
        className="px-2 py-1.5 rounded-md bg-crimson/10 border border-crimson/30 space-y-1.5 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-mono text-crimson font-medium">
          Delete conversation?
        </p>
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handleCancelDelete}
            disabled={isDeleting}
            className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground rounded text-[9px] font-mono"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => void handleConfirmDelete(e)}
            disabled={isDeleting}
            className="px-2 py-0.5 bg-crimson text-white hover:bg-crimson/90 rounded text-[9px] font-mono flex items-center gap-1 font-semibold"
          >
            {isDeleting ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Trash2 className="w-2.5 h-2.5" />}
            <span>Delete</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`
        history-session-row group relative w-full flex items-start gap-2 px-2.5 py-2 rounded-md text-left
        transition-all duration-150 cursor-pointer
        ${active
          ? "bg-lime/8 border border-lime/15 text-foreground/90"
          : "text-muted-foreground/60 hover:text-foreground/80 hover:bg-surface-2/50 border border-transparent"
        }
      `}
      onKeyDown={event => { if (showMenu && event.key === "Escape") { event.stopPropagation(); setShowMenu(false) } }}
    >
      <button type="button" className="session-select flex flex-1 min-w-0 items-start gap-2 text-left" aria-current={active ? "true" : undefined} onClick={onClick}>
      {/* Active / Generating indicator dot */}
      {isGenerating ? (
        <span
          className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-amber animate-ping"
          title="Generating in background"
          aria-label="Generating in background"
        />
      ) : (
        <span
          className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full transition-colors ${
            active ? "bg-lime" : "bg-muted-foreground/25 group-hover:bg-muted-foreground/45"
          }`}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 min-w-0 pr-1">
        <p
          className={`text-[11px] font-mono leading-tight truncate ${
            active ? "text-foreground/90 font-medium" : "text-foreground/65"
          }`}
          title={label}
        >
          {label}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isGenerating ? (
            <span className="text-[9px] font-mono text-amber animate-pulse">
              Generating…
            </span>
          ) : relTime ? (
            <span className="text-[9px] font-mono text-muted-foreground/40">
              {relTime}
            </span>
          ) : null}

          {queuedCount > 0 && (
            <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-amber/15 text-amber border border-amber/30">
              Q:{queuedCount}
            </span>
          )}
        </div>
      </div>

      </button>
      {/* Action menu is a sibling of the session selector for keyboard access. */}
      {(onRename || onDelete) && (
        <div className="relative shrink-0 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-surface-3/80 transition-colors"
            aria-label="Session actions"
            aria-expanded={showMenu}
          >
            <MoreVertical className="w-3 h-3" />
          </button>

          {showMenu && (
            <div
              className="absolute right-0 top-full mt-1 z-30 w-28 py-1 rounded-md bg-sidebar border border-border/60 shadow-xl space-y-0.5 animate-fade-in text-[10px] font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              {onRename && (
                <button
                  type="button"
                  onClick={handleStartRename}
                  className="w-full px-2.5 py-1.5 text-left flex items-center gap-1.5 text-foreground/80 hover:text-lime hover:bg-surface-2/60 transition-colors"
                >
                  <Pencil className="w-2.5 h-2.5 text-muted-foreground/60" />
                  <span>Rename</span>
                </button>
              )}
              {onAssignGroup && (
                <button
                  type="button"
                  onClick={handleStartAssignGroup}
                  className="w-full px-2.5 py-1.5 text-left flex items-center gap-1.5 text-foreground/80 hover:text-amber hover:bg-surface-2/60 transition-colors"
                >
                  <Folder className="w-2.5 h-2.5 text-muted-foreground/60" />
                  <span>Assign Group</span>
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={handleStartDelete}
                  className="w-full px-2.5 py-1.5 text-left flex items-center gap-1.5 text-crimson hover:bg-crimson/10 transition-colors"
                >
                  <Trash2 className="w-2.5 h-2.5 text-crimson" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Session list panel ───────────────────────────────────────────────────────
interface SessionListProps {
  conversations: ConversationSummaryDto[]
  conversationsLoading: boolean
  conversationsError: string | null
  activeConversationId: string | null
  collapsed: boolean
  onSelectConversation: (id: string) => void
  onRenameConversation?: (id: string, newTitle: string) => Promise<void>
  onDeleteConversation?: (id: string) => Promise<void>
  onAssignGroupConversation?: (id: string, groupName: string) => Promise<void>
  generatingConversationIds?: Set<string> | Record<string, boolean>
  queuedConversationIds?: Set<string> | Record<string, number>
  projects?: ProjectSummaryDto[]
}

export function SessionList({
  conversations,
  conversationsLoading,
  conversationsError,
  activeConversationId,
  collapsed,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onAssignGroupConversation,
  generatingConversationIds,
  queuedConversationIds,
  projects = [],
}: SessionListProps) {
  const [groupBy, setGroupBy] = React.useState<"date" | "group">("date")
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({})

  // Derive the set of existing group names so the inline picker can show chips.
  const existingGroupNames = React.useMemo(() => {
    const names = new Set<string>()
    for (const conv of conversations) {
      const g = conv.metadata?.groupName
      if (typeof g === "string" && g.trim()) names.add(g.trim())
    }
    return Array.from(names).sort()
  }, [conversations])

  const isConvGenerating = (id: string): boolean => {
    if (!generatingConversationIds) return false
    if (generatingConversationIds instanceof Set) return generatingConversationIds.has(id)
    return Boolean(generatingConversationIds[id])
  }

  const getConvQueuedCount = (id: string): number => {
    if (!queuedConversationIds) return 0
    if (queuedConversationIds instanceof Set) return queuedConversationIds.has(id) ? 1 : 0
    return queuedConversationIds[id] ?? 0
  }

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }))
  }

  // Project lookup map
  const projectMap = useMemo(() => {
    const map = new Map<string, ProjectSummaryDto>()
    for (const p of projects) {
      map.set(p.id, p)
    }
    return map
  }, [projects])

  // Group conversations by date bucket
  const dateGrouped = useMemo(() => {
    const buckets: Record<DateBucket, ConversationSummaryDto[]> = {
      Today: [],
      Yesterday: [],
      Older: [],
    }
    for (const conv of conversations) {
      buckets[dateBucket(conv.updatedAt)].push(conv)
    }
    return buckets
  }, [conversations])

  // Group conversations by group name or project name
  const projectGrouped = useMemo(() => {
    const groups: Record<string, ConversationSummaryDto[]> = {}
    for (const conv of conversations) {
      const meta = conv.metadata as Record<string, unknown> | undefined
      const customGroup = typeof meta?.groupName === "string" && meta.groupName.trim() ? meta.groupName.trim() : null
      const project = projectMap.get(conv.projectId)
      const groupName = customGroup || project?.customerFacingName || project?.name || "General Workspace"

      if (!groups[groupName]) {
        groups[groupName] = []
      }
      groups[groupName].push(conv)
    }
    return groups
  }, [conversations, projectMap])

  const bucketOrder: DateBucket[] = ["Today", "Yesterday", "Older"]

  if (collapsed) {
    // Collapsed: just render dots for each conversation
    return (
      <div className="space-y-0.5 mt-1">
        {conversations.slice(0, 8).map((conv) => (
          <SessionItem
            key={conv.id}
            conversation={conv}
            active={conv.id === activeConversationId}
            collapsed
            onClick={() => onSelectConversation(conv.id)}
            isGenerating={isConvGenerating(conv.id)}
            queuedCount={getConvQueuedCount(conv.id)}
          />
        ))}
      </div>
    )
  }

  if (conversationsLoading) {
    return (
      <div className="px-3 py-4 flex items-center gap-2 text-muted-foreground/50">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden="true" />
        <span className="text-[10px] font-mono">Loading sessions…</span>
      </div>
    )
  }

  if (conversationsError) {
    return (
      <div
        role="alert"
        className="mx-2 mt-2 p-2 rounded-md border border-crimson/20 bg-crimson/5 space-y-1"
      >
        <div className="flex items-center gap-1.5 text-crimson text-[10px] font-mono font-semibold">
          <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>Failed to Load</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 leading-tight pl-4">
          {conversationsError}
        </p>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-4 text-center">
        <p className="text-[10px] font-mono text-muted-foreground/35 italic">No sessions yet</p>
        <p className="text-[9px] font-mono text-muted-foreground/25 mt-0.5">
          Start a new chat above
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Grouping mode switcher */}
      <div className="flex items-center justify-between px-2 pt-1 pb-1">
        <div className="flex items-center gap-1 bg-surface-2/40 p-0.5 rounded border border-border/30 text-[9px] font-mono">
          <button
            type="button"
            onClick={() => setGroupBy("date")}
            className={`px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
              groupBy === "date" ? "bg-surface-3 text-lime font-semibold" : "text-muted-foreground/50 hover:text-foreground"
            }`}
            title="Group by Date"
          >
            <Calendar className="w-2.5 h-2.5" />
            <span>DATE</span>
          </button>
          <button
            type="button"
            onClick={() => setGroupBy("group")}
            className={`px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
              groupBy === "group" ? "bg-surface-3 text-lime font-semibold" : "text-muted-foreground/50 hover:text-foreground"
            }`}
            title="Group by Project / Group"
          >
            <Folder className="w-2.5 h-2.5" />
            <span>GROUPS</span>
          </button>
        </div>
      </div>

      {groupBy === "date" ? (
        /* Date grouping */
        <div className="space-y-0.5">
          {bucketOrder.map((bucket) => {
            const items = dateGrouped[bucket]
            if (items.length === 0) return null
            return (
              <div key={bucket}>
                <div className="px-3 pt-2.5 pb-1">
                  <span className="text-[9px] font-mono tracking-[0.25em] text-muted-foreground/25 uppercase select-none">
                    {bucket}
                  </span>
                </div>
                <div className="space-y-0.5 px-1">
                  {items.map((conv) => (
                    <SessionItem
                      key={conv.id}
                      conversation={conv}
                      active={conv.id === activeConversationId}
                      collapsed={false}
                      onClick={() => onSelectConversation(conv.id)}
                      isGenerating={isConvGenerating(conv.id)}
                      queuedCount={getConvQueuedCount(conv.id)}
                      onRename={onRenameConversation}
                      onDelete={onDeleteConversation}
                      onAssignGroup={onAssignGroupConversation}
                      existingGroups={existingGroupNames}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Project / Custom Grouping */
        <div className="space-y-1 px-1">
          {Object.entries(projectGrouped).map(([groupName, items]) => {
            const isGroupCollapsed = Boolean(collapsedGroups[groupName])
            return (
              <div key={groupName} className="rounded border border-border/25 bg-surface-1/40 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse(groupName)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-[10px] font-mono text-muted-foreground/70 hover:text-foreground/90 hover:bg-surface-2/40 transition-colors"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Folder className="w-3 h-3 text-lime/60 shrink-0" />
                    <span className="truncate font-medium">{groupName}</span>
                    <span className="text-[8px] text-muted-foreground/40 font-normal">({items.length})</span>
                  </span>
                  {isGroupCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  )}
                </button>
                {!isGroupCollapsed && (
                  <div className="space-y-0.5 p-1 border-t border-border/15 bg-background/30">
                    {items.map((conv) => (
                      <SessionItem
                        key={conv.id}
                        conversation={conv}
                        active={conv.id === activeConversationId}
                        collapsed={false}
                        onClick={() => onSelectConversation(conv.id)}
                        isGenerating={isConvGenerating(conv.id)}
                        queuedCount={getConvQueuedCount(conv.id)}
                        onRename={onRenameConversation}
                        onDelete={onDeleteConversation}
                        onAssignGroup={onAssignGroupConversation}
                        existingGroups={existingGroupNames}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
