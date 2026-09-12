"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const ALLOWED_EXTENSIONS = [".txt", ".md", ".pdf"];
const MAX_TEXT_CHARS = 100_000;
const PHOTO_MAX_EDGE = 1280;
const PHOTO_JPEG_QUALITY = 0.82;

type KnowledgeSource = "write" | "photo" | "upload";

function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function isAllowedKnowledgeFile(file: File) {
  return ALLOWED_EXTENSIONS.includes(fileExtension(file.name));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function textFileName(name: string) {
  return `${slugify(name) || "knowledge"}.txt`;
}

/**
 * Shrinks a photo so it uploads fast and stays cheap for the vision model.
 * Returns a JPEG data URL.
 */
async function photoToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    throw new Error("Could not read that image. Try a JPEG or PNG photo.");
  }

  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not process that image in this browser.");
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY);
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
  if (!open) {
    return null;
  }

  // Keyed so switching between "create" and editing different scannables
  // remounts the form with fresh state instead of resetting it in an effect.
  return (
    <ScannableForm
      key={scannable?.id ?? "new"}
      ownerId={ownerId}
      scannable={scannable}
      onClose={onClose}
    />
  );
}

function ScannableForm({
  ownerId,
  scannable,
  onClose,
}: {
  ownerId: Id<"users">;
  scannable?: ScannableFormTarget | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const generateUploadUrl = useMutation(api.scannables.generateUploadUrl);
  const createScannable = useMutation(api.scannables.create);
  const updateScannable = useMutation(api.scannables.update);
  const isEditing = Boolean(scannable);
  const [name, setName] = useState(scannable?.name ?? "");
  const [source, setSource] = useState<KnowledgeSource>("write");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [keepExisting, setKeepExisting] = useState(
    Boolean(scannable?.knowledgeFileName),
  );
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || analyzing;

  useEffect(() => {
    const frame = requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);

  // Release the photo preview blob URL when it changes or the form unmounts.
  useEffect(() => {
    if (!photo) {
      return;
    }
    const url = photo.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choosePhoto(next: File | null) {
    setError(null);
    setDrafted(false);
    if (!next) {
      setPhoto(null);
      return;
    }
    if (!next.type.startsWith("image/")) {
      setError("Please choose an image.");
      return;
    }
    setPhoto({ file: next, previewUrl: URL.createObjectURL(next) });
  }

  async function analyzePhoto() {
    if (!photo) {
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const image = await photoToDataUrl(photo.file);
      const response = await fetch("/api/describe-object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, hint: name.trim() || undefined }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; name: string; knowledge: string }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !payload || !payload.ok) {
        throw new Error(
          (payload && !payload.ok && payload.error) ||
            "Could not read the photo. Try again or type the details instead.",
        );
      }

      if (!name.trim() && payload.name) {
        setName(payload.name);
      }
      setText(payload.knowledge);
      setDrafted(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read the photo.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function switchSource(next: KnowledgeSource) {
    setError(null);
    setSource(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    const usesText = source === "write" || source === "photo";
    const trimmedText = usesText ? text.trim() : "";

    let knowledgeFile: File | null = null;
    if (usesText && trimmedText) {
      knowledgeFile = new File([trimmedText], textFileName(trimmedName), {
        type: "text/plain",
      });
    } else if (source === "upload" && file) {
      if (!isAllowedKnowledgeFile(file)) {
        setError("Knowledge file must be a .txt, .md, or .pdf.");
        return;
      }
      knowledgeFile = file;
    }

    if (!knowledgeFile) {
      if (!isEditing) {
        setError(
          source === "upload"
            ? "Upload a .txt, .md, or .pdf knowledge file."
            : source === "photo"
              ? photo
                ? "Tap “Fill in with AI” first, or type the details yourself."
                : "Take a photo, or type the details yourself."
              : "Write a few lines about this object so it has something to say.",
        );
        return;
      }
      // Editing: saving with nothing new clears the old knowledge, which is
      // intended — unless a photo is sitting there un-analyzed.
      if (source === "photo" && photo && !drafted) {
        setError("Tap “Fill in with AI” first, or remove the photo.");
        return;
      }
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

      if (knowledgeFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": knowledgeFile.type || "application/octet-stream",
          },
          body: knowledgeFile,
        });

        if (!uploadResponse.ok) {
          throw new Error("Could not upload the knowledge file.");
        }

        const { storageId } = (await uploadResponse.json()) as {
          storageId: Id<"_storage">;
        };
        const extension = fileExtension(knowledgeFile.name);
        uploaded = {
          knowledgeFileId: storageId,
          knowledgeFileName: knowledgeFile.name,
          knowledgeContentType: knowledgeFile.type || "application/octet-stream",
          knowledgeText:
            extension === ".pdf" ? undefined : await knowledgeFile.text(),
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

  const showSourcePicker = !(isEditing && keepExisting && scannable?.knowledgeFileName);
  const showTextarea = source === "write" || (source === "photo" && drafted);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/60"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      >
        <div className="px-6 pt-6">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight">
            {isEditing ? "Edit scannable" : "Create a scannable"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {isEditing
              ? "Update the name, remove the current knowledge, and/or add new knowledge."
              : "Give this agent a name and tell it what it knows. Type it, snap a photo, or upload a file."}
          </p>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-2 pt-5">
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
                className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring"
              />
            </label>

            <div className="flex flex-col gap-2 text-sm font-medium">
              <span>Knowledge</span>

              {isEditing && keepExisting && scannable?.knowledgeFileName ? (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-normal">
                    {scannable.knowledgeFileName}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setKeepExisting(false)}
                    className="shrink-0 text-sm font-medium text-red-400 hover:underline disabled:opacity-50"
                  >
                    Replace
                  </button>
                </div>
              ) : null}

              {showSourcePicker ? (
                <>
                  <div
                    role="tablist"
                    aria-label="Knowledge source"
                    className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-background p-1"
                  >
                    {(
                      [
                        ["write", "Write"],
                        ["photo", "Photo"],
                        ["upload", "Upload file"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={source === value}
                        disabled={busy}
                        onClick={() => switchSource(value)}
                        className={`h-9 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                          source === value
                            ? "bg-white text-[#17171a]"
                            : "text-muted hover:bg-white/[0.06] hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {source === "photo" ? (
                    <div className="flex flex-col gap-2">
                      {photo ? (
                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.previewUrl}
                            alt="Photo of the object"
                            className="max-h-56 w-full rounded-lg object-contain"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                choosePhoto(null);
                                setFileInputKey((key) => key + 1);
                              }}
                              className="text-sm font-medium text-muted hover:text-foreground hover:underline disabled:opacity-50"
                            >
                              Remove photo
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={analyzePhoto}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-[#17171a] hover:bg-zinc-200 disabled:opacity-50"
                            >
                              <SparkleIcon />
                              {analyzing
                                ? "Looking at the photo…"
                                : drafted
                                  ? "Fill in again"
                                  : "Fill in with AI"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center hover:bg-white/[0.03]">
                          <CameraIcon />
                          <span className="text-sm font-medium">
                            Take a photo or choose one
                          </span>
                          <span className="text-xs font-normal text-zinc-500">
                            AI reads the photo and drafts the name and details for you to check.
                          </span>
                          <input
                            key={fileInputKey}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={busy}
                            onChange={(event) =>
                              choosePhoto(event.target.files?.[0] ?? null)
                            }
                            className="sr-only"
                          />
                        </label>
                      )}
                    </div>
                  ) : null}

                  {source === "upload" ? (
                    <div className="flex flex-col gap-1.5">
                      {file ? (
                        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                          <span className="min-w-0 flex-1 truncate font-normal">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setFile(null);
                              setFileInputKey((key) => key + 1);
                            }}
                            className="shrink-0 text-sm font-medium text-red-400 hover:underline disabled:opacity-50"
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
                          disabled={busy}
                          onChange={(event) =>
                            setFile(event.target.files?.[0] ?? null)
                          }
                          className="text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
                        />
                      )}
                      <span className="font-normal text-zinc-500">
                        .txt, .md, or .pdf — stored in Convex for this agent
                      </span>
                    </div>
                  ) : null}

                  {showTextarea ? (
                    <div className="flex flex-col gap-1.5">
                      {source === "photo" && drafted ? (
                        <span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs font-normal text-zinc-300 ring-1 ring-white/8">
                          Drafted by AI from your photo. Check it, fix anything
                          wrong, and fill in the TODO lines.
                        </span>
                      ) : null}
                      <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        name="knowledgeText"
                        rows={source === "photo" ? 10 : 8}
                        maxLength={MAX_TEXT_CHARS}
                        disabled={busy}
                        placeholder={
                          "What is this? How do people use it? Opening hours, rules, common questions, who to contact when something breaks…"
                        }
                        className="min-h-32 resize-y rounded-xl border border-border bg-background px-3 py-2 font-mono text-[13px] font-normal leading-relaxed outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                      />
                      <span className="flex justify-between font-normal text-zinc-500">
                        <span>
                          Saved as{" "}
                          <code className="text-zinc-400">
                            {textFileName(name.trim())}
                          </code>
                        </span>
                        <span className="tabular-nums">
                          {text.length.toLocaleString()} chars
                        </span>
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 px-6 pb-6 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-xl bg-white px-4 text-sm font-medium text-[#17171a] disabled:opacity-50"
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

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-7 w-7 text-muted"
    >
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zM5 16l.9 2.1L8 19l-2.1.9L5 22l-.9-2.1L2 19l2.1-.9zM19 14l1.1 2.4 2.4 1.1-2.4 1.1L19 21l-1.1-2.4-2.4-1.1 2.4-1.1z" />
    </svg>
  );
}
