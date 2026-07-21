const STORAGE_KEY = "tables.recentProjects"
const MAX_RECENT = 5

export type RecentProject = {
  code: string
  name: string
  canEdit: boolean
  openedAt: number
}

export function getRecentProjects(): RecentProject[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(value)) return []
    return value.filter(isRecentProject).slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function rememberRecentProject(
  project: Omit<RecentProject, "openedAt">
) {
  const recent = getRecentProjects().filter(
    (item) => item.code !== project.code
  )
  save([{ ...project, openedAt: Date.now() }, ...recent].slice(0, MAX_RECENT))
}

export function forgetRecentProject(code: string) {
  save(getRecentProjects().filter((project) => project.code !== code))
}

function save(projects: RecentProject[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  } catch {
    // Recent history is optional when storage is blocked or full.
  }
}

function isRecentProject(value: unknown): value is RecentProject {
  if (typeof value !== "object" || value === null) return false
  const project = value as Record<string, unknown>
  return (
    typeof project.code === "string" &&
    typeof project.name === "string" &&
    typeof project.canEdit === "boolean" &&
    typeof project.openedAt === "number"
  )
}
