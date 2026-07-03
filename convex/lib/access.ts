import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type ProjectAccess = {
  project: Doc<"projects">;
  canEdit: boolean;
};

/**
 * Resolves a share code to a project. Edit codes grant write access;
 * view codes grant read-only access.
 */
export async function resolveProject(
  ctx: QueryCtx | MutationCtx,
  code: string,
): Promise<ProjectAccess | null> {
  const normalized = code.trim().toUpperCase();
  const byEdit = await ctx.db
    .query("projects")
    .withIndex("by_editCode", (q) => q.eq("editCode", normalized))
    .unique();
  if (byEdit) return { project: byEdit, canEdit: true };

  const byView = await ctx.db
    .query("projects")
    .withIndex("by_viewCode", (q) => q.eq("viewCode", normalized))
    .unique();
  if (byView) return { project: byView, canEdit: false };

  return null;
}

export async function requireProject(
  ctx: QueryCtx | MutationCtx,
  code: string,
): Promise<ProjectAccess> {
  const access = await resolveProject(ctx, code);
  if (!access) throw new Error("Invalid code");
  return access;
}

export async function requireEdit(
  ctx: MutationCtx,
  code: string,
): Promise<Doc<"projects">> {
  const access = await requireProject(ctx, code);
  if (!access.canEdit) throw new Error("This code is view-only");
  return access.project;
}
