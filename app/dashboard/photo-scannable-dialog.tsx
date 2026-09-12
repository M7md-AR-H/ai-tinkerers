"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PhotoAnalysis } from "@/lib/photo-agent";
import Modal from "./modal";
import { analyzePhotoAction, createFromPhotoAction } from "./actions";

// Phone photos are several MB; server actions accept ~1 MB, so shrink before sending.
async function toDataUrl(file: File, maxSide = 1024) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export default function PhotoScannableDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null);
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "analyzing" | "creating">(null);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setAnalysis(null);
    try {
      setPhoto(await toDataUrl(file));
    } catch {
      setError("Couldn't read that image. Try a JPEG or PNG.");
    }
  }

  async function analyze() {
    if (!photo) return;
    setBusy("analyzing");
    setError(null);
    const res = await analyzePhotoAction(photo);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setAnalysis(res.analysis);
    setName(res.analysis.suggestedName);
    setAnswers(res.analysis.questions.map(() => ""));
  }

  async function create() {
    if (!analysis) return;
    setBusy("creating");
    setError(null);
    const qa = analysis.questions.map((question, i) => ({ question, answer: answers[i] ?? "" }));
    const res = await createFromPhotoAction(name, analysis, qa);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    router.refresh();
    onCreated({ id: res.id, name: res.name });
  }

  const primary = "rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50";

  return (
    <Modal title="Create from a photo" onClose={onClose}>
      <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Your object" className={`w-full rounded-lg object-cover ${analysis ? "max-h-32" : "max-h-64"}`} />
        ) : (
          <p className="text-sm text-zinc-600">
            Take or upload a photo of the object. I&apos;ll work out what it is and ask a few questions so its agent knows
            what visitors need.
          </p>
        )}

        {!analysis && (
          <>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0])} />
            <div className="flex justify-end">
              <button onClick={analyze} disabled={!photo || !!busy} className={primary}>
                {busy === "analyzing" ? "Looking at it…" : "Analyze photo"}
              </button>
            </div>
          </>
        )}

        {analysis && (
          <>
            <div className="rounded-lg bg-zinc-50 p-3 text-sm">
              <div className="font-medium">
                Looks like: {analysis.objectType}
                {analysis.brandModel ? ` (${analysis.brandModel})` : ""}
              </div>
              <p className="mt-1 text-zinc-600">{analysis.description}</p>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-zinc-300 px-3 py-2"
              />
            </label>

            {analysis.questions.map((q, i) => (
              <label key={i} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{q}</span>
                <textarea
                  rows={2}
                  value={answers[i] ?? ""}
                  onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                  placeholder="Optional"
                  className="rounded-md border border-zinc-300 px-3 py-2"
                />
              </label>
            ))}

            <div className="flex justify-between gap-2">
              <button
                onClick={() => {
                  setAnalysis(null);
                  setPhoto(null);
                }}
                className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100"
              >
                Retake
              </button>
              <button onClick={create} disabled={!!busy || !name.trim()} className={primary}>
                {busy === "creating" ? "Writing its knowledge…" : "Create agent"}
              </button>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
