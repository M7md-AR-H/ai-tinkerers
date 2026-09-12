"use server";

import { auth0 } from "@/lib/auth0";
import { scannableMutation } from "@/lib/convex-server";
import { analyzePhoto, PhotoAnalysis, writeKnowledge } from "@/lib/photo-agent";
import { provisionAgent } from "@/lib/ambiguous";

export type FileInput = { fileId: string; fileName: string; contentType: string; text?: string };
export type KnowledgeChange = { mode: "keep" } | { mode: "clear" } | ({ mode: "replace" } & FileInput);
type Result<T extends object> = ({ ok: true } & T) | { ok: false; error: string };

async function ownerSub() {
  const session = await auth0.getSession();
  if (!session) throw new Error("Please sign in again.");
  return session.user.sub;
}

async function attempt<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Each new agent gets its own Ambiguous inbox; if that fails it's still created and uses the workspace address.
async function identityFor(name: string) {
  const identity = await provisionAgent(name);
  return identity ? { key: identity.apiKey, email: identity.email } : undefined;
}

export async function getUploadUrl() {
  return attempt(async () => {
    await ownerSub();
    return { url: (await scannableMutation("generateUploadUrl", {})) as string };
  });
}

export async function createScannable(name: string, file: FileInput) {
  return attempt(async () => {
    const auth0Id = await ownerSub();
    if (!name.trim()) throw new Error("Give it a name.");
    const ambiguous = await identityFor(name.trim());
    await scannableMutation("create", { auth0Id, name, file, ambiguous });
    return { email: ambiguous?.email ?? null };
  });
}

export async function updateScannable(id: string, name: string, knowledge: KnowledgeChange) {
  return attempt(async () => {
    await scannableMutation("update", { auth0Id: await ownerSub(), id, name, knowledge });
    return {};
  });
}

export async function deleteScannable(id: string) {
  return attempt(async () => {
    await scannableMutation("remove", { auth0Id: await ownerSub(), id });
    return {};
  });
}

export async function analyzePhotoAction(dataUrl: string) {
  return attempt(async () => {
    await ownerSub();
    return { analysis: await analyzePhoto(dataUrl) };
  });
}

// Writes a Markdown knowledge file from the photo analysis + answers, stores it, and creates the agent.
export async function createFromPhotoAction(
  name: string,
  analysis: PhotoAnalysis,
  qa: { question: string; answer: string }[]
) {
  return attempt(async () => {
    const auth0Id = await ownerSub();
    const cleanName = name.trim().slice(0, 100);
    if (!cleanName) throw new Error("Give it a name.");
    const answers = qa.slice(0, 5).map((q) => ({ question: q.question.slice(0, 300), answer: q.answer.slice(0, 2000) }));
    const knowledge = await writeKnowledge(cleanName, PhotoAnalysis.parse(analysis), answers);

    const uploadUrl = (await scannableMutation("generateUploadUrl", {})) as string;
    const upload = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "text/markdown" }, body: knowledge });
    if (!upload.ok) throw new Error("Could not store the knowledge file.");
    const { storageId } = (await upload.json()) as { storageId: string };

    const ambiguous = await identityFor(cleanName);
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
    const id = (await scannableMutation("create", {
      auth0Id,
      name: cleanName,
      file: { fileId: storageId, fileName: `${slug}.md`, contentType: "text/markdown", text: knowledge },
      ambiguous,
    })) as string;
    return { id, name: cleanName, email: ambiguous?.email ?? null };
  });
}
