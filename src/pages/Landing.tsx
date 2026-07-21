import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "convex/react"
import { ArrowRight, Clock3, Loader2, X } from "lucide-react"

import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  forgetRecentProject,
  getRecentProjects,
} from "@/lib/recent-projects"

export function Landing() {
  const navigate = useNavigate()
  const createProject = useMutation(api.projects.create)

  const [name, setName] = useState("")
  const [numTables, setNumTables] = useState("10")
  const [capacity, setCapacity] = useState("8")
  const [creating, setCreating] = useState(false)
  const [openCode, setOpenCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState(getRecentProjects)

  const handleCreate = async () => {
    setError(null)
    setCreating(true)
    try {
      const { editCode } = await createProject({
        name,
        numTables: Number(numTables) || 10,
        defaultCapacity: Number(capacity) || 8,
      })
      navigate(`/p/${editCode}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setCreating(false)
    }
  }

  const handleOpen = () => {
    const code = openCode.trim().toUpperCase()
    if (code.length === 6) navigate(`/p/${code}`)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-3 text-3xl">❦</div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Tables
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A minimalist seating chart for your wedding.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-xs">
          <h2 className="mb-4 text-sm font-medium">New seating chart</h2>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Wedding name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Tables</span>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={numTables}
                  onChange={(e) => setNumTables(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Seats per table
                </span>
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </label>
            </div>
            <Button
              className="mt-1 w-full"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  Create <ArrowRight data-icon="inline-end" />
                </>
              )}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <div className="mt-4 rounded-2xl border bg-card p-6 shadow-xs">
          <h2 className="mb-4 text-sm font-medium">Open with a code</h2>
          <div className="flex gap-2">
            <Input
              placeholder="Share code"
              maxLength={6}
              value={openCode}
              onChange={(e) =>
                setOpenCode(
                  e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
                )
              }
              onKeyDown={(e) => e.key === "Enter" && handleOpen()}
            />
            <Button
              variant="outline"
              onClick={handleOpen}
              disabled={openCode.trim().length !== 6}
            >
              Open
            </Button>
          </div>

          {recent.length > 0 && (
            <div className="mt-5 border-t pt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock3 className="size-3.5" />
                Recently opened
              </div>
              <ul className="-mx-2 flex flex-col">
                {recent.map((project) => (
                  <li
                    key={project.code}
                    className="group flex items-center rounded-lg hover:bg-muted/60"
                  >
                    <button
                      className="min-w-0 flex-1 px-2 py-2 text-left"
                      onClick={() => navigate(`/p/${project.code}`)}
                    >
                      <span className="block truncate text-sm font-medium">
                        {project.name}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {project.canEdit ? "Can edit" : "View only"} ·{" "}
                        {project.code}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="mr-1 opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                      onClick={() => {
                        forgetRecentProject(project.code)
                        setRecent((items) =>
                          items.filter((item) => item.code !== project.code)
                        )
                      }}
                      aria-label={`Remove ${project.name} from recent charts`}
                      title="Remove from recents"
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
