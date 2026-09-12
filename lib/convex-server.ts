import { ConvexHttpClient } from "convex/browser";
import type { User } from "@auth0/nextjs-auth0/types";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }
  return new ConvexHttpClient(url);
}

export type ScannableKnowledge = {
  _id: Id<"scannables">;
  name: string;
  knowledgeFileName?: string;
  knowledgeText?: string;
};

export async function getScannableKnowledge(
  id: string,
): Promise<ScannableKnowledge | null> {
  const client = getConvexClient();
  return await client.query(api.scannables.getKnowledge, { id });
}

export async function ensureConvexUser(user: User): Promise<Id<"users">> {
  const client = getConvexClient();
  return await client.mutation(api.users.upsertByAuth0, {
    auth0Id: user.sub,
    email: user.email,
    name: user.name ?? user.nickname,
  });
}
