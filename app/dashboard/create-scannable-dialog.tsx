"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const ALLOWED_EXTENSIONS = [".txt", ".md", ".pdf"];

function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isAllowedKnowledgeFile(file: File) {
  return ALLOWED_EXTENSIONS.includes(fileExtension(file.name));
}

export type ScannableFormTarget = {
  id: Id<"scannables">;
  name: string;
  knowledgeFileName?: string;
};

export function CreateScannableDialog({
  open,
  ownerId,
  scannable,
  onClose,
}: {
  open: boolean;
  ownerId: Id<"users">;
  scannable?: ScannableFormTarget | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.scannables.generateUploadUrl);
  const createScannable = useMutation(api.scannables.create);
  const updateScannable = useMutation(api.scannables.update);
  const isEditing = Boolean(scannable);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [keepExisting, setKeepExisting] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(scannable?.name ?? "");
      setFile(null);
      setKeepExisting(Boolean(scannable?.knowledgeFileName));
      setFileInputKey((key) => key + 1);
      setError(null);
      setSubmitting(false);
      const frame = requestAnimationFrame(() => nameInputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [open, scannable]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, submitting]);

  if (!open) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!isEditing && !file) {
      setError("Upload a .txt, .md, or .pdf knowledge file.");
      return;
    }
    if (file && !isAllowedKnowledgeFile(file)) {
      setError("Knowledge file must be a .txt, .md, or .pdf.");
      return;
    }

    setSubmitting(true);
    try {
      let uploaded:
        | {
            knowledgeFileId: Id<"_storage">;
            knowledgeFileName: string;
            knowledgeContentType: string;
            knowledgeText?: string;
          }
        | undefined;

      if (file) {
        const uploadUrl = await generateUploadUrl();
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Could not upload the knowledge file.");
        }

        const { storageId } = (await uploadResponse.json()) as {
          storageId: Id<"_storage">;
        };
        const extension = fileExtension(file.name);
        uploaded = {
          knowledgeFileId: storageId,
          knowledgeFileName: file.name,
          knowledgeContentType: file.type || "application/octet-stream",
          knowledgeText: extension === ".pdf" ? undefined : await file.text(),
        };
      }

      if (scannable) {
        await updateScannable({
          id: scannable.id,
          ownerId,
          name: trimmedName,
          clearKnowledge: !keepExisting && !uploaded,
          ...uploaded,
        });
      } else if (uploaded) {
        await createScannable({
          ownerId,
          name: trimmedName,
          ...uploaded,
        });
      }

      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : isEditing
            ? "Could not save these changes."
            : "Could not create this agent.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        disabled={submitting}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-black/[.08] bg-white p-6 shadow-xl dark:border-white/[.145] dark:bg-zinc-950"
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {isEditing ? "Edit scannable" : "Create a scannable"}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {isEditing
            ? "Update the name, remove the current knowledge file, and/or add a new one."
            : "Give this agent a name and a knowledge file for its RAG memory."}
        </p>
        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input
              ref={nameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              name="name"
              required
              maxLength={120}
              placeholder="Lobby coffee machine"
              className="h-11 rounded-xl border border-black/[.08] bg-transparent px-3 text-sm font-normal outline-none ring-zinc-400 focus:ring-2 dark:border-white/[.145]"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            Knowledge file
            {isEditing && keepExisting && scannable?.knowledgeFileName ? (
              <div className="flex items-center gap-2 rounded-xl border border-black/[.08] px-3 py-2 dark:border-white/[.145]">
                <span className="min-w-0 flex-1 truncate font-normal">
                  {scannable.knowledgeFileName}
                </span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setKeepExisting(false)}
                  className="shrink-0 text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Remove
                </button>
              </div>
            ) : null}
            {file ? (
              <div className="flex items-center gap-2 rounded-xl border border-black/[.08] px-3 py-2 dark:border-white/[.145]">
                <span className="min-w-0 flex-1 truncate font-normal">
                  {file.name}
                </span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setFile(null);
                    setFileInputKey((key) => key + 1);
                  }}
                  className="shrink-0 text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Remove
                </button>
              </div>
            ) : (
              <input
                key={fileInputKey}
                type="file"
                name="knowledge"
                accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                required={!isEditing}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-zinc-800"
              />
            )}
            <span className="font-normal text-zinc-500">
              {isEditing
                ? "Remove the current file and/or add a .txt, .md, or .pdf."
                : ".txt, .md, or .pdf — stored in Convex for this agent"}
            </span>
          </div>
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-10 rounded-full px-4 text-sm font-medium hover:bg-black/[.04] disabled:opacity-50 dark:hover:bg-white/[.06]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
            >
              {submitting
                ? isEditing
                  ? "Saving…"
                  : "Creating…"
                : isEditing
                  ? "Save changes"
                  : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
