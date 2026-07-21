import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery } from "convex/react"
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Redo2,
  Settings2,
  Share2,
  Undo2,
} from "lucide-react"

import { api } from "../../convex/_generated/api"
import type { Doc } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useHistory, useHistoryShortcuts } from "@/lib/history"
import { usePresence, type Collaborator } from "@/lib/presence"
import {
  forgetRecentProject,
  rememberRecentProject,
} from "@/lib/recent-projects"
import { ImportStep } from "@/features/ImportStep"
import { CategorizeStep } from "@/features/CategorizeStep"
import { Editor } from "@/features/editor/Editor"

type Step = "import" | "categorize" | "editor"

export function Workspace() {
  const { code = "" } = useParams()
  const project = useQuery(api.projects.getByCode, code ? { code } : "skip")
  const tables = useQuery(api.tables.list, project ? { code } : "skip")
  const guests = useQuery(api.guests.list, project ? { code } : "skip")

  const [stepOverride, setStepOverride] = useState<Step | null>(null)
  const history = useHistory()
  const presence = usePresence(code, !!project)

  useEffect(() => {
    if (project) {
      rememberRecentProject({
        code: code.toUpperCase(),
        name: project.name,
        canEdit: project.canEdit,
      })
    } else if (project === null) {
      forgetRecentProject(code.toUpperCase())
    }
  }, [code, project])

  const derivedStep: Step = useMemo(() => {
    if (!guests || guests.length === 0) return "import"
    // While setting up, keep the user on categorize until everyone has a
    // category, so categorizing one person doesn't jump to seating.
    if (guests.some((g) => !g.category)) return "categorize"
    return "editor"
  }, [guests])

  // Once the editor is reached, pin it so later uncategorized additions from
  // the sidebar don't yank the user back into the categorize flow.
  // (Render-phase state adjustment, per React's "adjusting state when a prop
  // changes" pattern.)
  if (stepOverride === null && derivedStep === "editor") {
    setStepOverride("editor")
  }

  if (project === undefined) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (project === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-3xl">❦</div>
        <h1 className="text-lg font-medium">
          That code doesn't match anything
        </h1>
        <p className="text-sm text-muted-foreground">
          Double-check the share code, or create a new chart.
        </p>
        <Button render={<Link to="/" />} variant="outline" className="mt-2">
          Back to start
        </Button>
      </div>
    )
  }

  const canEdit = project.canEdit
  const step: Step = canEdit ? (stepOverride ?? derivedStep) : "editor"
  const loaded = tables !== undefined && guests !== undefined

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <WorkspaceHeader
        code={code}
        project={project}
        step={step}
        onStepChange={(s) => setStepOverride(s)}
        history={history}
        showHistory={step === "editor" && canEdit}
        hasGuests={(guests?.length ?? 0) > 0}
        collaborators={presence.others}
      />
      {!loaded ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : step === "import" ? (
        <ImportStep
          code={code}
          hasExistingGuests={guests.length > 0}
          onDone={() => setStepOverride(null)}
        />
      ) : step === "categorize" ? (
        <CategorizeStep
          code={code}
          guests={guests}
          onDone={() => setStepOverride("editor")}
        />
      ) : (
        <Editor
          code={code}
          canEdit={canEdit}
          tables={tables}
          guests={guests}
          history={history}
          collaborators={presence.others}
          onActivity={presence.setActivity}
        />
      )}
    </div>
  )
}

