import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { categoryValidator } from "./schema";
import { requireEdit, requireProject } from "./lib/access";

const guestDoc = v.object({
  _id: v.id("guests"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  firstName: v.string(),
  lastName: v.string(),
  category: v.optional(categoryValidator),
  tableId: v.optional(v.id("tables")),
  single: v.optional(v.boolean()),
});

type Category = NonNullable<Doc<"guests">["category"]>;

async function requireGuest(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  guestId: Id<"guests">,
): Promise<Doc<"guests">> {
  const guest = await ctx.db.get(guestId);
  if (!guest || guest.projectId !== projectId) throw new Error("Guest not found");
  return guest;
}

export const list = query({
  args: { code: v.string() },
  returns: v.array(guestDoc),
  handler: async (ctx, args) => {
    const { project } = await requireProject(ctx, args.code);
    return await ctx.db
      .query("guests")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
  },
});

export const bulkImport = mutation({
  args: {
    code: v.string(),
    guests: v.array(
      v.object({ firstName: v.string(), lastName: v.string() }),
    ),
    replace: v.boolean(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    if (args.guests.length > 1000) {
      throw new Error("Guest list is too large (max 1000)");
    }
    if (args.replace) {
      const existing = await ctx.db
        .query("guests")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      for (const guest of existing) {
        await ctx.db.delete(guest._id);
      }
    }
    for (const guest of args.guests) {
      await ctx.db.insert("guests", {
        projectId: project._id,
        firstName: guest.firstName.trim(),
        lastName: guest.lastName.trim(),
      });
    }
    return args.guests.length;
  },
});

export const add = mutation({
  args: {
    code: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    category: v.optional(categoryValidator),
    tableId: v.optional(v.id("tables")),
    single: v.optional(v.boolean()),
  },
  returns: v.id("guests"),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    return await ctx.db.insert("guests", {
      projectId: project._id,
      firstName: args.firstName.trim(),
      lastName: args.lastName.trim(),
      category: args.category,
      tableId: args.tableId,
      single: args.single,
    });
  },
});

export const remove = mutation({
  args: { code: v.string(), guestId: v.id("guests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    await requireGuest(ctx, project._id, args.guestId);
    await ctx.db.delete(args.guestId);
    return null;
  },
});

export const setCategory = mutation({
  args: {
    code: v.string(),
    guestId: v.id("guests"),
    category: v.union(categoryValidator, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    await requireGuest(ctx, project._id, args.guestId);
    await ctx.db.patch(args.guestId, {
      category: args.category ?? undefined,
    });
    return null;
  },
});

export const setSingle = mutation({
  args: {
    code: v.string(),
    guestId: v.id("guests"),
    single: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    await requireGuest(ctx, project._id, args.guestId);
    await ctx.db.patch(args.guestId, {
      single: args.single ? true : undefined,
    });
    return null;
  },
});

/**
 * Assign a guest to a table (or unassign with tableId: null).
 * If the table is full and no swap target is given, returns "full" without
 * changing anything. With swapWithGuestId, the two guests trade places.
 */
export const assign = mutation({
  args: {
    code: v.string(),
    guestId: v.id("guests"),
    tableId: v.union(v.id("tables"), v.null()),
    swapWithGuestId: v.optional(v.id("guests")),
  },
  returns: v.union(v.literal("ok"), v.literal("full")),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    const guest = await requireGuest(ctx, project._id, args.guestId);

    if (args.tableId === null) {
      await ctx.db.patch(args.guestId, { tableId: undefined });
      return "ok";
    }

    const table = await ctx.db.get(args.tableId);
    if (!table || table.projectId !== project._id) {
      throw new Error("Table not found");
    }
    if (table.kind === "couple") throw new Error("That table is reserved");

    if (args.swapWithGuestId) {
      const other = await requireGuest(ctx, project._id, args.swapWithGuestId);
      if (other.tableId !== args.tableId) {
        throw new Error("Selected guest is no longer at that table");
      }
      await ctx.db.patch(other._id, { tableId: guest.tableId });
      await ctx.db.patch(guest._id, { tableId: args.tableId });
      return "ok";
    }

    const seated = await ctx.db
      .query("guests")
      .withIndex("by_table", (q) => q.eq("tableId", args.tableId as Id<"tables">))
      .collect();
    const occupied = seated.filter((g) => g._id !== guest._id).length;
    if (occupied >= table.capacity) return "full";

    await ctx.db.patch(guest._id, { tableId: args.tableId });
    return "ok";
  },
});

/** Restore a snapshot of assignments; used by client-side undo. */
export const restoreAssignments = mutation({
  args: {
    code: v.string(),
    assignments: v.array(
      v.object({
        guestId: v.id("guests"),
        tableId: v.union(v.id("tables"), v.null()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    for (const { guestId, tableId } of args.assignments) {
      const guest = await ctx.db.get(guestId);
      if (!guest || guest.projectId !== project._id) continue;
      if (tableId !== null) {
        const table = await ctx.db.get(tableId);
        if (!table || table.projectId !== project._id) continue;
      }
      await ctx.db.patch(guestId, { tableId: tableId ?? undefined });
    }
    return null;
  },
});

const CATEGORY_ORDER: Category[] = [
  "wedding_party",
  "bride_family",
  "groom_family",
  "bride_family_friend",
  "groom_family_friend",
  "bride_friend",
  "groom_friend",
];

type Seatable = { tableId: Id<"tables">; capacity: number; distance: number };

/**
 * Auto-seat all categorized guests. Keeps last-name groups together, seats
 * the wedding party closest to the couple table, then fills tables by
 * category so related groups share tables.
 */
export const autoSeat = mutation({
  args: { code: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    const [tables, guests] = await Promise.all([
      ctx.db
        .query("tables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect(),
      ctx.db
        .query("guests")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect(),
    ]);

    const couple = tables.find((t) => t.kind === "couple");
    const cx = couple?.gridX ?? 0;
    const cy = couple?.gridY ?? 0;

    const seatables: Seatable[] = tables
      .filter((t) => t.kind === "regular")
      .map((t) => ({
        tableId: t._id,
        capacity: t.capacity,
        distance: Math.hypot(t.gridX - cx, t.gridY - cy),
      }))
      .sort((a, b) => a.distance - b.distance);

    const remaining = new Map<Id<"tables">, number>();
    const tableCategories = new Map<Id<"tables">, Set<Category>>();
    for (const t of seatables) {
      remaining.set(t.tableId, t.capacity);
      tableCategories.set(t.tableId, new Set());
    }

    const plan = new Map<Id<"guests">, Id<"tables">>();

    const seatGroup = (group: Doc<"guests">[], category: Category) => {
      let members = [...group];
      while (members.length > 0) {
        // Prefer tables already seating this category, then closest tables.
        const candidates = seatables
          .filter((t) => (remaining.get(t.tableId) ?? 0) > 0)
          .sort((a, b) => {
            const aHas = tableCategories.get(a.tableId)!.has(category) ? 0 : 1;
            const bHas = tableCategories.get(b.tableId)!.has(category) ? 0 : 1;
            if (aHas !== bHas) return aHas - bHas;
            return a.distance - b.distance;
          });
        if (candidates.length === 0) return;

        // Whole-group fit wins; otherwise take the roomiest candidate and split.
        const fit =
          candidates.find(
            (t) => (remaining.get(t.tableId) ?? 0) >= members.length,
          ) ??
          candidates.reduce((best, t) =>
            (remaining.get(t.tableId) ?? 0) > (remaining.get(best.tableId) ?? 0)
              ? t
              : best,
          );

        const space = remaining.get(fit.tableId) ?? 0;
        const toSeat = members.slice(0, space);
        members = members.slice(space);
        for (const guest of toSeat) plan.set(guest._id, fit.tableId);
        remaining.set(fit.tableId, space - toSeat.length);
        tableCategories.get(fit.tableId)!.add(category);
      }
    };

    for (const category of CATEGORY_ORDER) {
      const inCategory = guests.filter((g) => g.category === category);
      const byLastName = new Map<string, Doc<"guests">[]>();
      for (const guest of inCategory) {
        const key = guest.lastName.trim().toLowerCase() || guest._id;
        const group = byLastName.get(key) ?? [];
        group.push(guest);
        byLastName.set(key, group);
      }
      const groups = [...byLastName.values()].sort(
        (a, b) => b.length - a.length,
      );
      for (const group of groups) seatGroup(group, category);
    }

    for (const guest of guests) {
      const target = plan.get(guest._id);
      if (guest.tableId !== target) {
        await ctx.db.patch(guest._id, { tableId: target });
      }
    }
    return null;
  },
});
