"use client";

import { useEffect, useId, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function DeleteScannableDialog({
  open,
  name,
  scannableId,
  ownerId,
  onClose,
}: {
  open: boolean;
  name: string;
  scannableId: Id<"scannables">;
  ownerId: Id<"users">;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  // Mounts fresh each time the dialog opens, so error/submitting state resets
  // without needing an effect.
  return (
    <DeleteScannableForm
      name={name}
      scannableId={scannableId}
      ownerId={ownerId}
      onClose={onClose}
    />
  );
}

function DeleteScannableForm({
  name,
  scannableId,
  ownerId,
  onClose,
}: {
  name: string;
  scannableId: Id<"scannables">;
  ownerId: Id<"users">;
  onClose: () => void;
}) {
  const titleId = useId();
  const removeScannable = useMutation(api.scannables.remove);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  async function handleDelete() {
    setError(null);
    setSubmitting(true);
    try {
      await removeScannable({ id: scannableId, ownerId });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete this agent.",
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
        className="absolute inset-0 bg-black/60"
        disabled={submitting}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          Are you sure?
        </h2>
        <p className="mt-2 text-sm text-muted">
          This will permanently delete {name} and its knowledge file.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-xl px-4 text-sm font-medium text-muted hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="h-10 rounded-xl bg-red-600 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