function WorkspaceHeader({
  code,
  project,
  step,
  onStepChange,
  history,
  showHistory,
  hasGuests,
  collaborators,
}: {
  code: string
  project: {
    name: string
    canEdit: boolean
    viewCode: string
    editCode: string | null
  }
  step: Step
  onStepChange: (step: Step) => void
  history: ReturnType<typeof useHistory>
  showHistory: boolean
  hasGuests: boolean
  collaborators: Collaborator[]
}) {
  useHistoryShortcuts(history, showHistory)

  const steps: {
    key: Step
    label: string
    short: string
    disabled?: boolean
  }[] = [
    { key: "import", label: "1 · Import", short: "Import" },
    {
      key: "categorize",
      label: "2 · Categorize",
      short: "Categorize",
      disabled: !hasGuests,
    },
    {
      key: "editor",
      label: "3 · Seating",
      short: "Seating",
      disabled: !hasGuests,
    },
  ]

  return (
    <header className="flex h-13 shrink-0 items-center gap-2 border-b bg-card/50 px-3 sm:gap-3 sm:px-4">
      <Link
        to="/"
        className="text-lg text-muted-foreground transition-colors hover:text-foreground"
        title="Home"
      >
        ❦
      </Link>
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-sm font-medium">{project.name}</h1>
        {project.canEdit ? (
          <ProjectSettings code={code} name={project.name} />
        ) : (
          <span />
        )}
      </div>

      {project.canEdit && step !== "editor" && (
        <nav className="ml-4 hidden min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto sm:flex [&::-webkit-scrollbar]:hidden">
          {steps.map((s) => (
            <button
              key={s.key}
              disabled={s.disabled}
              onClick={() => onStepChange(s.key)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors sm:px-3",
                step === s.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                s.disabled && "pointer-events-none opacity-40"
              )}
            >
              <span className="sm:hidden">{s.short}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {collaborators.length > 0 && (
          <div className="mr-1 flex items-center -space-x-1.5">
            {collaborators.slice(0, 5).map((c) => (
              <Tooltip key={c.sessionId}>
                <TooltipTrigger
                  render={
                    <span
                      className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background"
                      style={{ background: c.color }}
                    />
                  }
                >
                  {c.name
                    .split(" ")
                    .map((w) => w.charAt(0))
                    .join("")}
                </TooltipTrigger>
                <TooltipContent>
                  {c.name} · {c.canEdit ? "editing" : "viewing"}
                </TooltipContent>
              </Tooltip>
            ))}
            {collaborators.length > 5 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
                +{collaborators.length - 5}
              </span>
            )}
          </div>
        )}
        {showHistory && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!history.canUndo}
                    onClick={() => history.undo()}
                  />
                }
              >
                <Undo2 />
              </TooltipTrigger>
              <TooltipContent>Undo (⌘Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={!history.canRedo}
                    onClick={() => history.redo()}
                  />
                }
              >
                <Redo2 />
              </TooltipTrigger>
              <TooltipContent>Redo (⇧⌘Z)</TooltipContent>
            </Tooltip>
            <div className="mx-1 h-5 w-px bg-border" />
          </>
        )}
        <SharePopover project={project} />
      </div>
    </header>
  )
}

function ProjectSettings({ code, name }: { code: string; name: string }) {
  const navigate = useNavigate()
  const updateSettings = useMutation(api.projects.updateSettings)
  const duplicateProject = useMutation(api.projects.duplicate)
  const [draft, setDraft] = useState(name)
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const handleDuplicate = async () => {
    setDuplicateError(null)
    setDuplicating(true)
    try {
      const { editCode } = await duplicateProject({ code })
      navigate(`/p/${editCode}`)
    } catch (e) {
      setDuplicateError(
        e instanceof Error ? e.message : "Failed to duplicate project"
      )
      setDuplicating(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-xs" title="Project settings" />
        }
      >
        <Settings2 />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="text-xs font-medium text-muted-foreground">
          Project name
        </p>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void updateSettings({ code, name: draft })
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void updateSettings({ code, name: draft })}
          >
            Save
          </Button>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={duplicating}
            onClick={() => void handleDuplicate()}
          >
            {duplicating ? (
              <>
                <Loader2 className="animate-spin" />
                Duplicating…
              </>
            ) : (
              "Duplicate project"
            )}
          </Button>
          {duplicateError && (
            <p className="mt-1.5 text-xs text-destructive">{duplicateError}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SharePopover({
  project,
}: {
  project: { canEdit: boolean; viewCode: string; editCode: string | null }
}) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" />}>
        <Share2 />
        <span className="hidden sm:inline">Share</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="text-xs text-muted-foreground">
          Anyone with a code can open this chart at{" "}
          <span className="font-medium text-foreground">
            {window.location.origin}
          </span>
        </p>
        <CodeRow label="View only" code={project.viewCode} />
        {project.editCode && (
          <CodeRow label="Can edit" code={project.editCode} />
        )}
      </PopoverContent>
    </Popover>
  )
}

function CodeRow({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const link = `${window.location.origin}/p/${code}`

  const copy = (kind: "code" | "link") => {
    void navigator.clipboard.writeText(kind === "code" ? code : link)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="font-mono text-sm font-medium tracking-[0.2em]">
          {code}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copy("code")}
              />
            }
          >
            {copied === "code" ? (
              <Check className="text-emerald-600" />
            ) : (
              <Copy />
            )}
          </TooltipTrigger>
          <TooltipContent>Copy code</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copy("link")}
              />
            }
          >
            {copied === "link" ? (
              <Check className="text-emerald-600" />
            ) : (
              <Link2 />
            )}
          </TooltipTrigger>
          <TooltipContent>Copy link</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export type { Step }
export type WorkspaceGuest = Doc<"guests">
export type WorkspaceTable = Doc<"tables">
