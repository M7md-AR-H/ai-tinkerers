"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PhotoAnalysis } from "@/lib/photo-agent";
import Modal from "./modal";
import { analyzePhotoAction, createFromPhotoAction } from "./actions";
import { CameraIcon, SparklesIcon, Spinner } from "./icons";
import { btnGhost, btnPrimary, btnSecondary, inputBase } from "./ui";

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

function Steps({ step }: { step: 1 | 2 }) {
  const item = (n: 1 | 2, label: string) => (
    <div className={`flex items-center gap-2 ${step >= n ? "text-zinc-900" : "text-zinc-400"}`}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          step >= n ? "bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white" : "bg-zinc-100"
        }`}
      >
        {n}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-3">
      {item(1, "Photo")}
      <span className={`h-px flex-1 ${step === 2 ? "bg-indigo-300" : "bg-zinc-200"}`} />
      {item(2, "A few details")}
    </div>
  );
}

export default function PhotoScannableDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (agent: { id: string; name: string; email: string | null }) => void;
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
    onCreated({ id: res.id, name: res.name, email: res.email });
  }

  const photoInput = (
    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
  );

  return (
    <Modal title="New agent from a photo" description="I'll work out what it is, then ask what visitors will need to know." onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Steps step={analysis ? 2 : 1} />

        {!analysis && !photo && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-12 text-center transition hover:border-indigo-300 hover:bg-indigo-50/50">
            {photoInput}
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-fuchsia-600 text-white shadow-md">
              <CameraIcon className="h-7 w-7" />
            </span>
            <span className="font-semibold">Take or choose a photo</span>
            <span className="text-sm text-zinc-500">Get the whole object in frame. Labels and model numbers help.</span>
          </label>
        )}

        {!analysis && photo && (
          <>
            <div className="relative overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Your object" className="max-h-72 w-full object-cover" />
              {busy === "analyzing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950/55 text-white backdrop-blur-[2px]">
                  <Spinner className="h-7 w-7" />
                  <span className="text-sm font-medium">Looking at it…</span>
                </div>
              )}
            </div>
            <div className="flex justify-between gap-2">
              <label className={`${btnSecondary} cursor-pointer`}>
                {photoInput}
                Choose another
              </label>
              <button onClick={analyze} disabled={!!busy} className={btnPrimary}>
                <SparklesIcon className="h-4 w-4" />
                Analyze photo
              </button>
            </div>
          </>
        )}

        {analysis && (
          <>
            <div className="flex gap-4 rounded-2xl bg-zinc-50 p-3">
              {photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              )}
              <div className="min-w-0 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-indigo-600">Looks like</p>
                <p className="font-semibold">
                  {analysis.objectType}
                  {analysis.brandModel ? ` · ${analysis.brandModel}` : ""}
                </p>
                <p className="mt-0.5 text-zinc-600">{analysis.description}</p>
              </div>
            </div>
            {analysis.observations.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analysis.observations.slice(0, 5).map((o, i) => (
                  <span key={i} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">
                    {o}
                  </span>
                ))}
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputBase} />
            </label>

            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-medium">A few questions so it can help visitors</p>
                <p className="text-xs text-zinc-500">Skip any you don&apos;t know.</p>
              </div>
              {analysis.questions.map((q, i) => (
                <label key={i} className="flex flex-col gap-1.5 text-sm">
                  <span className="flex gap-2 text-zinc-700">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-500">
                      {i + 1}
                    </span>
                    {q}
                  </span>
                  <textarea
                    rows={2}
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))}
                    placeholder="Your answer"
                    className={`${inputBase} resize-none`}
                  />
                </label>
              ))}
            </div>

            <div className="flex justify-between gap-2">
              <button
                onClick={() => {
                  setAnalysis(null);
                  setPhoto(null);
                }}
                disabled={!!busy}
                className={btnGhost}
              >
                Retake
              </button>
              <button onClick={create} disabled={!!busy || !name.trim()} className={btnPrimary}>
                {busy === "creating" ? <Spinner /> : <SparklesIcon className="h-4 w-4" />}
                {busy === "creating" ? "Giving it a voice and an inbox…" : "Create agent"}
              </button>
            </div>
          </>
        )}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
