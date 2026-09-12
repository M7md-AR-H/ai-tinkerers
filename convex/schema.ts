import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    auth0Id: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  }).index("by_auth0", ["auth0Id"]),

  scannables: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    knowledgeFileId: v.optional(v.id("_storage")),
    knowledgeFileName: v.optional(v.string()),
    knowledgeContentType: v.optional(v.string()),
    knowledgeText: v.optional(v.string()),
    // The agent's own Ambiguous identity. The key is only returned by the server-gated getSender query.
    ambiguousEmail: v.optional(v.string()),
    ambiguousKey: v.optional(v.string()),
  }).index("by_owner", ["ownerId"]),
});
