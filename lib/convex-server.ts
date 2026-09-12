import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

export type ScannableRow = {
  _id: string;
  _creationTime: number;
  name: string;
  knowledgeFileName?: string;
  knowledgeContentType?: string;
  hasText: boolean;
  fileUrl: string | null;
};

export type Knowledge = {
  name: string;
  knowledgeText?: string;
  knowledgeFileName?: string;
  knowledgeContentType?: string;
};

function client() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` once.");
  return new ConvexHttpClient(url);
}

// Owner-only Convex functions require this; the Convex deployment must hold the same value.
function secret() {
  const s = process.env.CONVEX_SERVER_SECRET;
  if (!s) throw new Error("CONVEX_SERVER_SECRET is not set in .env.local.");
  return s;
}

function defined(args: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
}

// All async so a missing Convex setup surfaces as a rejected promise callers can catch.
export async function ensureConvexUser(user: { sub: string; email?: string; name?: string }) {
  return client().mutation(
    anyApi.users.upsertByAuth0,
    defined({ secret: secret(), auth0Id: user.sub, email: user.email, name: user.name })
  );
}

export async function listScannables(auth0Id: string): Promise<ScannableRow[]> {
  return client().query(anyApi.scannables.listByOwner, { secret: secret(), auth0Id });
}

export async function getKnowledge(id: string): Promise<Knowledge | null> {
  return client().query(anyApi.scannables.getKnowledge, { id });
}

export async function scannableMutation(
  name: "generateUploadUrl" | "create" | "update" | "remove",
  args: Record<string, unknown>
) {
  return client().mutation(anyApi.scannables[name], defined({ secret: secret(), ...args }));
}
