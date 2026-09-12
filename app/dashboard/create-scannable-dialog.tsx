"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ScannableRow } from "@/lib/convex-server";
import Modal from "./modal";
import { createScannable, getUploadUrl, updateScannable, type FileInput } from "./actions";

const MAX_TEXT = 400_000;

async function uploadKnowledge(file: File): Promise<FileInput> {
  const lower = file.name.toLowerCase();
  if (![".txt", ".md", ".pdf"].some((ext) => lower.endsWith(ext))) throw new Error("Use a .txt, .md or .pdf file.");
  const isPdf = lower.endsWith(".pdf");
  const text = isPdf ? undefined : await file.text();
  if (text && text.length > MAX_TEXT) throw new Error("That file is too long (max 400,000 characters).");
  const contentType = file.type || (isPdf ? "application/pdf" : lower.endsWith(".md") ? "text/markdown" : "text/plain");

  const upload = await getUploadUrl();
  if (!upload.ok) throw new Error(upload.error);
  const res = await fetch(upload.url, { method: "POST", headers: { "Content-Type": contentType }, body: file });
  if (!res.ok) throw new Error("Upload failed.");
  const { storageId } = (await res.json()) as { storageId: string };
  return { fileId: storageId, fileName: file.name, contentType, ...(text !== undefined ? { text } : {}) };
}

export default function CreateScannableDialog({
  open,
  editing,
  onClose,
  onUsePhoto,
}: {
  open: boolean;
  editing: ScannableRow | null;
  onClose: () => void;
  onUsePhoto?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(editing?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"keep" | "replace" | "clear">(editing?.knowledgeFileName ? "keep" : "replace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const hasFile = !!editing?.knowledgeFileName;
  const showPicker = !editing || !hasFile || mode === "replace";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give it a name.");
    if (!editing && !file) return setError("Attach a knowledge file (.txt, .md or .pdf).");
    if (editing && hasFile && mode === "replace" && !file) return setError("Choose the new file, or keep the current one.");

    setBusy(true);
    try {
      const result = !editing
        ? await createScannable(name, await uploadKnowledge(file!))
        : await updateScannable(
            editing._id,
            name,
            file && (mode === "replace" || !hasFile)
              ? { mode: "replace", ...(await uploadKnowledge(file)) }
              : { mode: mode === "clear" ? "clear" : "keep" }
          );
      if (!result.ok) throw new Error(result.error);
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={editing ? "Edit scannable" : "New scannable"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lobby Printer"
            className="rounded-md border border-zinc-300 px-3 py-2"
            autoFocus
          />
        </label>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Knowledge file</span>
          {editing && hasFile && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(["keep", "replace", "clear"] as const).map((m) => (
                <label key={m} className="flex items-center gap-1.5">
                  <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                  {m === "keep" ? `Keep ${editing.knowledgeFileName}` : m === "replace" ? "Replace" : "Remove"}
                </label>
              ))}
            </div>
          )}
          {showPicker && (
            <input type="file" accept=".txt,.md,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          )}
          <p className="text-xs text-zinc-500">The agent reads .txt and .md files. PDFs are stored but not read yet.</p>
        </div>

        {!editing && onUsePhoto && (
          <button type="button" onClick={onUsePhoto} className="self-start text-sm text-blue-700 hover:underline">
            No file? Start from a photo instead
          </button>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100">
            Cancel
          </button>
          <button disabled={busy} className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Saving…" : editing ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
