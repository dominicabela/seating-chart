import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activityValidator } from "./schema";
import { requireProject } from "./lib/access";

/** Sessions silent for longer than this are considered gone. */
const STALE_MS = 30_000;

/**
 * Upsert this session's presence row. Called on an interval and whenever the
 * session's activity changes. Also garbage-collects stale rows for the
 * project so the table stays small.
 */
export const heartbeat = mutation({
  args: {
    code: v.string(),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
    activity: v.optional(activityValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project, canEdit } = await requireProject(ctx, args.code);
    const now = Date.now();

    const rows = await ctx.db
      .query("presence")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();

    let mine = null;
    for (const row of rows) {
      if (row.sessionId === args.sessionId) {
        mine = row;
      } else if (now - row.lastSeen > STALE_MS) {
        await ctx.db.delete(row._id);
      }
    }

    const fields = {
      name: args.name,
      color: args.color,
      canEdit,
      lastSeen: now,
      activity: args.activity,
    };
    if (mine) {
      await ctx.db.patch(mine._id, fields);
    } else {
      await ctx.db.insert("presence", {
        projectId: project._id,
        sessionId: args.sessionId,
        ...fields,
      });
    }
    return null;
  },
});

/** Remove this session's presence row (best-effort, on tab close). */
export const leave = mutation({
  args: { code: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.code);
    const row = await ctx.db
      .query("presence")
      .withIndex("by_project_session", (q) =>
        q.eq("projectId", project._id).eq("sessionId", args.sessionId),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const list = query({
  args: { code: v.string() },
  returns: v.array(
    v.object({
      sessionId: v.string(),
      name: v.string(),
      color: v.string(),
      canEdit: v.boolean(),
      lastSeen: v.number(),
      activity: v.optional(activityValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.code);
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    // Staleness is filtered client-side (queries must stay deterministic).
    return rows.map((row) => ({
      sessionId: row.sessionId,
      name: row.name,
      color: row.color,
      canEdit: row.canEdit,
      lastSeen: row.lastSeen,
      activity: row.activity,
    }));
  },
});
