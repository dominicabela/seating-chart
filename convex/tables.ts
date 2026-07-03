import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { tableKindValidator } from "./schema";
import { requireEdit, requireProject } from "./lib/access";

const tableDoc = v.object({
  _id: v.id("tables"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  label: v.string(),
  capacity: v.number(),
  color: v.string(),
  gridX: v.number(),
  gridY: v.number(),
  kind: tableKindValidator,
});

export const list = query({
  args: { code: v.string() },
  returns: v.array(tableDoc),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.code);
    return await ctx.db
      .query("tables")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
  },
});

export const add = mutation({
  args: {
    code: v.string(),
    gridX: v.number(),
    gridY: v.number(),
    label: v.optional(v.string()),
    capacity: v.optional(v.number()),
    color: v.optional(v.string()),
  },
  returns: v.id("tables"),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    const existing = await ctx.db
      .query("tables")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const maxNumber = existing.reduce((max, t) => {
      const match = /^Table (\d+)$/.exec(t.label);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return await ctx.db.insert("tables", {
      projectId: project._id,
      label: args.label ?? `Table ${maxNumber + 1}`,
      capacity: args.capacity ?? project.defaultCapacity,
      color: args.color ?? "none",
      gridX: args.gridX,
      gridY: args.gridY,
      kind: "regular",
    });
  },
});

export const remove = mutation({
  args: { code: v.string(), tableId: v.id("tables") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    const table = await ctx.db.get(args.tableId);
    if (!table || table.projectId !== project._id) {
      throw new Error("Table not found");
    }
    const seated = await ctx.db
      .query("guests")
      .withIndex("by_table", (q) => q.eq("tableId", args.tableId))
      .collect();
    for (const guest of seated) {
      await ctx.db.patch(guest._id, { tableId: undefined });
    }
    await ctx.db.delete(args.tableId);
    return null;
  },
});

export const move = mutation({
  args: {
    code: v.string(),
    tableId: v.id("tables"),
    gridX: v.number(),
    gridY: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    const table = await ctx.db.get(args.tableId);
    if (!table || table.projectId !== project._id) {
      throw new Error("Table not found");
    }
    await ctx.db.patch(args.tableId, {
      gridX: Math.max(0, Math.round(args.gridX)),
      gridY: Math.max(0, Math.round(args.gridY)),
    });
    return null;
  },
});

export const update = mutation({
  args: {
    code: v.string(),
    tableId: v.id("tables"),
    label: v.optional(v.string()),
    capacity: v.optional(v.number()),
    color: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    const table = await ctx.db.get(args.tableId);
    if (!table || table.projectId !== project._id) {
      throw new Error("Table not found");
    }
    const patch: Partial<{ label: string; capacity: number; color: string }> =
      {};
    if (args.label !== undefined) patch.label = args.label;
    if (args.color !== undefined) patch.color = args.color;
    if (args.capacity !== undefined) {
      if (args.capacity < 1 || args.capacity > 16) {
        throw new Error("Capacity must be between 1 and 16");
      }
      patch.capacity = args.capacity;
    }
    await ctx.db.patch(args.tableId, patch);
    return null;
  },
});
