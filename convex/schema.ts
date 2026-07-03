import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const categoryValidator = v.union(
  v.literal("bride_family"),
  v.literal("groom_family"),
  v.literal("bride_friend"),
  v.literal("groom_friend"),
  v.literal("bride_family_friend"),
  v.literal("groom_family_friend"),
  v.literal("wedding_party"),
);

export const tableKindValidator = v.union(
  v.literal("regular"),
  v.literal("couple"),
);

/** What a collaborator is currently manipulating. */
export const activityValidator = v.union(
  v.object({ kind: v.literal("guest"), guestId: v.id("guests") }),
  v.object({ kind: v.literal("table"), tableId: v.id("tables") }),
);

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    viewCode: v.string(),
    editCode: v.string(),
    defaultCapacity: v.number(),
  })
    .index("by_viewCode", ["viewCode"])
    .index("by_editCode", ["editCode"]),

  tables: defineTable({
    projectId: v.id("projects"),
    label: v.string(),
    capacity: v.number(),
    color: v.string(),
    gridX: v.number(),
    gridY: v.number(),
    kind: tableKindValidator,
  }).index("by_project", ["projectId"]),

  guests: defineTable({
    projectId: v.id("projects"),
    firstName: v.string(),
    lastName: v.string(),
    category: v.optional(categoryValidator),
    tableId: v.optional(v.id("tables")),
    single: v.optional(v.boolean()),
  })
    .index("by_project", ["projectId"])
    .index("by_table", ["tableId"]),

  presence: defineTable({
    projectId: v.id("projects"),
    sessionId: v.string(),
    name: v.string(),
    color: v.string(),
    canEdit: v.boolean(),
    lastSeen: v.number(),
    activity: v.optional(activityValidator),
  })
    .index("by_project", ["projectId"])
    .index("by_project_session", ["projectId", "sessionId"]),
});
