import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { assertServer } from "./secret";

export const upsertByAuth0 = mutation({
  args: {
    secret: v.string(),
    auth0Id: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { secret, auth0Id, email, name }) => {
    assertServer(secret);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth0", (q) => q.eq("auth0Id", auth0Id))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { email, name });
      return existing._id;
    }
    return await ctx.db.insert("users", { auth0Id, ...(email ? { email } : {}), ...(name ? { name } : {}) });
  },
});

export const getByAuth0 = query({
  args: { secret: v.string(), auth0Id: v.string() },
  handler: async (ctx, { secret, auth0Id }) => {
    assertServer(secret);
    return await ctx.db
      .query("users")
      .withIndex("by_auth0", (q) => q.eq("auth0Id", auth0Id))
      .unique();
  },
});
