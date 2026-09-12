import { mutationGeneric as mutation, queryGeneric as query } from "convex/server";
import type { GenericMutationCtx, GenericDataModel } from "convex/server";
import { v, type GenericId } from "convex/values";
import { assertServer } from "./secret";

const MAX_TEXT = 400_000;
const ALLOWED = [".txt", ".md", ".pdf"];

const fileFields = {
  fileId: v.id("_storage"),
  fileName: v.string(),
  contentType: v.string(),
  text: v.optional(v.string()),
};

type FileInput = { fileId: string; fileName: string; contentType: string; text?: string };
type Ctx = GenericMutationCtx<GenericDataModel>;
type ScannableDoc = {
  _id: GenericId<"scannables">;
  ownerId: string;
  name: string;
  knowledgeFileId?: GenericId<"_storage">;
};

function knowledgeFields(file: FileInput) {
  const lower = file.fileName.toLowerCase();
  if (!ALLOWED.some((ext) => lower.endsWith(ext))) throw new Error("Knowledge file must be .txt, .md or .pdf");
  const isText = !lower.endsWith(".pdf");
  if (isText && file.text && file.text.length > MAX_TEXT) {
    throw new Error("Knowledge text is too long (max 400,000 characters)");
  }
  return {
    knowledgeFileId: file.fileId,
    knowledgeFileName: file.fileName,
    knowledgeContentType: file.contentType,
    knowledgeText: isText ? file.text : undefined,
  };
}

async function ownerId(ctx: Ctx, auth0Id: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth0", (q) => q.eq("auth0Id", auth0Id))
    .unique();
  if (!user) throw new Error("Unknown user");
  return user._id;
}

async function ownedScannable(ctx: Ctx, auth0Id: string, id: string) {
  const owner = await ownerId(ctx, auth0Id);
  const sid = ctx.db.normalizeId("scannables", id);
  const row = sid ? await ctx.db.get(sid) : null;
  if (!row || row.ownerId !== owner) throw new Error("Scannable not found");
  return row as unknown as ScannableDoc;
}

export const generateUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    assertServer(secret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    secret: v.string(),
    auth0Id: v.string(),
    name: v.string(),
    file: v.object(fileFields),
    ambiguous: v.optional(v.object({ key: v.string(), email: v.string() })),
  },
  handler: async (ctx, { secret, auth0Id, name, file, ambiguous }) => {
    assertServer(secret);
    const owner = await ownerId(ctx, auth0Id);
    if (!name.trim()) throw new Error("Name is required");
    const fields = Object.fromEntries(
      Object.entries(knowledgeFields(file)).filter(([, value]) => value !== undefined)
    );
    return await ctx.db.insert("scannables", {
      ownerId: owner,
      name: name.trim(),
      ...fields,
      ...(ambiguous ? { ambiguousKey: ambiguous.key, ambiguousEmail: ambiguous.email } : {}),
    });
  },
});

export const update = mutation({
  args: {
    secret: v.string(),
    auth0Id: v.string(),
    id: v.string(),
    name: v.string(),
    knowledge: v.union(
      v.object({ mode: v.literal("keep") }),
      v.object({ mode: v.literal("clear") }),
      v.object({ mode: v.literal("replace"), ...fileFields })
    ),
  },
  handler: async (ctx, { secret, auth0Id, id, name, knowledge }) => {
    assertServer(secret);
    const row = await ownedScannable(ctx, auth0Id, id);
    const patch: Record<string, unknown> = { name: name.trim() || row.name };
    if (knowledge.mode !== "keep") {
      const replacement =
        knowledge.mode === "replace"
          ? knowledgeFields(knowledge)
          : { knowledgeFileId: undefined, knowledgeFileName: undefined, knowledgeContentType: undefined, knowledgeText: undefined };
      if (row.knowledgeFileId) await ctx.storage.delete(row.knowledgeFileId);
      Object.assign(patch, replacement);
    }
    await ctx.db.patch(row._id, patch);
  },
});

export const remove = mutation({
  args: { secret: v.string(), auth0Id: v.string(), id: v.string() },
  handler: async (ctx, { secret, auth0Id, id }) => {
    assertServer(secret);
    const row = await ownedScannable(ctx, auth0Id, id);
    if (row.knowledgeFileId) await ctx.storage.delete(row.knowledgeFileId);
    await ctx.db.delete(row._id);
  },
});

export const listByOwner = query({
  args: { secret: v.string(), auth0Id: v.string() },
  handler: async (ctx, { secret, auth0Id }) => {
    assertServer(secret);
    const user = await ctx.db
      .query("users")
      .withIndex("by_auth0", (q) => q.eq("auth0Id", auth0Id))
      .unique();
    if (!user) return [];
    const rows = await ctx.db
      .query("scannables")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();
    return await Promise.all(
      rows.map(async (r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        name: r.name,
        knowledgeFileName: r.knowledgeFileName,
        knowledgeContentType: r.knowledgeContentType,
        ambiguousEmail: r.ambiguousEmail,
        hasText: !!r.knowledgeText,
        fileUrl: r.knowledgeFileId ? await ctx.storage.getUrl(r.knowledgeFileId as GenericId<"_storage">) : null,
      }))
    );
  },
});

// Server-only: the agent's Ambiguous key, used to send mail as the agent.
export const getSender = query({
  args: { secret: v.string(), id: v.string() },
  handler: async (ctx, { secret, id }) => {
    assertServer(secret);
    const sid = ctx.db.normalizeId("scannables", id);
    const row = sid ? await ctx.db.get(sid) : null;
    if (!row?.ambiguousKey) return null;
    return { key: row.ambiguousKey as string, email: row.ambiguousEmail as string };
  },
});

// Public on purpose: QR visitors have no account.
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const sid = ctx.db.normalizeId("scannables", id);
    const row = sid ? await ctx.db.get(sid) : null;
    return row ? { id: row._id, name: row.name } : null;
  },
});

// Public on purpose: the chat and voice agents need it for anonymous visitors. Never return ambiguousKey here.
export const getKnowledge = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const sid = ctx.db.normalizeId("scannables", id);
    const row = sid ? await ctx.db.get(sid) : null;
    if (!row) return null;
    return {
      name: row.name,
      knowledgeText: row.knowledgeText,
      knowledgeFileName: row.knowledgeFileName,
      knowledgeContentType: row.knowledgeContentType,
      ambiguousEmail: row.ambiguousEmail,
    };
  },
});
