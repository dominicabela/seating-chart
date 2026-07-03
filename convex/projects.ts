import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireEdit, resolveProject } from "./lib/access";

const CODE_LENGTH = 6;
/** Uppercase letters and digits, excluding ambiguous 0/O, 1/I/L. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueCode(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = randomCode();
    const existing = await resolveProject(ctx, code);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique code");
}

/** Lay out regular tables in rows of 4, leaving row 0 for the couple table. */
export function gridPositionForIndex(i: number): { gridX: number; gridY: number } {
  return { gridX: (i % 4) * 2, gridY: 2 + Math.floor(i / 4) * 2 };
}

export const create = mutation({
  args: {
    name: v.string(),
    numTables: v.number(),
    defaultCapacity: v.number(),
  },
  returns: v.object({ editCode: v.string(), viewCode: v.string() }),
  handler: async (ctx, args) => {
    if (args.numTables < 1 || args.numTables > 60) {
      throw new Error("Number of tables must be between 1 and 60");
    }
    if (args.defaultCapacity < 1 || args.defaultCapacity > 16) {
      throw new Error("Guests per table must be between 1 and 16");
    }
    const editCode = await generateUniqueCode(ctx);
    let viewCode = await generateUniqueCode(ctx);
    while (viewCode === editCode) viewCode = await generateUniqueCode(ctx);

    const projectId = await ctx.db.insert("projects", {
      name: args.name.trim() || "Untitled wedding",
      editCode,
      viewCode,
      defaultCapacity: args.defaultCapacity,
    });

    await ctx.db.insert("tables", {
      projectId,
      label: "Bride & Groom",
      capacity: 2,
      color: "gold",
      gridX: 2,
      gridY: 0,
      kind: "couple",
    });

    for (let i = 0; i < args.numTables; i++) {
      const { gridX, gridY } = gridPositionForIndex(i);
      await ctx.db.insert("tables", {
        projectId,
        label: `Table ${i + 1}`,
        capacity: args.defaultCapacity,
        color: "none",
        gridX,
        gridY,
        kind: "regular",
      });
    }

    return { editCode, viewCode };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  returns: v.union(
    v.object({
      name: v.string(),
      defaultCapacity: v.number(),
      canEdit: v.boolean(),
      viewCode: v.string(),
      editCode: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const access = await resolveProject(ctx, args.code);
    if (!access) return null;
    const { project, canEdit } = access;
    return {
      name: project.name,
      defaultCapacity: project.defaultCapacity,
      canEdit,
      viewCode: project.viewCode,
      editCode: canEdit ? project.editCode : null,
    };
  },
});

export const updateSettings = mutation({
  args: {
    code: v.string(),
    name: v.optional(v.string()),
    defaultCapacity: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireEdit(ctx, args.code);
    const patch: Partial<{ name: string; defaultCapacity: number }> = {};
    if (args.name !== undefined) patch.name = args.name.trim() || project.name;
    if (args.defaultCapacity !== undefined) {
      patch.defaultCapacity = args.defaultCapacity;
    }
    await ctx.db.patch(project._id, patch);
    return null;
  },
});