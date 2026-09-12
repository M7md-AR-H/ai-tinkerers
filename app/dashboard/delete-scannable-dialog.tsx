"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScannableRow } from "@/lib/convex-server";
import Modal from "./modal";
import { deleteScannable } from "./actions";

export default function DeleteScannableDialog({ target, onClose }: { target: ScannableRow | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!target) return null;

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await deleteScannable(target!._id);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    onClose();
    router.refresh();
  }

  return (
    <Modal title="Delete scannable" onClose={onClose}>
      <p className="text-sm text-zinc-600">
        Delete <span className="font-medium text-zinc-900">{target.name}</span> and its knowledge file? Printed QR codes
        for it will stop working.
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100">
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="rounded-md bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
