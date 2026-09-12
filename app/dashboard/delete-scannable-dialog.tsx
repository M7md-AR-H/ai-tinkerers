"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ScannableRow } from "@/lib/convex-server";
import Modal from "./modal";
import { deleteScannable } from "./actions";
import { Spinner, TrashIcon } from "./icons";
import { btnDanger, btnGhost } from "./ui";

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
    <Modal title={`Delete ${target.name}?`} description="Its knowledge file is deleted too, and printed QR codes for it will stop working." onClose={onClose}>
      {error && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>
          Cancel
        </button>
        <button onClick={confirm} disabled={busy} className={btnDanger}>
          {busy ? <Spinner /> : <TrashIcon className="h-4 w-4" />}
          {busy ? "Deleting…" : "Delete agent"}
        </button>
      </div>
    </Modal>
  );
}
