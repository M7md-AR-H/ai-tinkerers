import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const ALLOWED_EXTENSIONS = [".txt", ".md", ".pdf"] as const;
const MAX_KNOWLEDGE_TEXT_CHARS = 400_000;

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function assertAllowedKnowledgeFile(fileName: string) {
  const extension = extensionOf(fileName);
  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    throw new Error("Knowledge file must be a .txt, .md, or .pdf");
  }
  return extension;
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    ownerId: v.id("users"),
    name: v.string(),
    knowledgeFileId: v.id("_storage"),
    knowledgeFileName: v.string(),
    knowledgeContentType: v.string(),
    knowledgeText: v.optional(v.string()),
  },
  returns: v.id("scannables"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Name is required");
    }

    const owner = await ctx.db.get(args.ownerId);
    if (!owner) {
      throw new Error("User not found");
    }

    const extension = assertAllowedKnowledgeFile(args.knowledgeFileName);
    const storedFile = await ctx.db.system.get(args.knowledgeFileId);
    if (!storedFile) {
      throw new Error("Knowledge file was not stored");
    }

    let knowledgeText = args.knowledgeText;
    if (extension === ".pdf") {
      knowledgeText = undefined;
    } else if (knowledgeText && knowledgeText.length > MAX_KNOWLEDGE_TEXT_CHARS) {
      throw new Error("Knowledge file is too large to store as text");
    }

    return await ctx.db.insert("scannables", {
      ownerId: args.ownerId,
      name,
      knowledgeFileId: args.knowledgeFileId,
      knowledgeFileName: args.knowledgeFileName,
      knowledgeContentType: args.knowledgeContentType,
      knowledgeText,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("scannables"),
    ownerId: v.id("users"),
    name: v.string(),
    clearKnowledge: v.boolean(),
    knowledgeFileId: v.optional(v.id("_storage")),
    knowledgeFileName: v.optional(v.string()),
    knowledgeContentType: v.optional(v.string()),
    knowledgeText: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scannable = await ctx.db.get(args.id);
    if (!scannable) {
      throw new Error("Agent not found");
    }
    if (scannable.ownerId !== args.ownerId) {
      throw new Error("Not authorized");
    }

    const name = args.name.trim();
    if (!name) {
      throw new Error("Name is required");
    }

    const previousFileId = scannable.knowledgeFileId;

    if (args.knowledgeFileId) {
      if (!args.knowledgeFileName || !args.knowledgeContentType) {
        throw new Error("Knowledge file details are required");
      }

      const extension = assertAllowedKnowledgeFile(args.knowledgeFileName);
      const storedFile = await ctx.db.system.get(args.knowledgeFileId);
      if (!storedFile) {
        throw new Error("Knowledge file was not stored");
      }

      let knowledgeText = args.knowledgeText;
      if (extension === ".pdf") {
        knowledgeText = undefined;
      } else if (knowledgeText && knowledgeText.length > MAX_KNOWLEDGE_TEXT_CHARS) {
        throw new Error("Knowledge file is too large to store as text");
      }

      await ctx.db.replace(args.id, {
        ownerId: scannable.ownerId,
        name,
        knowledgeFileId: args.knowledgeFileId,
        knowledgeFileName: args.knowledgeFileName,
        knowledgeContentType: args.knowledgeContentType,
        knowledgeText,
      });

      if (previousFileId && previousFileId !== args.knowledgeFileId) {
        await ctx.storage.delete(previousFileId);
      }

      return null;
    }

    if (args.clearKnowledge) {
      await ctx.db.replace(args.id, {
        ownerId: scannable.ownerId,
        name,
      });

      if (previousFileId) {
        await ctx.storage.delete(previousFileId);
      }

      return null;
    }

    await ctx.db.patch(args.id, { name });
    return null;
  },
});

export const remove = mutation({
  args: {
    id: v.id("scannables"),
    ownerId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scannable = await ctx.db.get(args.id);
    if (!scannable) {
      throw new Error("Agent not found");
    }
    if (scannable.ownerId !== args.ownerId) {
      throw new Error("Not authorized");
    }

    if (scannable.knowledgeFileId) {
      await ctx.storage.delete(scannable.knowledgeFileId);
    }
    await ctx.db.delete(args.id);
    return null;
  },
});

export const getById = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("scannables"),
      name: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("scannables", args.id);
    if (!normalizedId) {
      return null;
    }

    const scannable = await ctx.db.get(normalizedId);
    if (!scannable) {
      return null;
    }

    return {
      _id: scannable._id,
      name: scannable.name,
    };
  },
});

/**
 * Everything the agent brain needs to speak as this scannable.
 * Public on purpose: the agent page itself is reachable via QR without login.
 */
export const getKnowledge = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("scannables"),
      name: v.string(),
      knowledgeFileName: v.optional(v.string()),
      knowledgeText: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("scannables", args.id);
    if (!normalizedId) {
      return null;
    }

    const scannable = await ctx.db.get(normalizedId);
    if (!scannable) {
      return null;
    }

    return {
      _id: scannable._id,
      name: scannable.name,
      knowledgeFileName: scannable.knowledgeFileName,
      knowledgeText: scannable.knowledgeText,
    };
  },
});

export const listByOwner = query({
  args: { ownerId: v.id("users") },
  handler: async (ctx, args) => {
    const scannables = await ctx.db
      .query("scannables")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .order("desc")
      .collect();

    return await Promise.all(
      scannables.map(async (scannable) => ({
        _id: scannable._id,
        _creationTime: scannable._creationTime,
        name: scannable.name,
        knowledgeFileName: scannable.knowledgeFileName,
        knowledgeFileUrl: scannable.knowledgeFileId
          ? await ctx.storage.getUrl(scannable.knowledgeFileId)
          : null,
      })),
    );
  },
});
