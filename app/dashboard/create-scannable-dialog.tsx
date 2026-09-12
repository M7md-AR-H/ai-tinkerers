"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ScannableRow } from "@/lib/convex-server";
import Modal from "./modal";
import { createScannable, getUploadUrl, updateScannable, type FileInput } from "./actions";
import { CameraIcon, FileIcon, Spinner, UploadIcon } from "./icons";
import { btnGhost, btnPrimary, inputBase } from "./ui";

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

function FileDrop({ file, onFile }: { file: File | null; onFile: (f: File | null) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
        over ? "border-indigo-400 bg-indigo-50" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <input type="file" accept=".txt,.md,.pdf" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file ? (
        <>
          <FileIcon className="h-7 w-7 text-indigo-600" />
          <span className="text-sm font-medium">{file.name}</span>
          <span className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB · click to change</span>
        </>
      ) : (
        <>
          <UploadIcon className="h-7 w-7 text-zinc-400" />
          <span className="text-sm font-medium">Drop a file here, or click to choose</span>
          <span className="text-xs text-zinc-500">.txt and .md are read by the agent · .pdf is stored only</span>
        </>
      )}
    </label>
  );
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
    if (!editing && !file) return setError("Add a knowledge file (.txt, .md or .pdf).");
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

  const modeLabel = { keep: "Keep", replace: "Replace", clear: "Remove" } as const;

  return (
    <Modal
      title={editing ? `Edit ${editing.name}` : "New agent from a file"}
      description={editing ? undefined : "Give it a name and a file describing it. The agent answers only from that file."}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lobby Printer" className={inputBase} autoFocus />
        </label>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Knowledge file</span>
          {editing && hasFile && (
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1">
              {(["keep", "replace", "clear"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-2 py-1.5 font-medium transition ${mode === m ? "bg-white shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
                >
                  {modeLabel[m]}
                </button>
              ))}
            </div>
          )}
          {editing && hasFile && mode === "keep" && (
            <p className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-zinc-600">
              <FileIcon className="h-4 w-4 text-zinc-400" />
              {editing.knowledgeFileName}
            </p>
          )}
          {editing && hasFile && mode === "clear" && (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-amber-800">The agent will have no knowledge until you add a file again.</p>
          )}
          {showPicker && <FileDrop file={file} onFile={setFile} />}
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          {!editing && onUsePhoto ? (
            <button type="button" onClick={onUsePhoto} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline">
              <CameraIcon className="h-4 w-4" />
              No file? Use a photo
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={btnGhost}>
              Cancel
            </button>
            <button disabled={busy} className={btnPrimary}>
              {busy && <Spinner />}
              {busy ? "Saving…" : editing ? "Save changes" : "Create agent"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
